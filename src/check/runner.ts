/** Run every probe once, evaluate every rule, and assemble the report. */
import { META, SEP_URL, SPEC_VERSION } from "../protocol/constants.js";
import { isObject, resultOf, type JsonObject } from "../protocol/jsonrpc.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { describeResponse, sendProbe, type ProbeResponse } from "./http.js";
import { PROBE, runProbes, type CheckContext } from "./probes.js";
import { RULES, evidenceLine, requestSummary, type Category, type Level, type Status } from "./rules.js";
import { computeScore } from "./score.js";

export interface CheckOptions {
  /** Extra headers for every request, for example Authorization. */
  headers?: Record<string, string>;
  /** Per-request time limit, ms. */
  timeoutMs?: number;
  /** How long an SSE stream may stay open after its final response, ms. */
  closeGraceMs?: number;
  /** How long to wait for the first event of a subscriptions/listen stream, ms. */
  firstEventMs?: number;
  /** Fetch implementation; defaults to the global fetch. Tests and the demo pass an in-process one. */
  fetch?: typeof fetch;
  /** Run only these rule ids. */
  only?: string[];
  /** Leave these rule ids out. */
  skip?: string[];
  /** Wait up to this long for the server to accept connections before probing, ms (for CI). */
  waitMs?: number;
  onProbe?: (p: ProbeResponse) => void;
}

export interface RuleResult {
  id: string;
  title: string;
  category: Category;
  level: Level;
  status: Status;
  message: string;
  fix?: string;
  spec: string;
  sep?: string;
  official?: string[];
  evidence?: string[];
}

export type ServerEra = "modern-only" | "dual-era" | "legacy" | "unknown";

export interface CheckReport {
  tool: string;
  version: string;
  spec: string;
  target: string;
  startedAt: string;
  durationMs: number;
  score: number;
  /** No MUST rule failed or was blocked. */
  conformant: boolean;
  /** Set when the check could not reach a verdict (unreachable, or authentication needed). */
  inconclusive?: string;
  summary: Record<Status, number> & { total: number };
  server: {
    name?: string;
    version?: string;
    supportedVersions?: string[];
    capabilities: string[];
    era: ServerEra;
  };
  rules: RuleResult[];
  probes: Array<{ name: string; request: string; response: string; status: number; durationMs: number }>;
}

export function selectRules(only: string[] = [], skip: string[] = []): typeof RULES {
  const known = new Set(RULES.map((r) => r.id));
  const unknown = [...only, ...skip].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`unknown rule id(s): ${unknown.join(", ")}. Run \`statelint rules\` for the list.`);
  return RULES.filter((r) => (only.length === 0 || only.includes(r.id)) && !skip.includes(r.id));
}

function serverInfoOf(ctx: CheckContext): { name?: string; version?: string } {
  for (const name of ctx.order) {
    const result = resultOf(ctx.probes[name]?.response);
    const meta = isObject(result?.["_meta"]) ? (result?.["_meta"] as JsonObject) : undefined;
    const info = meta?.[META.serverInfo];
    if (isObject(info)) {
      return {
        ...(typeof info["name"] === "string" ? { name: info["name"] } : {}),
        ...(typeof info["version"] === "string" ? { version: info["version"] } : {}),
      };
    }
  }
  return {};
}

function eraOf(ctx: CheckContext): ServerEra {
  const init = ctx.probes[PROBE.initialize];
  const initOk = !!init && init.status >= 200 && init.status < 300 && resultOf(init.response) !== undefined;
  if (ctx.baseline.ok) return initOk ? "dual-era" : "modern-only";
  return initOk ? "legacy" : "unknown";
}

/** Poll until the endpoint answers anything over HTTP, or the time is up. */
export async function waitForServer(url: string, fetchImpl: typeof fetch, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const res = await fetchImpl(url, { method: "GET", headers: { Accept: "text/event-stream" }, signal: controller.signal });
      await res.body?.cancel().catch(() => undefined);
      return true;
    } catch {
      // Not up yet.
    } finally {
      clearTimeout(timer);
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function runCheck(url: string, options: CheckOptions = {}): Promise<CheckReport> {
  const rules = selectRules(options.only, options.skip);
  if (options.waitMs && options.waitMs > 0) await waitForServer(url, options.fetch ?? globalThis.fetch, options.waitMs);
  const started = Date.now();
  const sendOpts = {
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? 10_000,
    closeGraceMs: options.closeGraceMs ?? 1_500,
    firstEventMs: options.firstEventMs ?? 3_000,
  };
  const ctx = await runProbes({
    url,
    userHeaders: options.headers ?? {},
    send: (probe) => sendProbe(url, probe, sendOpts),
    closeGraceMs: sendOpts.closeGraceMs,
    onProbe: options.onProbe,
  });

  const results: RuleResult[] = rules.map((rule) => {
    let v;
    try {
      v = rule.evaluate(ctx);
    } catch (err) {
      v = { verdict: "blocked" as const, message: `Internal error while evaluating this rule: ${(err as Error).message}` };
    }
    const status: Status =
      v.verdict === "pass"
        ? "pass"
        : v.verdict === "violation"
          ? rule.level === "must"
            ? "fail"
            : "warn"
          : v.verdict === "partial"
            ? "warn"
            : v.verdict;
    return {
      id: rule.id,
      title: rule.title,
      category: rule.category,
      level: rule.level,
      status,
      message: v.message,
      ...(v.fix && status !== "pass" ? { fix: v.fix } : {}),
      spec: rule.spec,
      ...(rule.sep !== undefined ? { sep: SEP_URL(rule.sep) } : {}),
      ...(rule.official ? { official: rule.official } : {}),
      ...(v.evidence && v.evidence.length > 0 ? { evidence: v.evidence } : {}),
    };
  });

  const summary = { pass: 0, fail: 0, warn: 0, skip: 0, blocked: 0, total: results.length };
  for (const r of results) summary[r.status]++;

  let inconclusive: string | undefined;
  if (ctx.baseline.unreachable) {
    const first = ctx.probes[ctx.order[0] ?? ""];
    inconclusive = `Could not reach ${url}: ${first ? describeResponse(first) : "no response"}.`;
  } else if (!ctx.baseline.ok && ctx.baseline.authRequired) {
    const p = ctx.order.map((n) => ctx.probes[n] as ProbeResponse).find((x) => x.status === 401 || x.status === 403);
    inconclusive = `The server requires authentication (${p ? describeResponse(p) : "HTTP 401"}). Pass a token with --header "Authorization: Bearer <token>".`;
  }

  const caps = ctx.capabilities;
  const discover = ctx.discover;
  const versions = discover?.["supportedVersions"];
  const conformant = !inconclusive && !results.some((r) => r.level === "must" && (r.status === "fail" || r.status === "blocked"));

  return {
    tool: TOOL_NAME,
    version: VERSION,
    spec: SPEC_VERSION,
    target: url,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    score: inconclusive ? 0 : computeScore(results),
    conformant,
    ...(inconclusive ? { inconclusive } : {}),
    summary,
    server: {
      ...serverInfoOf(ctx),
      ...(Array.isArray(versions) ? { supportedVersions: versions.filter((v): v is string => typeof v === "string") } : {}),
      capabilities: (["tools", "prompts", "resources"] as const).filter((k) => caps[k]),
      era: eraOf(ctx),
    },
    rules: results,
    probes: ctx.order.map((n) => {
      const p = ctx.probes[n] as ProbeResponse;
      return { name: p.name, request: requestSummary(p), response: describeResponse(p), status: p.status, durationMs: p.durationMs };
    }),
  };
}

export { evidenceLine };
