/**
 * The probe client: send one HTTP request and record exactly what came back, reading a JSON
 * body or an SSE stream with strict time limits (a long-lived stream never hangs the check).
 */
import { isObject, isResponse, tryParseJson } from "../protocol/jsonrpc.js";
import { SseParser } from "../protocol/sse.js";
const MAX_BODY_TEXT = 4000;
function readWithTimeout(reader, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ timeout: true }), Math.max(0, ms));
        reader.read().then((r) => {
            clearTimeout(timer);
            resolve({ done: r.done, value: r.value });
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
function requestId(probe) {
    const id = probe.body?.["id"];
    return typeof id === "string" || typeof id === "number" ? id : undefined;
}
/** Pick the response for `id`; fall back to the only response-shaped message, if there is one. */
function pickResponse(messages, id) {
    const responses = messages.filter(isResponse);
    const exact = responses.find((m) => m.id === id);
    if (exact)
        return exact;
    return responses.length === 1 ? responses[0] : undefined;
}
export async function sendProbe(url, probe, opts) {
    const started = Date.now();
    const out = {
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
        }
        else {
            const text = await res.text();
            out.bodyText = text.slice(0, MAX_BODY_TEXT);
            if (text.trim() === "") {
                out.transport = "empty";
            }
            else {
                out.transport = out.mediaType === "application/json" ? "json" : "other";
                const parsed = tryParseJson(text);
                if (parsed.ok) {
                    out.messages = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
                    out.response = isResponse(parsed.value) ? parsed.value : pickResponse(out.messages, requestId(probe));
                }
            }
        }
    }
    catch (err) {
        const e = err;
        if (controller.signal.aborted && out.status === 0) {
            out.timedOut = true;
            out.networkError = `no response within ${opts.timeoutMs} ms`;
        }
        else if (out.status === 0) {
            out.networkError = e.cause?.code ? `${e.cause.code}: ${e.cause.message ?? e.message}` : e.message;
        }
        else {
            out.timedOut = controller.signal.aborted;
        }
    }
    finally {
        clearTimeout(overall);
        out.durationMs = Date.now() - started;
    }
    return out;
}
async function readSse(body, probe, out, opts, deadline) {
    const mode = probe.sse ?? "full";
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const id = requestId(probe);
    const info = { events: 0, idFields: 0, parseErrors: 0, matchingResponses: 0, ended: false };
    out.sse = info;
    let raw = "";
    let responseAt;
    const take = (events) => {
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
                if (responseAt === undefined)
                    responseAt = Date.now();
            }
        }
    };
    try {
        if (mode !== "headers-only") {
            for (;;) {
                const now = Date.now();
                let waitMs = deadline - now;
                if (mode === "first-event")
                    waitMs = Math.min(waitMs, opts.firstEventMs);
                if (responseAt !== undefined)
                    waitMs = Math.min(waitMs, responseAt + opts.closeGraceMs - now);
                if (waitMs <= 0)
                    break;
                const r = await readWithTimeout(reader, waitMs);
                if ("timeout" in r)
                    break;
                if (r.done) {
                    take(parser.end());
                    info.ended = true;
                    break;
                }
                const chunk = decoder.decode(r.value, { stream: true });
                if (raw.length < MAX_BODY_TEXT)
                    raw += chunk;
                take(parser.push(chunk));
                if (mode === "first-event" && info.events > 0)
                    break;
            }
        }
    }
    catch {
        // A reset mid-stream is recorded as "not ended".
    }
    finally {
        info.idFields = parser.idFields;
        if (responseAt !== undefined)
            info.closedAfterResponse = info.ended;
        out.bodyText = raw.slice(0, MAX_BODY_TEXT);
        out.response = pickResponse(out.messages, id);
        if (!info.ended)
            await reader.cancel().catch(() => undefined);
    }
}
/** A one-line description of what a probe got back, for messages and evidence. */
export function describeResponse(p) {
    if (p.networkError)
        return p.timedOut ? `no response (${p.networkError})` : `network error (${p.networkError})`;
    const parts = [`HTTP ${p.status}`];
    if (p.transport === "sse")
        parts.push("SSE");
    const e = p.response?.error;
    if (isObject(e)) {
        const code = e.code;
        const message = e.message;
        parts.push(`error ${String(code)}${typeof message === "string" && message ? ` "${truncate(message, 90)}"` : ""}`);
    }
    else if (p.response && isObject(p.response.result)) {
        parts.push("result");
    }
    else if (p.transport === "empty") {
        parts.push("empty body");
    }
    else if (p.bodyText) {
        parts.push(`body ${JSON.stringify(truncate(p.bodyText.trim(), 60))}`);
    }
    return parts.join(", ");
}
export function truncate(s, n) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
