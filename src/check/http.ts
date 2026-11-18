/**
 * The probe client: send one HTTP request and record exactly what came back, reading a JSON
 * body or an SSE stream with strict time limits (a long-lived stream never hangs the check).
 */
import { isObject, isResponse, tryParseJson, type JsonObject, type JsonRpcResponse, type RequestId } from "../protocol/jsonrpc.js";
import { SseParser } from "../protocol/sse.js";

export type SseMode = "full" | "first-event" | "headers-only";

export interface ProbeRequest {
  /** Stable probe name; also the suffix of the JSON-RPC id. */
  name: string;
  httpMethod: "POST" | "GET" | "DELETE";
  headers: Record<string, string>;
  body?: JsonObject;
  /** How much of an SSE response to read. Defaults to "full". */
  sse?: SseMode;
}

export interface SseInfo {
  /** Data events received. */
  events: number;
  /** `id:` fields seen (resumability leftovers). */
  idFields: number;
  /** Events whose data was not JSON. */
  parseErrors: number;
  /** JSON-RPC responses on the stream that answer this request. */
  matchingResponses: number;
  /** True when the stream ended by itself; false when Statelint had to stop reading. */
  ended: boolean;
  /** Whether the stream ended within the grace period after the final response. */
  closedAfterResponse?: boolean;
}

export interface ProbeResponse {
  name: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: JsonObject };
  /** Network failure or timeout before any response; status is 0 then. */
  networkError?: string;
  timedOut: boolean;
  status: number;
  /** Response headers, lower-cased names. */
  headers: Record<string, string>;
  /** Media type of Content-Type, lower-cased, without parameters. */
  mediaType: string;
  transport: "json" | "sse" | "empty" | "other" | "none";
  /** Body text (JSON transport) or the raw stream text read, truncated. */
  bodyText: string;
  /** Every JSON value parsed from the body or from SSE data events. */
  messages: unknown[];
  /** The JSON-RPC response that answers this request, when one arrived. */
  response?: JsonRpcResponse;
  sse?: SseInfo;
  durationMs: number;
}

export interface SendOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  /** How long to wait for an SSE stream to end after its final response. */
  closeGraceMs: number;
  /** How long to wait for the first event in "first-event" mode. */
  firstEventMs: number;
}

const MAX_BODY_TEXT = 4000;

type ReadResult = { done: boolean; value?: Uint8Array } | { timeout: true };

function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<ReadResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timeout: true }), Math.max(0, ms));
    reader.read().then(
      (r) => {
        clearTimeout(timer);
        resolve({ done: r.done, value: r.value });
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function requestId(probe: ProbeRequest): RequestId | undefined {
  const id = probe.body?.["id"];
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

/** Pick the response for `id`; fall back to the only response-shaped message, if there is one. */
function pickResponse(messages: unknown[], id: RequestId | undefined): JsonRpcResponse | undefined {
  const responses = messages.filter(isResponse);
  const exact = responses.find((m) => m.id === id);
  if (exact) return exact;
  return responses.length === 1 ? responses[0] : undefined;
}

export async function sendProbe(url: string, probe: ProbeRequest, opts: SendOptions): Promise<ProbeResponse> {
  const started = Date.now();
  const out: ProbeResponse = {
    name: probe.name,
    request: { method: probe.httpMethod, url, headers: { ...probe.headers }, ...(probe.body ? { body: probe.body } : {}) },
    timedOut: false,
    status: 0,
    headers: {},
    mediaType: "",
    transport: "none",
    bodyText: "",
    messages: [],
    durationMs: 0,
  };
  const controller = new AbortController();
  const deadline = started + opts.timeoutMs;
  const overall = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await opts.fetch(url, {
      method: probe.httpMethod,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: controller.signal,
    });
    out.status = res.status;
    res.headers.forEach((value, key) => {
      out.headers[key.toLowerCase()] = value;
    });
    out.mediaType = (out.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

    if (out.mediaType === "text/event-stream" && res.body) {
      out.transport = "sse";
      await readSse(res.body, probe, out, opts, deadline);
    } else {
      const text = await res.text();
      out.bodyText = text.slice(0, MAX_BODY_TEXT);
      if (text.trim() === "") {
        out.transport = "empty";
      } else {
        out.transport = out.mediaType === "application/json" ? "json" : "other";
        const parsed = tryParseJson(text);
        if (parsed.ok) {
          out.messages = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
          out.response = isResponse(parsed.value) ? parsed.value : pickResponse(out.messages, requestId(probe));
        }
      }
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    if (controller.signal.aborted && out.status === 0) {
      out.timedOut = true;
      out.networkError = `no response within ${opts.timeoutMs} ms`;
    } else if (out.status === 0) {
      out.networkError = e.cause?.code ? `${e.cause.code}: ${e.cause.message ?? e.message}` : e.message;
    } else {
      out.timedOut = controller.signal.aborted;
    }
  } finally {
    clearTimeout(overall);
    out.durationMs = Date.now() - started;
  }
  return out;
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  probe: ProbeRequest,
  out: ProbeResponse,
  opts: SendOptions,
  deadline: number,
): Promise<void> {
  const mode: SseMode = probe.sse ?? "full";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const id = requestId(probe);
  const info: SseInfo = { events: 0, idFields: 0, parseErrors: 0, matchingResponses: 0, ended: false };
  out.sse = info;
  let raw = "";
  let responseAt: number | undefined;

  const take = (events: ReturnType<SseParser["push"]>) => {
    for (const ev of events) {
      info.events++;
      const parsed = tryParseJson(ev.data);
      if (!parsed.ok) {
        info.parseErrors++;
        continue;
      }
      out.messages.push(parsed.value);
      if (isResponse(parsed.value) && (parsed.value.id === id || id === undefined)) {
        info.matchingResponses++;
        if (responseAt === undefined) responseAt = Date.now();
      }
    }
  };

  try {
    if (mode !== "headers-only") {
      for (;;) {
        const now = Date.now();
        let waitMs = deadline - now;
        if (mode === "first-event") waitMs = Math.min(waitMs, opts.firstEventMs);
        if (responseAt !== undefined) waitMs = Math.min(waitMs, responseAt + opts.closeGraceMs - now);
        if (waitMs <= 0) break;
        const r = await readWithTimeout(reader, waitMs);
        if ("timeout" in r) break;
        if (r.done) {
          take(parser.end());
          info.ended = true;
          break;
        }
        const chunk = decoder.decode(r.value, { stream: true });
        if (raw.length < MAX_BODY_TEXT) raw += chunk;
        take(parser.push(chunk));
        if (mode === "first-event" && info.events > 0) break;
      }
    }
  } catch {
    // A reset mid-stream is recorded as "not ended".
  } finally {
    info.idFields = parser.idFields;
    if (responseAt !== undefined) info.closedAfterResponse = info.ended;
    out.bodyText = raw.slice(0, MAX_BODY_TEXT);
    out.response = pickResponse(out.messages, id);
    if (!info.ended) await reader.cancel().catch(() => undefined);
  }
}

/** A one-line description of what a probe got back, for messages and evidence. */
export function describeResponse(p: ProbeResponse): string {
  if (p.networkError) return p.timedOut ? `no response (${p.networkError})` : `network error (${p.networkError})`;
  const parts = [`HTTP ${p.status}`];
  if (p.transport === "sse") parts.push("SSE");
  const e = p.response?.error;
  if (isObject(e)) {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;
    parts.push(`error ${String(code)}${typeof message === "string" && message ? ` "${truncate(message, 90)}"` : ""}`);
  } else if (p.response && isObject(p.response.result)) {
    parts.push("result");
  } else if (p.transport === "empty") {
    parts.push("empty body");
  } else if (p.bodyText) {
    parts.push(`body ${JSON.stringify(truncate(p.bodyText.trim(), 60))}`);
  }
  return parts.join(", ");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
