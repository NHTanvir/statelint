/**
 * The conformance rules. Each one reads probe results from the context, decides, and says
 * how to fix what it found. Levels follow the spec keyword: MUST rules fail, SHOULD rules
 * warn. A rule whose prerequisite failed is "blocked"; one that does not apply is "skip".
 */
import { DRAFT_ERROR_CODE, ERROR_CODE, HEADER, META, RETIRED_ERROR_CODE, SEP_URL, SPEC, SPEC_VERSION, } from "../protocol/constants.js";
import { findXMcpHeaders, sensitiveXMcpHeaders, validateXMcpHeaders } from "../protocol/headers.js";
import { errorOf, isObject, isRequest, resultOf } from "../protocol/jsonrpc.js";
import { describeResponse, truncate } from "./http.js";
import { HEADER_PROBES, LEGACY_PROBES, PROBE, PROBE_ORIGIN, PROBE_SESSION_ID, UNSUPPORTED_VERSION, } from "./probes.js";
export const CATEGORIES = [
    "Stateless core",
    "Header/body agreement (SEP-2243)",
    "Versions and errors",
    "Results and caching",
    "Responses: JSON and SSE",
    "Security",
];
const pass = (message, evidence) => ({ verdict: "pass", message, evidence });
const violation = (message, fix, evidence) => ({ verdict: "violation", message, fix, evidence });
const partial = (message, fix, evidence) => ({ verdict: "partial", message, fix, evidence });
const skip = (message) => ({ verdict: "skip", message });
const blocked = (message) => ({ verdict: "blocked", message });
const SDK_HINT = "On the TypeScript SDK, createMcpHandler from @modelcontextprotocol/server performs this check for you; `statelint migrate <path>` shows how to switch to it.";
function probe(ctx, name) {
    return ctx.probes[name];
}
function needsBaseline(ctx) {
    if (ctx.baseline.ok)
        return undefined;
    if (ctx.baseline.authRequired) {
        return blocked('Blocked: the server requires authentication. Pass a token with --header "Authorization: Bearer <token>".');
    }
    return blocked("Blocked: no 2026-07-28 request succeeded, so this rule could not be checked (see no-handshake).");
}
const SHOWN_HEADERS = ["mcp-protocol-version", "mcp-method", "mcp-name", "mcp-session-id", "origin"];
/** "POST server/discover · MCP-Protocol-Version: 2025-11-25 · Mcp-Method: server/discover". */
export function requestSummary(p) {
    const body = p.request.body;
    const method = typeof body?.["method"] === "string" ? ` ${body["method"]}` : "";
    const lower = new Map(Object.entries(p.request.headers).map(([k, v]) => [k.toLowerCase(), [k, v]]));
    const parts = SHOWN_HEADERS.flatMap((h) => {
        const e = lower.get(h);
        return e ? [`${e[0]}: ${truncate(e[1], 60)}`] : [];
    });
    const params = isObject(body?.["params"]) ? body?.["params"] : undefined;
    const meta = isObject(params?.["_meta"]) ? params?.["_meta"] : undefined;
    const claimed = meta?.[META.protocolVersion];
    if (typeof claimed === "string")
        parts.push(`_meta version ${claimed}`);
    if (meta && !(META.clientCapabilities in meta))
        parts.push("_meta without clientCapabilities");
    return `${p.request.method}${method}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}
export function evidenceLine(p) {
    return `${p.name}: ${requestSummary(p)} → ${describeResponse(p)}`;
}
function ok(p) {
    return !!p && p.status >= 200 && p.status < 300 && resultOf(p.response) !== undefined;
}
function code(p) {
    return errorOf(p?.response)?.code;
}
function draftNote(c) {
    if (c === DRAFT_ERROR_CODE.HeaderMismatch)
        return " -32001 was HeaderMismatch's number in the pre-release drafts; the final 2026-07-28 text renumbered it to -32020.";
    if (c === DRAFT_ERROR_CODE.UnsupportedProtocolVersion)
        return " -32004 was UnsupportedProtocolVersion's number in the pre-release drafts; the final text uses -32022.";
    if (c === DRAFT_ERROR_CODE.MissingRequiredClientCapability)
        return " -32003 was MissingRequiredClientCapability's draft number; the final text uses -32021.";
    return "";
}
const SESSION_SIGNAL = /session|initiali[sz]/i;
/** A header probe must be refused with HTTP 400; anything else is a finding. */
function headerRejection(ctx, name, what) {
    const b = needsBaseline(ctx);
    if (b)
        return b;
    const p = probe(ctx, name);
    if (!p)
        return skip("The probe did not run.");
    if (p.networkError)
        return skip(`The probe got no answer: ${describeResponse(p)}.`);
    if (p.status === 400)
        return pass(`Rejected with ${describeResponse(p)}.`, [evidenceLine(p)]);
    if (ok(p))
        return violation(`${what.accepted} (${describeResponse(p)}).`, what.fix, [evidenceLine(p)]);
    return violation(`Refused, but with ${describeResponse(p)}: header validation failures MUST answer HTTP 400.`, `Answer header validation failures with HTTP 400 Bad Request and a JSON-RPC error with code -32020 (HeaderMismatch). ${SDK_HINT}`, [evidenceLine(p)]);
}
function sseProbes(ctx, includeListen) {
    return ctx.order
        .map((n) => ctx.probes[n])
        .filter((p) => p.transport === "sse" && p.name !== PROBE.get && (includeListen || p.name !== PROBE.listen));
}
function modernResults(ctx) {
    return ctx.order
        .filter((n) => !LEGACY_PROBES.includes(n))
        .map((n) => ctx.probes[n])
        .flatMap((p) => {
        const result = ok(p) ? resultOf(p.response) : undefined;
        return result && p.name !== PROBE.listen ? [{ p, result }] : [];
    });
}
function bodyMethod(p) {
    const m = p.request.body?.["method"];
    return typeof m === "string" ? m : "?";
}
export const RULES = [
    // ───────────────────────────── Stateless core ─────────────────────────────
    {
        id: "no-handshake",
        title: "Serves requests without the initialize handshake",
        how: "Sends server/discover (then tools/list, prompts/list, resources/list) as the very first request, with the per-request _meta envelope and no initialize or session.",
        category: "Stateless core",
        level: "must",
        spec: SPEC.statelessness,
        sep: 2575,
        official: ["server-stateless"],
        evaluate(ctx) {
            if (ctx.baseline.ok) {
                const p = probe(ctx, ctx.baseline.probe ?? PROBE.discover);
                return pass(`Answered ${ctx.baseline.method} with no initialize and no session.`, [evidenceLine(p)]);
            }
            if (ctx.baseline.authRequired) {
                return blocked('Blocked: the server requires authentication. Pass a token with --header "Authorization: Bearer <token>".');
            }
            const tried = ctx.order.map((n) => ctx.probes[n]).filter((p) => !LEGACY_PROBES.includes(p.name) && p.request.method === "POST" && p.name !== PROBE.origin);
            const evidence = tried.map(evidenceLine);
            const sessionish = tried.find((p) => {
                const e = errorOf(p.response);
                return (e && (SESSION_SIGNAL.test(e.message) || e.code === -32000)) || SESSION_SIGNAL.test(p.bodyText);
            });
            const init = probe(ctx, PROBE.initialize);
            const legacy = ok(init) && !!init?.headers["mcp-session-id"];
            if (sessionish || legacy) {
                return violation(`Every request without a session was refused (${describeResponse(sessionish ?? tried[0])})${legacy ? ", while initialize opened a session" : ""}. The server still requires the 2025-11-25 initialize handshake and Mcp-Session-Id.`, "2026-07-28 has no handshake and no sessions: every request carries its protocol version and client capabilities in params._meta. On the TypeScript SDK, replace the StreamableHTTPServerTransport session wiring with createMcpHandler(factory) from @modelcontextprotocol/server, which also keeps serving 2025 clients statelessly. Run `statelint migrate <path>` to find every place to change.", evidence);
            }
            return violation(`No 2026-07-28 request succeeded: server/discover got ${describeResponse(tried[0])}.`, "Make sure the URL is the MCP endpoint, then answer a POST that carries MCP-Protocol-Version: 2026-07-28, Mcp-Method and the per-request _meta envelope without requiring any earlier request.", evidence);
        },
    },
    {
        id: "server-discover",
        title: "Implements server/discover",
        how: "Calls server/discover and checks supportedVersions (a string array that includes 2026-07-28) and capabilities.",
        category: "Stateless core",
        level: "must",
        spec: SPEC.discover,
        sep: 2575,
        official: ["sep-2575-server-implements-discover"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.discover);
            const result = ok(p) ? resultOf(p.response) : undefined;
            if (!result) {
                return violation(`server/discover got ${describeResponse(p)}. Servers MUST implement it.`, `Implement server/discover: return supportedVersions (including "${SPEC_VERSION}"), capabilities, and your identity in _meta["${META.serverInfo}"]. The TypeScript SDK's createMcpHandler answers it for you.`, [evidenceLine(p)]);
            }
            const versions = result["supportedVersions"];
            const problems = [];
            if (!Array.isArray(versions) || versions.some((v) => typeof v !== "string"))
                problems.push("supportedVersions is not an array of strings");
            else if (!versions.includes(SPEC_VERSION))
                problems.push(`supportedVersions ${JSON.stringify(versions)} does not include "${SPEC_VERSION}"`);
            if (!isObject(result["capabilities"]))
                problems.push("capabilities is missing");
            if (problems.length > 0) {
                return violation(`server/discover answered, but ${problems.join(" and ")}.`, `Return supportedVersions as a string array that includes "${SPEC_VERSION}", and a capabilities object.`, [evidenceLine(p)]);
            }
            const caps = Object.keys(result["capabilities"]);
            return pass(`supportedVersions ${JSON.stringify(versions)}; capabilities: ${caps.length ? caps.join(", ") : "none"}.`);
        },
    },
    {
        id: "no-session-id",
        title: "Never issues Mcp-Session-Id on 2026-07-28 responses",
        how: "Looks for an Mcp-Session-Id header on every response to a 2026-07-28 request.",
        category: "Stateless core",
        level: "should",
        spec: SPEC.legacyTraffic,
        sep: 2567,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const offenders = ctx.order
                .filter((n) => !LEGACY_PROBES.includes(n))
                .map((n) => ctx.probes[n])
                .filter((p) => p.headers["mcp-session-id"] !== undefined);
            if (offenders.length === 0)
                return pass("No response carried an Mcp-Session-Id header.");
            return violation(`${offenders.length} response(s) carried Mcp-Session-Id (for example ${offenders[0]?.name}: "${truncate(offenders[0]?.headers["mcp-session-id"] ?? "", 40)}"). 2026-07-28 removed protocol sessions.`, "Stop minting session ids: remove sessionIdGenerator and the onsessioninitialized/transports-map wiring. State that must span calls belongs in explicit handles passed as tool arguments (SEP-2567).", offenders.slice(0, 3).map((p) => `${p.name}: Mcp-Session-Id: ${truncate(p.headers["mcp-session-id"] ?? "", 60)}`));
        },
    },
    {
        id: "session-id-ignored",
        title: "Ignores an Mcp-Session-Id sent by an older client",
        how: "Repeats a working request with Mcp-Session-Id: statelint-probe-not-a-session and expects it to be served normally.",
        category: "Stateless core",
        level: "should",
        spec: SPEC.legacyTraffic,
        sep: 2567,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.sessionId);
            if (ok(p))
                return pass(`A request carrying ${HEADER.sessionId}: ${PROBE_SESSION_ID} was served normally.`);
            return violation(`With ${HEADER.sessionId}: ${PROBE_SESSION_ID} the server answered ${describeResponse(p)}; without it, the same request succeeds. It still routes requests by session.`, "Ignore Mcp-Session-Id on incoming requests (and never echo it). Delete the code that looks transports up by session id: every 2026-07-28 request is self-contained.", [evidenceLine(p)]);
        },
    },
    {
        id: "legacy-methods-405",
        title: "Answers GET and DELETE with 405 Method Not Allowed",
        how: "Sends GET and DELETE to the endpoint and expects 405 Method Not Allowed with Allow: POST.",
        category: "Stateless core",
        level: "should",
        spec: SPEC.legacyTraffic,
        sep: 2575,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const get = probe(ctx, PROBE.get);
            const del = probe(ctx, PROBE.delete);
            if (!get || !del || get.networkError || del.networkError)
                return skip("GET or DELETE got no answer.");
            const bad = [];
            if (get.status !== 405)
                bad.push(`GET got ${describeResponse(get)}${get.transport === "sse" ? " (the 2025-era standalone stream)" : ""}`);
            if (del.status !== 405)
                bad.push(`DELETE got ${describeResponse(del)}`);
            if (bad.length > 0) {
                return violation(`${bad.join("; ")}.`, "Answer GET and DELETE on the MCP endpoint with 405 Method Not Allowed and Allow: POST. Change notifications now flow on a subscriptions/listen POST, and there is no session to delete.", [evidenceLine(get), evidenceLine(del)]);
            }
            const noAllow = [get, del].filter((p) => !/\bPOST\b/i.test(p.headers["allow"] ?? ""));
            if (noAllow.length > 0) {
                return partial("GET and DELETE got 405, but without an Allow header naming POST.", "RFC 9110 requires an Allow header on every 405 response: send Allow: POST.", noAllow.map((p) => `${p.name}: Allow: ${p.headers["allow"] ?? "(missing)"}`));
            }
            return pass("GET and DELETE both got 405 with Allow: POST.");
        },
    },
    {
        id: "initialize-names-versions",
        title: "Tells a legacy initialize which versions it supports",
        how: "Sends a 2025-11-25 initialize (no envelope, no MCP headers) and expects either a successful dual-era answer or an error that names 2026-07-28.",
        category: "Stateless core",
        level: "should",
        spec: SPEC.backwardCompat,
        sep: 2575,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.initialize);
            if (!p || p.networkError)
                return skip("The initialize probe got no answer.");
            const result = ok(p) ? resultOf(p.response) : undefined;
            if (result) {
                return pass(`Dual-era: answered a 2025-11-25 initialize (protocolVersion ${JSON.stringify(result["protocolVersion"])}), which the spec allows alongside 2026-07-28.`);
            }
            const e = errorOf(p.response);
            const text = `${e?.message ?? ""} ${JSON.stringify(e?.data ?? "")} ${p.bodyText}`;
            if (text.includes(SPEC_VERSION))
                return pass(`Rejected the legacy initialize and named the supported versions: ${describeResponse(p)}.`);
            return violation(`A 2025-11-25 client's initialize got ${describeResponse(p)}, which does not say which versions this server speaks.`, `Answer initialize with an UnsupportedProtocolVersionError (-32022) whose data.supported lists "${SPEC_VERSION}" (or name the versions in the message). Legacy clients cannot fall forward, so this message is all their users will see.`, [evidenceLine(p)]);
        },
    },
    // ─────────────────────── Header/body agreement (SEP-2243) ───────────────────────
    {
        id: "version-header-required",
        title: "Rejects a request without MCP-Protocol-Version",
        how: "Sends a valid request without MCP-Protocol-Version and expects HTTP 400.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.versionHeader,
        sep: 2243,
        official: ["sep-2243-server-reject-invalid-headers"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.noVersionHeader);
            if (p.status === 400)
                return pass(`Rejected with ${describeResponse(p)}.`, [evidenceLine(p)]);
            if (ok(p)) {
                return violation(`Served a request that had no MCP-Protocol-Version header as if it were 2026-07-28 (${describeResponse(p)}).`, `Reject any request whose body claims a modern version but has no MCP-Protocol-Version header: HTTP 400 with -32020. Gateways route on this header, so a server that trusts the body alone lets the two disagree. ${SDK_HINT}`, [evidenceLine(p)]);
            }
            const c = code(p);
            if (c === ERROR_CODE.HeaderMismatch || c === DRAFT_ERROR_CODE.HeaderMismatch) {
                return violation(`Refused with ${describeResponse(p)}: header validation failures MUST answer HTTP 400.`, `Answer a missing MCP-Protocol-Version with HTTP 400 Bad Request and -32020. ${SDK_HINT}`, [evidenceLine(p)]);
            }
            return partial(`Refused with ${describeResponse(p)} instead of 400. The spec lets a server treat a header-less request as 2025-03-26 only if it still supports clients older than 2025-06-18.`, "If you do not support pre-2025-06-18 clients, answer a missing MCP-Protocol-Version with HTTP 400 and -32020.", [evidenceLine(p)]);
        },
    },
    {
        id: "version-header-match",
        title: "Rejects an MCP-Protocol-Version that contradicts _meta",
        how: "Sends MCP-Protocol-Version: 2025-11-25 with a 2026-07-28 _meta envelope and expects HTTP 400.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.versionHeader,
        sep: 2575,
        official: ["sep-2575-http-server-header-mismatch-400"],
        evaluate(ctx) {
            return headerRejection(ctx, PROBE.versionMismatch, {
                accepted: "Served a request whose MCP-Protocol-Version header (2025-11-25) contradicts its _meta protocolVersion (2026-07-28)",
                fix: `Compare MCP-Protocol-Version with params._meta["${META.protocolVersion}"] and answer HTTP 400 with -32020 when they differ. Real clients have shipped exactly this mismatch, and a gateway that routes on the header would otherwise disagree with you about the version. ${SDK_HINT}`,
            });
        },
    },
    {
        id: "method-header-required",
        title: "Rejects a request without Mcp-Method",
        how: "Sends a valid request without Mcp-Method and expects HTTP 400.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.standardHeaders,
        sep: 2243,
        official: ["sep-2243-server-reject-invalid-headers"],
        evaluate(ctx) {
            return headerRejection(ctx, PROBE.noMethodHeader, {
                accepted: "Served a request that had no Mcp-Method header",
                fix: `Mcp-Method is required on every request: answer HTTP 400 with -32020 when it is missing. ${SDK_HINT}`,
            });
        },
    },
    {
        id: "method-header-match",
        title: "Rejects an Mcp-Method that does not match the body (case-sensitive)",
        how: "Sends Mcp-Method: tools/list on a server/discover body, and Mcp-Method: SERVER/DISCOVER on a server/discover body, and expects HTTP 400 for both.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.serverValidation,
        sep: 2243,
        official: ["sep-2243-server-reject-invalid-headers"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const mismatch = probe(ctx, PROBE.methodMismatch);
            const kase = probe(ctx, PROBE.methodCase);
            const evidence = [evidenceLine(mismatch), evidenceLine(kase)];
            const problems = [];
            if (ok(mismatch)) {
                problems.push(`Mcp-Method: ${mismatch.request.headers["Mcp-Method"]} on a ${bodyMethod(mismatch)} body was executed as ${bodyMethod(mismatch)} (${describeResponse(mismatch)}): the server follows the body and ignores the header, so a gateway routing on Mcp-Method and the server disagree about what this request is`);
            }
            else if (mismatch.status !== 400) {
                problems.push(`a mismatched Mcp-Method got ${describeResponse(mismatch)} instead of HTTP 400`);
            }
            if (ok(kase)) {
                problems.push(`Mcp-Method: ${kase.request.headers["Mcp-Method"]} was accepted for ${bodyMethod(kase)}: header values are case-sensitive, so this is a mismatch`);
            }
            else if (kase.status !== 400) {
                problems.push(`a case-different Mcp-Method got ${describeResponse(kase)} instead of HTTP 400`);
            }
            if (problems.length === 0)
                return pass("A contradicting Mcp-Method and a case-different one were both rejected with HTTP 400.", evidence);
            return violation(`${problems.join("; ")}.`, `Compare Mcp-Method with the body's method exactly (case-sensitive) before dispatch, and answer HTTP 400 with -32020 on any difference. ${SDK_HINT}`, evidence);
        },
    },
    {
        id: "name-header-required",
        title: "Rejects tools/call, resources/read and prompts/get without Mcp-Name",
        how: "Sends tools/call (or prompts/get, resources/read) for a made-up target without Mcp-Name and expects HTTP 400.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.standardHeaders,
        sep: 2243,
        official: ["sep-2243-server-reject-invalid-headers"],
        evaluate(ctx) {
            const pre = nameProbePrecondition(ctx);
            if (pre)
                return pre;
            return headerRejection(ctx, PROBE.noNameHeader, {
                accepted: `Served ${ctx.named} without an Mcp-Name header and went on to look up the (made-up) target`,
                fix: `Mcp-Name is required on tools/call, resources/read and prompts/get: answer HTTP 400 with -32020 when it is missing. ${SDK_HINT}`,
            });
        },
    },
    {
        id: "name-header-match",
        title: "Rejects an Mcp-Name that does not match params.name or params.uri",
        how: "Sends tools/call, prompts/get and resources/read whose Mcp-Name names a different made-up target than the body and expects HTTP 400 for each.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.serverValidation,
        sep: 2243,
        official: ["sep-2243-server-reject-invalid-headers"],
        evaluate(ctx) {
            const pre = nameProbePrecondition(ctx);
            if (pre)
                return pre;
            const probes = [PROBE.nameMismatchTools, PROBE.nameMismatchPrompts, PROBE.nameMismatchResources]
                .map((n) => probe(ctx, n))
                .filter((p) => !!p && !p.networkError);
            if (probes.length === 0)
                return skip("No Mcp-Name mismatch probe got an answer.");
            const evidence = probes.map(evidenceLine);
            const accepted = probes.filter((p) => p.status !== 400);
            if (accepted.length === 0)
                return pass(`A contradicting Mcp-Name was rejected with HTTP 400 on ${probes.map(bodyMethod).join(", ")}.`, evidence);
            return violation(`${accepted
                .map((p) => `${bodyMethod(p)} with Mcp-Name: ${truncate(p.request.headers["Mcp-Name"] ?? "", 40)} and a different body target got ${describeResponse(p)}`)
                .join("; ")}. The server looked up the body's target and ignored the header, so anything that authorizes or routes on Mcp-Name can be bypassed.`, `Before dispatch, compare Mcp-Name (decoded if it uses =?base64?…?=) with params.name, or params.uri for resources/read, and answer HTTP 400 with -32020 on any difference. ${SDK_HINT}`, evidence);
        },
    },
    {
        id: "name-header-base64",
        title: "Decodes a Base64-sentinel Mcp-Name before comparing",
        how: "Sends a non-ASCII made-up name in the body and its =?base64?…?= form in Mcp-Name and expects it not to be rejected as a mismatch.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.valueEncoding,
        sep: 2243,
        official: ["sep-2243-server-decode-base64"],
        evaluate(ctx) {
            const pre = nameProbePrecondition(ctx);
            if (pre)
                return pre;
            const p = probe(ctx, PROBE.nameBase64);
            if (!p || p.networkError)
                return skip("The Base64 probe got no answer.");
            const c = code(p);
            if (p.status === 400 && (c === ERROR_CODE.HeaderMismatch || c === DRAFT_ERROR_CODE.HeaderMismatch)) {
                return violation(`A correctly encoded Mcp-Name (${truncate(p.request.headers["Mcp-Name"] ?? "", 50)}) was rejected as a mismatch (${describeResponse(p)}): the server compares the raw header instead of the decoded value.`, "When Mcp-Name (or Mcp-Param-{Name}) has the form =?base64?{value}?=, Base64-decode the value as UTF-8 before comparing it with the body. Clients must use this form for names and URIs that are not plain ASCII.", [evidenceLine(p)]);
            }
            return pass(`The decoded name matched the body, so the request went past header validation (${describeResponse(p)}).`, [evidenceLine(p)]);
        },
    },
    {
        id: "header-error-code",
        title: "Uses -32020 HeaderMismatch for every header rejection",
        how: "Checks that every header rejection above carries the JSON-RPC error code -32020 (HeaderMismatch).",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.serverValidation,
        sep: 2243,
        official: ["sep-2243-server-reject-error-code", "sep-2575-http-server-header-mismatch-400"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const rejected = HEADER_PROBES.map((n) => probe(ctx, n)).filter((p) => !!p && p.status === 400);
            if (rejected.length === 0)
                return skip("No header probe was rejected with HTTP 400, so there was no error code to inspect.");
            const wrong = rejected.filter((p) => code(p) !== ERROR_CODE.HeaderMismatch);
            if (wrong.length === 0)
                return pass(`All ${rejected.length} header rejections carried JSON-RPC error -32020.`);
            const codes = [...new Set(wrong.map((p) => code(p)))];
            const noBody = wrong.some((p) => code(p) === undefined);
            return violation(`${wrong.length} of ${rejected.length} header rejections used ${codes.map((c) => (c === undefined ? "no JSON-RPC error body" : String(c))).join(", ")} instead of -32020.${draftNote(codes.find((c) => c !== undefined))}`, `Answer every header validation failure (missing, mismatched or malformed MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Param-*) with HTTP 400 and {"error":{"code":-32020,"message":"Header mismatch: …"}}.${noBody ? " Intermediaries may send a bare 400, but a server that processes the body MUST include the JSON-RPC error." : ""}`, wrong.slice(0, 4).map(evidenceLine));
        },
    },
    {
        id: "x-mcp-header-valid",
        title: "Lists only valid x-mcp-header annotations",
        how: "Validates every x-mcp-header annotation in tools/list: non-empty RFC 9110 token, unique, on a string, integer or boolean parameter reached only through `properties`.",
        category: "Header/body agreement (SEP-2243)",
        level: "must",
        spec: SPEC.xMcpHeader,
        sep: 2243,
        official: ["sep-2243-x-mcp-header-not-empty", "sep-2243-x-mcp-header-charset", "sep-2243-x-mcp-header-unique", "sep-2243-x-mcp-header-primitive-only"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            if (!ctx.capabilities.tools)
                return skip("The server does not offer tools.");
            if (!ok(probe(ctx, PROBE.toolsList1)))
                return skip(`tools/list did not answer: ${describeResponse(probe(ctx, PROBE.toolsList1))}.`);
            const findings = [];
            let annotated = 0;
            for (const tool of ctx.tools) {
                const problems = validateXMcpHeaders(tool["inputSchema"]);
                const name = String(tool["name"]);
                annotated += findXMcpHeaders(tool["inputSchema"]).length;
                for (const pr of problems)
                    findings.push(`${name}: x-mcp-header ${JSON.stringify(pr.header)} at ${pr.pointer} ${pr.reason}`);
            }
            if (findings.length === 0) {
                return pass(annotated === 0 ? "No tool uses x-mcp-header." : `${annotated} x-mcp-header annotation(s) across ${ctx.tools.length} tool(s) are valid.`);
            }
            return violation(`${findings.length} invalid x-mcp-header annotation(s). Conforming Streamable HTTP clients MUST drop these tools from tools/list, so users never see them.`, "Annotate only string, integer or boolean parameters (not number) reached through a chain of `properties` keys, with a non-empty RFC 9110 token that is unique (case-insensitively) within the tool. With zod, use z.int() instead of z.number().", findings.slice(0, 6));
        },
    },
    {
        id: "x-mcp-header-no-secrets",
        title: "Does not mirror secrets or personal data into headers",
        how: "Flags x-mcp-header annotations on parameters named like passwords, keys, tokens, sessions or personal data.",
        category: "Header/body agreement (SEP-2243)",
        level: "should",
        spec: SPEC.xMcpHeader,
        sep: 2243,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            if (!ctx.capabilities.tools || !ok(probe(ctx, PROBE.toolsList1)))
                return skip("No tool list to inspect.");
            const hits = ctx.tools.flatMap((t) => sensitiveXMcpHeaders(t["inputSchema"]).map((a) => `${String(t["name"])}: ${a.path} → Mcp-Param-${String(a.value)}`));
            if (hits.length === 0)
                return pass("No x-mcp-header annotation names a credential or personal data.");
            return violation(`${hits.length} annotated parameter(s) look sensitive: header values are visible to every proxy, load balancer and log on the path.`, "Remove x-mcp-header from passwords, API keys, tokens, session ids and PII (the spec says SHOULD NOT, and Akamai's analysis of the revision calls this out). Keep them in the JSON body.", hits.slice(0, 6));
        },
    },
    // ───────────────────────────── Versions and errors ─────────────────────────────
    {
        id: "unsupported-version",
        title: "Rejects an unknown protocol version with -32022 and the supported list",
        how: "Sends protocol version 1999-01-01 and expects HTTP 400 with -32022, data.supported (including 2026-07-28) and data.requested.",
        category: "Versions and errors",
        level: "must",
        spec: SPEC.versionNegotiation,
        sep: 2575,
        official: ["sep-2575-http-server-unsupported-version-400", "sep-2575-server-unsupported-version-error"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.unsupportedVersion);
            const e = errorOf(p.response);
            const data = isObject(e?.data) ? e?.data : undefined;
            const supported = data?.["supported"];
            const problems = [];
            if (ok(p))
                problems.push(`it was served (${describeResponse(p)})`);
            else {
                if (p.status !== 400)
                    problems.push(`HTTP ${p.status} instead of 400`);
                if (e?.code !== ERROR_CODE.UnsupportedProtocolVersion)
                    problems.push(`error ${e?.code ?? "(none)"} instead of -32022${draftNote(e?.code)}`);
                if (!Array.isArray(supported) || supported.length === 0 || supported.some((v) => typeof v !== "string"))
                    problems.push("no data.supported list of versions");
                else if (!supported.includes(SPEC_VERSION))
                    problems.push(`data.supported ${JSON.stringify(supported)} omits "${SPEC_VERSION}"`);
                if (data?.["requested"] !== UNSUPPORTED_VERSION)
                    problems.push(`data.requested is ${JSON.stringify(data?.["requested"])} instead of "${UNSUPPORTED_VERSION}"`);
            }
            if (problems.length === 0)
                return pass(`Rejected ${UNSUPPORTED_VERSION} with HTTP 400, -32022 and data.supported ${JSON.stringify(supported)}.`);
            return violation(`For protocol version ${UNSUPPORTED_VERSION}: ${problems.join("; ")}.`, `Answer an unsupported version with HTTP 400 and {"code":-32022,"message":"Unsupported protocol version","data":{"supported":["${SPEC_VERSION}"],"requested":"<what the client sent>"}}. Clients pick a version from data.supported and retry.`, [evidenceLine(p)]);
        },
    },
    {
        id: "meta-required",
        title: "Rejects a request whose _meta lacks clientCapabilities",
        how: "Sends a request whose _meta has no clientCapabilities and expects HTTP 400 with -32602.",
        category: "Versions and errors",
        level: "must",
        spec: SPEC.meta,
        sep: 2575,
        official: ["sep-2575-http-server-meta-invalid-400"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.metaMissingCapabilities);
            if (p.status === 400 && code(p) === ERROR_CODE.InvalidParams)
                return pass(`Rejected with ${describeResponse(p)}.`);
            const fix = `io.modelcontextprotocol/protocolVersion and io.modelcontextprotocol/clientCapabilities are required in every request's _meta: answer a request missing either with HTTP 400 and -32602 (Invalid params). Never fall back to capabilities remembered from an earlier request.`;
            if (ok(p))
                return violation(`Served a request whose _meta has no clientCapabilities (${describeResponse(p)}).`, fix, [evidenceLine(p)]);
            return violation(`A request missing clientCapabilities got ${describeResponse(p)}; it MUST be HTTP 400 with -32602.`, fix, [evidenceLine(p)]);
        },
    },
    {
        id: "unknown-method-404",
        title: "Answers an unknown method with 404 and -32601",
        how: "Calls statelint/probe-unknown-method and expects HTTP 404 with -32601.",
        category: "Versions and errors",
        level: "must",
        spec: SPEC.versionHeader,
        sep: 2575,
        official: ["sep-2575-http-server-method-not-found-404"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.unknownMethod);
            const c = code(p);
            if (p.status === 404 && c === ERROR_CODE.MethodNotFound)
                return pass(`Answered ${describeResponse(p)}.`);
            const fix = "Answer a method you do not implement with HTTP 404 and a JSON-RPC error with code -32601. The JSON-RPC body is how clients tell a modern server's 404 apart from a legacy HTTP+SSE server that has no such endpoint.";
            if (c === ERROR_CODE.MethodNotFound) {
                return violation(`Answered the unknown method in-band with HTTP ${p.status} (${describeResponse(p)}); the status MUST be 404.`, fix, [evidenceLine(p)]);
            }
            return violation(`An unknown method got ${describeResponse(p)}.`, fix, [evidenceLine(p)]);
        },
    },
    {
        id: "error-id-echo",
        title: "Error responses carry the request's id",
        how: "Checks that every error response to a request carries that request's JSON-RPC id.",
        category: "Versions and errors",
        level: "must",
        spec: `${SPEC.results.replace("#result-responses", "#error-responses")}`,
        sep: 2575,
        official: ["sep-2575-http-server-error-jsonrpc-id"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const errors = ctx.order
                .map((n) => ctx.probes[n])
                .filter((p) => p.request.body && errorOf(p.response) && p.name !== PROBE.origin);
            if (errors.length === 0)
                return skip("No error response to inspect.");
            const wrong = errors.filter((p) => p.response?.id !== p.request.body?.["id"]);
            if (wrong.length === 0)
                return pass(`All ${errors.length} error responses echoed the request id.`);
            return violation(`${wrong.length} of ${errors.length} error responses did not echo the request id (for example ${wrong[0]?.name} got id ${JSON.stringify(wrong[0]?.response?.id)} for ${JSON.stringify(wrong[0]?.request.body?.["id"])}).`, "Copy the request's id into every error response. Only an error for a request whose id could not be read (for example invalid JSON) may use null.", wrong.slice(0, 4).map((p) => `${p.name}: sent id ${JSON.stringify(p.request.body?.["id"])} → got id ${JSON.stringify(p.response?.id)}`));
        },
    },
    {
        id: "resource-not-found-code",
        title: "Reports a missing resource with -32602, not the retired -32002",
        how: "Reads statelint://probe/does-not-exist and expects error -32602, not the retired -32002 or an empty contents array.",
        category: "Versions and errors",
        level: "must",
        spec: SPEC.resourceErrors,
        sep: 2164,
        official: ["sep-2164-resource-not-found"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            if (!ctx.capabilities.resources)
                return skip("The server does not offer resources.");
            const p = probe(ctx, PROBE.resourceMissing);
            if (!p || p.networkError)
                return skip("The missing-resource probe got no answer.");
            const c = code(p);
            if (c === ERROR_CODE.InvalidParams)
                return pass(`A missing resource got ${describeResponse(p)}.`);
            const result = resultOf(p.response);
            if (result && Array.isArray(result["contents"]) && result["contents"].length === 0) {
                return violation("A missing resource was answered with an empty contents array, which servers MUST NOT do (it is ambiguous with an empty resource).", "Answer resources/read for a resource that does not exist with a JSON-RPC error, code -32602.", [evidenceLine(p)]);
            }
            if (c === RETIRED_ERROR_CODE.ResourceNotFound) {
                return violation("A missing resource got -32002, the 2025-11-25 code that 2026-07-28 implementations MUST NOT emit.", "Use -32602 (Invalid params) for resource not found (SEP-2164). Clients that match on the literal -32002 should accept both while they migrate.", [evidenceLine(p)]);
            }
            return violation(`A missing resource got ${describeResponse(p)}.`, "Answer resources/read for a resource that does not exist with a JSON-RPC error, code -32602.", [evidenceLine(p)]);
        },
    },
    // ───────────────────────────── Results and caching ─────────────────────────────
    {
        id: "result-type",
        title: "Every result carries resultType",
        how: "Checks that every result carries resultType, and that discovery and list results use \"complete\".",
        category: "Results and caching",
        level: "must",
        spec: SPEC.results,
        sep: 2322,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const results = modernResults(ctx);
            if (results.length === 0)
                return skip("No result to inspect.");
            const missing = results.filter(({ result }) => typeof result["resultType"] !== "string");
            const notComplete = results.filter(({ result }) => typeof result["resultType"] === "string" && result["resultType"] !== "complete");
            if (missing.length === 0 && notComplete.length === 0)
                return pass(`All ${results.length} results carried resultType "complete".`);
            const lines = [
                ...missing.map(({ p }) => `${p.name} (${bodyMethod(p)}): no resultType`),
                ...notComplete.map(({ p, result }) => `${p.name} (${bodyMethod(p)}): resultType ${JSON.stringify(result["resultType"])}`),
            ];
            return violation(missing.length > 0
                ? `${missing.length} of ${results.length} results had no resultType. Results MUST include it in 2026-07-28.`
                : `Discovery and list results used resultType ${JSON.stringify(notComplete[0]?.result["resultType"])}: only tools/call, resources/read and prompts/get may return "input_required".`, 'Add resultType: "complete" to every final result ("input_required" is only for tools/call, resources/read and prompts/get under Multi Round-Trip Requests). The TypeScript SDK v2 adds it when it serves 2026-07-28.', lines.slice(0, 6));
        },
    },
    {
        id: "cache-hints",
        title: "Discovery and list results carry ttlMs and cacheScope",
        how: "Checks ttlMs (integer >= 0) and cacheScope (\"public\" or \"private\") on server/discover, tools/list, prompts/list, resources/list and resources/templates/list results.",
        category: "Results and caching",
        level: "must",
        spec: SPEC.caching,
        sep: 2549,
        official: [
            "sep-2549-tools-list-caching-hints",
            "sep-2549-prompts-list-caching-hints",
            "sep-2549-resources-list-caching-hints",
            "sep-2549-resources-templates-list-caching-hints",
            "sep-2549-ttl-non-negative",
            "sep-2549-cache-scope-valid",
        ],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const names = [PROBE.discover, PROBE.toolsList1, PROBE.promptsList, PROBE.resourcesList, PROBE.templatesList];
            const checked = [];
            const problems = [];
            for (const n of names) {
                const p = probe(ctx, n);
                const result = ok(p) ? resultOf(p?.response) : undefined;
                if (!p || !result || result["resultType"] === "input_required")
                    continue;
                checked.push(bodyMethod(p));
                const ttl = result["ttlMs"];
                const scope = result["cacheScope"];
                if (ttl === undefined)
                    problems.push(`${bodyMethod(p)}: no ttlMs`);
                else if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 0)
                    problems.push(`${bodyMethod(p)}: ttlMs ${JSON.stringify(ttl)} is not an integer >= 0`);
                if (scope === undefined)
                    problems.push(`${bodyMethod(p)}: no cacheScope`);
                else if (scope !== "public" && scope !== "private")
                    problems.push(`${bodyMethod(p)}: cacheScope ${JSON.stringify(scope)} is not "public" or "private"`);
            }
            if (checked.length === 0)
                return skip("No discovery or list result to inspect.");
            if (problems.length === 0)
                return pass(`ttlMs and cacheScope present and valid on ${checked.join(", ")}.`);
            return violation(`${problems.length} caching problem(s) on ${checked.length} result(s).`, 'Add ttlMs (integer milliseconds, >= 0; 0 means "immediately stale") and cacheScope ("public" for data that is the same for every caller, "private" otherwise) to server/discover, tools/list, prompts/list, resources/list, resources/templates/list and resources/read results. The TypeScript SDK defaults to ttlMs 0 and "private"; set ServerOptions.cacheHints for real values.', problems.slice(0, 8));
        },
    },
    {
        id: "server-info",
        title: "Identifies itself in each result's _meta",
        how: "Checks _meta[\"io.modelcontextprotocol/serverInfo\"] with a name and version on every result.",
        category: "Results and caching",
        level: "should",
        spec: SPEC.meta,
        sep: 2575,
        official: ["sep-2575-server-identifies-in-result-meta"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const results = modernResults(ctx);
            if (results.length === 0)
                return skip("No result to inspect.");
            const missing = results.filter(({ result }) => {
                const meta = isObject(result["_meta"]) ? result["_meta"] : undefined;
                const info = meta?.[META.serverInfo];
                return !isObject(info) || typeof info["name"] !== "string" || typeof info["version"] !== "string";
            });
            if (missing.length === 0) {
                const info = (results[0]?.result["_meta"])[META.serverInfo];
                return pass(`Results identify the server as ${String(info["name"])} ${String(info["version"])}.`);
            }
            return violation(`${missing.length} of ${results.length} results had no _meta["${META.serverInfo}"] with a name and version.`, `Put {"name":"…","version":"…"} in _meta["${META.serverInfo}"] on every result. There is no initialize result any more, so this is where clients learn who answered.`, missing.slice(0, 4).map(({ p }) => `${p.name} (${bodyMethod(p)})`));
        },
    },
    {
        id: "tools-order",
        title: "Returns tools/list in a deterministic order",
        how: "Calls tools/list twice and compares the order of the tools.",
        category: "Results and caching",
        level: "should",
        spec: SPEC.toolsOrder,
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const first = resultOf(probe(ctx, PROBE.toolsList1)?.response)?.["tools"];
            const second = resultOf(probe(ctx, PROBE.toolsList2)?.response)?.["tools"];
            if (!Array.isArray(first) || !Array.isArray(second))
                return skip("tools/list was not called twice.");
            if (first.length < 2)
                return skip("Fewer than two tools, so order cannot vary.");
            const names = (list) => list.map((t) => (isObject(t) ? String(t["name"]) : "?"));
            const a = names(first);
            const c = names(second);
            if (a.join("\u0000") === c.join("\u0000"))
                return pass(`Two tools/list calls returned the same ${a.length} tools in the same order.`);
            return violation("Two consecutive tools/list calls returned the tools in a different order.", "Sort tools deterministically (for example by name). Clients cache the list, and a stable order keeps LLM prompt caches warm.", [`first:  ${a.join(", ")}`, `second: ${c.join(", ")}`]);
        },
    },
    // ─────────────────────────── Responses: JSON and SSE ───────────────────────────
    {
        id: "response-content-type",
        title: "Answers with application/json or text/event-stream",
        how: "Checks that every response body is application/json (one JSON-RPC object) or text/event-stream.",
        category: "Responses: JSON and SSE",
        level: "must",
        spec: SPEC.sendingMessages,
        evaluate(ctx) {
            const posts = ctx.order
                .map((n) => ctx.probes[n])
                .filter((p) => p.request.method === "POST" && !p.networkError && p.transport !== "empty" && p.transport !== "none");
            if (posts.length === 0)
                return skip("No POST response had a body.");
            const bad = posts.filter((p) => p.transport === "other" || (p.transport === "json" && Array.isArray(p.messages) && p.messages.length !== 1));
            if (bad.length === 0)
                return pass(`All ${posts.length} responses used application/json or text/event-stream.`);
            return violation(`${bad.length} response(s) used ${[...new Set(bad.map((p) => p.headers["content-type"] ?? "(no Content-Type)"))].join(", ")}.`, "Answer every request with Content-Type: application/json (one JSON-RPC object) or text/event-stream (an SSE stream scoped to the request). Clients are only required to understand those two.", bad.slice(0, 4).map((p) => `${p.name}: Content-Type: ${p.headers["content-type"] ?? "(none)"}`));
        },
    },
    {
        id: "sse-single-response",
        title: "Each SSE response stream carries exactly one response",
        how: "On every SSE response, counts the JSON-RPC responses that answer the request (exactly one) and rejects non-JSON events.",
        category: "Responses: JSON and SSE",
        level: "must",
        spec: SPEC.receivingMessages,
        evaluate(ctx) {
            const streams = sseProbes(ctx, false);
            if (streams.length === 0)
                return skip("Every probe was answered with a single JSON object, so no SSE stream was inspected.");
            const bad = streams.filter((p) => p.sse && (p.sse.matchingResponses !== 1 || p.sse.parseErrors > 0));
            if (bad.length === 0)
                return pass(`${streams.length} SSE stream(s) each carried exactly one JSON-RPC response.`);
            return violation(`${bad.length} SSE stream(s) were malformed: ${bad
                .map((p) => `${p.name} had ${p.sse?.matchingResponses ?? 0} response(s)${p.sse?.parseErrors ? ` and ${p.sse.parseErrors} non-JSON event(s)` : ""}`)
                .join("; ")}.`, "Send each request's final JSON-RPC response exactly once, as the last event on the stream, and put only JSON-RPC messages in data fields.", bad.slice(0, 4).map(evidenceLine));
        },
    },
    {
        id: "sse-no-server-requests",
        title: "Sends no server-to-client requests on SSE streams",
        how: "Looks for JSON-RPC requests (a method and an id) on every SSE stream, including subscriptions/listen.",
        category: "Responses: JSON and SSE",
        level: "must",
        spec: SPEC.receivingMessages,
        sep: 2322,
        official: ["sep-2575-http-server-no-independent-requests-on-stream"],
        evaluate(ctx) {
            const streams = sseProbes(ctx, true);
            if (streams.length === 0)
                return skip("No SSE stream was inspected.");
            const hits = streams.flatMap((p) => p.messages.filter(isRequest).map((m) => `${p.name}: ${m.method} (id ${JSON.stringify(m.id)})`));
            if (hits.length === 0)
                return pass(`No JSON-RPC request appeared on ${streams.length} SSE stream(s).`);
            return violation(`The server sent ${hits.length} JSON-RPC request(s) on response streams. 2026-07-28 removed server-initiated requests.`, 'Ask for client input with Multi Round-Trip Requests instead: return resultType "input_required" with inputRequests from tools/call, prompts/get or resources/read, and the client retries with inputResponses. On the TypeScript SDK, replace ctx.mcpReq.elicitInput / requestSampling with return inputRequired({ … }).', hits.slice(0, 4));
        },
    },
    {
        id: "sse-no-unrequested-logs",
        title: "Sends notifications/message only when the request set a logLevel",
        how: "Looks for notifications/message on every SSE stream; none of Statelint's requests sets a logLevel.",
        category: "Responses: JSON and SSE",
        level: "must",
        spec: SPEC.logging,
        sep: 2575,
        official: ["sep-2575-server-no-log-without-loglevel"],
        evaluate(ctx) {
            const streams = sseProbes(ctx, true);
            if (streams.length === 0)
                return skip("No SSE stream was inspected.");
            const hits = streams.flatMap((p) => p.messages.filter((m) => isObject(m) && m["method"] === "notifications/message" && !("id" in m)).map(() => p.name));
            if (hits.length === 0)
                return pass("No log notification appeared; Statelint's requests never set a logLevel.");
            return violation(`${hits.length} notifications/message were sent for requests that did not set io.modelcontextprotocol/logLevel.`, `Emit notifications/message only for requests whose _meta carries "${META.logLevel}", at or above that level, and only on that request's own stream. Logging is deprecated in 2026-07-28 (SEP-2577): prefer stderr or OpenTelemetry.`, [...new Set(hits)].slice(0, 4));
        },
    },
    {
        id: "sse-closes",
        title: "Closes the SSE stream after the final response",
        how: "Waits a grace period (1500 ms by default) after the final response and checks that the stream ended.",
        category: "Responses: JSON and SSE",
        level: "should",
        spec: SPEC.receivingMessages,
        evaluate(ctx) {
            const streams = sseProbes(ctx, false).filter((p) => p.sse && p.sse.matchingResponses > 0);
            if (streams.length === 0)
                return skip("No SSE response stream was inspected.");
            const open = streams.filter((p) => p.sse?.closedAfterResponse === false);
            if (open.length === 0)
                return pass(`${streams.length} SSE stream(s) ended right after the final response.`);
            return violation(`${open.length} SSE stream(s) stayed open more than ${ctx.closeGraceMs} ms after the final response.`, "End the response stream once the final JSON-RPC response is written. Each stream belongs to one request; long-lived notification streams are subscriptions/listen's job.", open.slice(0, 4).map((p) => `${p.name}: still open ${ctx.closeGraceMs} ms after the response`));
        },
    },
    {
        id: "sse-x-accel-buffering",
        title: "Starts SSE streams with X-Accel-Buffering: no",
        how: "Checks X-Accel-Buffering: no on every SSE response, including subscriptions/listen.",
        category: "Responses: JSON and SSE",
        level: "should",
        spec: SPEC.receivingMessages,
        evaluate(ctx) {
            const streams = sseProbes(ctx, true);
            if (streams.length === 0)
                return skip("No SSE stream was inspected.");
            const missing = streams.filter((p) => (p.headers["x-accel-buffering"] ?? "").toLowerCase() !== "no");
            if (missing.length === 0)
                return pass(`All ${streams.length} SSE stream(s) sent X-Accel-Buffering: no.`);
            return violation(`${missing.length} of ${streams.length} SSE stream(s) had no X-Accel-Buffering: no header.`, "Send X-Accel-Buffering: no when you start an SSE response so reverse proxies such as nginx pass events through immediately instead of buffering them.", missing.slice(0, 4).map((p) => `${p.name}: X-Accel-Buffering: ${p.headers["x-accel-buffering"] ?? "(missing)"}`));
        },
    },
    {
        id: "subscriptions-listen",
        title: "Opens subscriptions/listen with the acknowledgment first",
        how: "Opens subscriptions/listen for the advertised change notifications and expects notifications/subscriptions/acknowledged first, tagged with the request id.",
        category: "Responses: JSON and SSE",
        level: "must",
        spec: SPEC.subscriptions,
        sep: 2575,
        official: ["sep-2575-server-sends-subscription-ack", "sep-2575-server-tags-subscription-id", "sep-2575-server-honors-notification-filter"],
        evaluate(ctx) {
            const b = needsBaseline(ctx);
            if (b)
                return b;
            const p = probe(ctx, PROBE.listen);
            if (!p)
                return skip("The server advertises no listChanged or subscribe capability.");
            if (p.networkError)
                return skip(`subscriptions/listen got no answer: ${describeResponse(p)}.`);
            const id = p.request.body?.["id"];
            const params = isObject(p.request.body?.["params"]) ? p.request.body?.["params"] : {};
            const requested = isObject(params["notifications"]) ? params["notifications"] : {};
            if (p.transport !== "sse") {
                return violation(`The server advertises change notifications, but subscriptions/listen got ${describeResponse(p)}. It replaces the removed GET stream.`, "Implement subscriptions/listen: answer with an SSE stream whose first message is notifications/subscriptions/acknowledged, then deliver only the notification types the client asked for.", [evidenceLine(p)]);
            }
            const first = p.messages[0];
            if (!isObject(first) || first["method"] !== "notifications/subscriptions/acknowledged") {
                return violation(`The first message on the listen stream was ${isObject(first) ? JSON.stringify(first["method"] ?? "a non-notification") : "missing"}, not notifications/subscriptions/acknowledged.`, `Send notifications/subscriptions/acknowledged as the first message, with _meta["${META.subscriptionId}"] set to the listen request's id, and nothing before it.`, [evidenceLine(p)]);
            }
            const ackParams = isObject(first["params"]) ? first["params"] : {};
            const meta = isObject(ackParams["_meta"]) ? ackParams["_meta"] : {};
            if (meta[META.subscriptionId] !== id) {
                return violation(`The acknowledgment carried subscriptionId ${JSON.stringify(meta[META.subscriptionId])} instead of the request id ${JSON.stringify(id)}.`, `Set _meta["${META.subscriptionId}"] to the JSON-RPC id of the subscriptions/listen request, on the acknowledgment and on every notification of the stream.`, [evidenceLine(p)]);
            }
            const acked = isObject(ackParams["notifications"]) ? Object.keys(ackParams["notifications"]) : [];
            const extra = acked.filter((k) => !(k in requested));
            if (extra.length > 0) {
                return violation(`The acknowledgment agreed to notification types the client did not ask for: ${extra.join(", ")}.`, "Acknowledge (and deliver) only a subset of the requested notification types.", [evidenceLine(p)]);
            }
            return pass(`Acknowledged ${acked.length ? acked.join(", ") : "the subscription"} with subscriptionId ${JSON.stringify(id)} as the first message.`);
        },
    },
    // ───────────────────────────────── Security ─────────────────────────────────
    {
        id: "origin-validation",
        title: "Refuses requests from an unexpected Origin",
        how: "Sends a request with Origin: https://statelint-probe.invalid and expects 403.",
        category: "Security",
        level: "should",
        spec: SPEC.security,
        official: ["dns-rebinding-protection"],
        evaluate(ctx) {
            const p = probe(ctx, PROBE.origin);
            if (!p || p.networkError)
                return skip("The Origin probe got no answer.");
            if (p.status === 403)
                return pass(`Origin: ${PROBE_ORIGIN} was refused with HTTP 403.`);
            if (!ctx.baseline.ok && !ok(p))
                return skip("The server answered nothing successfully, so the Origin check is inconclusive.");
            if (ok(p)) {
                return violation(`A request with Origin: ${PROBE_ORIGIN} was served (${describeResponse(p)}).`, "Validate Origin on every request and answer 403 when it is not one you expect. On localhost this is what stops DNS rebinding. On the TypeScript SDK, createMcpHandler validates no Host or Origin: mount createMcpExpressApp, or localhostHostValidation() and localhostOriginValidation(), in front of it. A public, token-authenticated API may allow any origin on purpose; then this warning is expected.", [evidenceLine(p)]);
            }
            return pass(`Origin: ${PROBE_ORIGIN} was not served (${describeResponse(p)}).`);
        },
    },
];
/** The Mcp-Name rules need a named method and a control probe that passes validation. */
function nameProbePrecondition(ctx) {
    const b = needsBaseline(ctx);
    if (b)
        return b;
    if (!ctx.named)
        return skip("The server offers no tools, prompts or resources, so nothing carries Mcp-Name.");
    const control = probe(ctx, PROBE.nameControl);
    if (control && control.status === 400 && (code(control) === ERROR_CODE.HeaderMismatch || code(control) === DRAFT_ERROR_CODE.HeaderMismatch)) {
        return blocked(`Blocked: even a matching Mcp-Name was rejected (${describeResponse(control)}), so mismatch results would mean nothing. The server may require headers that are not in the spec.`);
    }
    return undefined;
}
export function ruleById(id) {
    return RULES.find((r) => r.id === id);
}
export function sepLink(n) {
    return n === undefined ? undefined : SEP_URL(n);
}
