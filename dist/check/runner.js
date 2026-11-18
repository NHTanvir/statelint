/** Run every probe once, evaluate every rule, and assemble the report. */
import { META, SEP_URL, SPEC_VERSION } from "../protocol/constants.js";
import { isObject, resultOf } from "../protocol/jsonrpc.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { describeResponse, sendProbe } from "./http.js";
import { PROBE, runProbes } from "./probes.js";
import { RULES, evidenceLine, requestSummary } from "./rules.js";
import { computeScore } from "./score.js";
export function selectRules(only = [], skip = []) {
    const known = new Set(RULES.map((r) => r.id));
    const unknown = [...only, ...skip].filter((id) => !known.has(id));
    if (unknown.length > 0)
        throw new Error(`unknown rule id(s): ${unknown.join(", ")}. Run \`statelint rules\` for the list.`);
    return RULES.filter((r) => (only.length === 0 || only.includes(r.id)) && !skip.includes(r.id));
}
function serverInfoOf(ctx) {
    for (const name of ctx.order) {
        const result = resultOf(ctx.probes[name]?.response);
        const meta = isObject(result?.["_meta"]) ? result?.["_meta"] : undefined;
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
function eraOf(ctx) {
    const init = ctx.probes[PROBE.initialize];
    const initOk = !!init && init.status >= 200 && init.status < 300 && resultOf(init.response) !== undefined;
    if (ctx.baseline.ok)
        return initOk ? "dual-era" : "modern-only";
    return initOk ? "legacy" : "unknown";
}
export async function runCheck(url, options = {}) {
    const rules = selectRules(options.only, options.skip);
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
    const results = rules.map((rule) => {
        let v;
        try {
            v = rule.evaluate(ctx);
        }
        catch (err) {
            v = { verdict: "blocked", message: `Internal error while evaluating this rule: ${err.message}` };
        }
        const status = v.verdict === "pass"
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
    for (const r of results)
        summary[r.status]++;
    let inconclusive;
    if (ctx.baseline.unreachable) {
        const first = ctx.probes[ctx.order[0] ?? ""];
        inconclusive = `Could not reach ${url}: ${first ? describeResponse(first) : "no response"}.`;
    }
    else if (!ctx.baseline.ok && ctx.baseline.authRequired) {
        const p = ctx.order.map((n) => ctx.probes[n]).find((x) => x.status === 401 || x.status === 403);
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
            ...(Array.isArray(versions) ? { supportedVersions: versions.filter((v) => typeof v === "string") } : {}),
            capabilities: ["tools", "prompts", "resources"].filter((k) => caps[k]),
            era: eraOf(ctx),
        },
        rules: results,
        probes: ctx.order.map((n) => {
            const p = ctx.probes[n];
            return { name: p.name, request: requestSummary(p), response: describeResponse(p), status: p.status, durationMs: p.durationMs };
        }),
    };
}
export { evidenceLine };
