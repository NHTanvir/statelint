/**
 * Migration findings: what must change for a 2025-11-25 (stateful) MCP server to serve the
 * stateless 2026-07-28 revision. TypeScript/JavaScript (the official TypeScript SDK) is the
 * deep target; Python and Go get SDK-version and transport checks; the session-header check
 * runs on every language.
 */
import { SPEC } from "../protocol/constants.js";
import { maskComments } from "./lexer.js";
import { isJsLike, languageOf } from "./scan.js";
export const TS_GUIDE = "https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28";
export const TS_UPGRADE = "https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2";
export const TS_HTTP = "https://ts.sdk.modelcontextprotocol.io/v2/serving/http";
export const PY_GUIDE = "https://py.sdk.modelcontextprotocol.io/v2/migration/";
export const GO_RELEASE = "https://github.com/modelcontextprotocol/go-sdk/releases";
/** Every migration rule, for `statelint rules --migrate` and the docs. */
export const MIGRATION_RULES = [
    { id: "sdk-v1", severity: "required", title: "Depends on the v1 TypeScript SDK (@modelcontextprotocol/sdk)" },
    { id: "transport-entry", severity: "required", title: "Hosts the 2025-era StreamableHTTPServerTransport" },
    { id: "session-map", severity: "required", title: "Keeps a map of transports keyed by session id" },
    { id: "session-header", severity: "required", title: "Reads or writes the removed Mcp-Session-Id header" },
    { id: "initialize-routing", severity: "required", title: "Branches on isInitializeRequest()" },
    { id: "session-callbacks", severity: "required", title: "Uses onsessioninitialized / onsessionclosed" },
    { id: "session-state", severity: "required", title: "Keys application state on the session id" },
    { id: "server-to-client-request", severity: "required", title: "Sends elicitation, sampling or roots requests to the client" },
    { id: "url-elicitation", severity: "required", title: "Uses UrlElicitationRequiredError or -32042" },
    { id: "resources-subscribe", severity: "required", title: "Handles resources/subscribe or resources/unsubscribe" },
    { id: "retired-error-code", severity: "required", title: "Emits -32002 for resource not found" },
    { id: "draft-error-code", severity: "required", title: "Uses pre-release draft error codes (-32001, -32003, -32004)" },
    { id: "stdio-entry", severity: "required", title: "Connects a hand-built server to StdioServerTransport" },
    { id: "sse-transport", severity: "required", title: "Serves the deprecated HTTP+SSE transport" },
    { id: "dns-rebinding", severity: "required", title: "Relies on the transport for Host/Origin validation" },
    { id: "x-mcp-header-number", severity: "required", title: "Puts x-mcp-header on a number parameter" },
    { id: "get-delete-routes", severity: "recommended", title: "Serves GET or DELETE on the MCP endpoint" },
    { id: "event-store", severity: "recommended", title: "Configures SSE resumability (eventStore, Last-Event-ID)" },
    { id: "list-changed-push", severity: "recommended", title: "Pushes list-changed notifications from a server instance" },
    { id: "ping-handler", severity: "recommended", title: "Implements or calls the removed ping method" },
    { id: "logging", severity: "recommended", title: "Uses the deprecated logging feature" },
    { id: "tasks", severity: "recommended", title: "Uses the experimental core tasks API" },
    { id: "x-mcp-header-sensitive", severity: "recommended", title: "Mirrors a credential or personal data into a header" },
    { id: "legacy-version-literal", severity: "info", title: "Hard-codes a 2025-era protocol version" },
    { id: "cache-hints", severity: "info", title: "Serves 2026-07-28 with default cache hints only" },
    { id: "py-sdk-v1", severity: "required", title: "Python: depends on mcp v1" },
    { id: "py-fastmcp", severity: "info", title: "Python: uses the v1 FastMCP name" },
    { id: "go-sdk-version", severity: "required", title: "Go: go-sdk older than v1.7.0" },
    { id: "go-stateless", severity: "required", title: "Go: StreamableHTTPOptions without Stateless: true" },
];
function lineAt(text, index) {
    let line = 1;
    for (let i = 0; i < index; i++)
        if (text.charCodeAt(i) === 10)
            line++;
    return line;
}
function* matches(file, masked, re) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(masked)) !== null) {
        yield { file, index: m.index, line: lineAt(masked, m.index), text: m[0], groups: m.slice(1).map((x) => x ?? "") };
        if (m[0].length === 0)
            g.lastIndex++;
    }
}
const SENSITIVE = /(pass(word|wd|phrase)?|secret|token|api[_-]?key|apikey|auth|credential|private[_-]?key|session|cookie|ssn|credit[_-]?card|card[_-]?number|cvv|email|phone)/i;
const TRANSPORT_CLASSES = "(?:Node|WebStandard)?StreamableHTTPServerTransport";
/** Is a Python version spec for `mcp` already on v2? */
export function pythonSpecIsV2(spec) {
    if (spec === "*" || spec === "")
        return undefined;
    if (/(?:>=|==|~=|\^|>)\s*2(?:\.|\b)/.test(spec))
        return true;
    if (/<\s*2(?:\.0)?\b/.test(spec) || /(?:==|~=)\s*1\./.test(spec))
        return false;
    if (/>=\s*1\./.test(spec) && !/</.test(spec))
        return undefined;
    return false;
}
/** Compare Go module versions like v1.6.1 < v1.7.0. Pre-releases sort before their release. */
export function goVersionBelow(version, target) {
    const parse = (v) => {
        const m = /^v(\d+)\.(\d+)\.(\d+)(-.+)?/.exec(v);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? 0 : 1] : [0, 0, 0, 0];
    };
    const a = parse(version);
    const b = parse(target);
    for (let i = 0; i < 4; i++) {
        if (a[i] !== b[i])
            return a[i] < b[i];
    }
    return false;
}
export function detectFindings(project) {
    const out = [];
    const add = (f) => out.push(f);
    // ── Project level: SDK versions ──
    if (project.ts.sdkV1 !== undefined) {
        add({
            rule: "sdk-v1",
            severity: "required",
            file: project.ts.manifests[0],
            message: `Depends on @modelcontextprotocol/sdk ${project.ts.sdkV1}, the v1 line. It serves 2025-era clients only; 2026-07-28 support ships in the v2 packages (@modelcontextprotocol/server 2.x).`,
            fix: "Upgrade first with the official codemod, run at the package root: `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` It renames imports and APIs but does not switch the protocol. Then re-run `statelint migrate` for the stateless entry point.",
            source: TS_UPGRADE,
        });
    }
    if (project.python.mcp !== undefined) {
        const v2 = pythonSpecIsV2(project.python.mcp);
        if (v2 === false) {
            add({
                rule: "py-sdk-v1",
                severity: "required",
                file: project.python.manifests[0],
                message: `Pins the Python SDK as mcp${project.python.mcp === "*" ? "" : ` ${project.python.mcp}`}, the v1 line, which serves 2025-era clients only.`,
                fix: "Move to mcp>=2. FastMCP becomes MCPServer, and a v2 server answers 2026-07-28 and 2025-11-25 from one endpoint.",
                source: PY_GUIDE,
            });
        }
        else if (v2 === undefined) {
            add({
                rule: "py-sdk-v1",
                severity: "info",
                file: project.python.manifests[0],
                message: `Depends on mcp${project.python.mcp === "*" ? " without a version" : ` ${project.python.mcp}`}; it may resolve to v1 or v2.`,
                fix: "Pin mcp>=2 to serve 2026-07-28, and follow the v2 migration guide for the renamed APIs.",
                source: PY_GUIDE,
            });
        }
    }
    if (project.go.goSdk && goVersionBelow(project.go.goSdk, "v1.7.0")) {
        add({
            rule: "go-sdk-version",
            severity: "required",
            file: project.go.manifests[0],
            message: `Uses github.com/modelcontextprotocol/go-sdk ${project.go.goSdk}; 2026-07-28 support arrived in v1.7.0.`,
            fix: "Upgrade: `go get github.com/modelcontextprotocol/go-sdk@latest` (same module path, no v2), then set StreamableHTTPOptions.Stateless = true.",
            source: GO_RELEASE,
        });
    }
    let servesModern = false;
    let hasCacheHints = false;
    for (const file of project.files) {
        const lang = languageOf(file.path);
        if (!lang)
            continue;
        const masked = maskComments(file.text);
        const at = (m, f) => add({ ...f, file: file.path, line: m.line });
        // Language-neutral: the removed session header.
        for (const m of matches(file, masked, /["'`]mcp-session-id["'`]/i)) {
            at(m, {
                rule: "session-header",
                severity: "required",
                message: "Reads or writes the Mcp-Session-Id header, which 2026-07-28 removed along with protocol sessions (SEP-2567).",
                fix: "Delete it. A 2026-07-28 server ignores Mcp-Session-Id from older clients and never sends one; each request carries everything in params._meta.",
                source: SPEC.legacyTraffic,
                ...(isJsLike(file.path) ? { codemod: "http-entry" } : {}),
            });
        }
        if (lang === "python") {
            for (const m of matches(file, masked, /from\s+mcp\.server\.fastmcp\s+import\s+FastMCP|\bFastMCP\s*\(/)) {
                at(m, {
                    rule: "py-fastmcp",
                    severity: "info",
                    message: "Uses FastMCP, the v1 name; in mcp v2 it is MCPServer.",
                    fix: "Rename FastMCP to MCPServer (`from mcp.server import MCPServer`) when you move to mcp>=2.",
                    source: PY_GUIDE,
                });
                break;
            }
            continue;
        }
        if (lang === "go") {
            for (const m of matches(file, masked, /StreamableHTTPOptions\s*\{([^}]*)\}/)) {
                if (/\bStateless\s*:\s*true\b/.test(m.groups[0] ?? ""))
                    continue;
                at(m, {
                    rule: "go-stateless",
                    severity: "required",
                    message: "StreamableHTTPOptions without Stateless: true: the Go SDK only accepts 2026-07-28 when stateless mode is on, so clients negotiate down to 2025-11-25.",
                    fix: "Set Stateless: true in the StreamableHTTPOptions you pass to the handler (go-sdk v1.7.0 or later).",
                    source: "https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/",
                });
            }
            continue;
        }
        if (!isJsLike(file.path))
            continue;
        if (/\bcreateMcpHandler\s*\(|\bserveStdio\s*\(/.test(masked))
            servesModern = true;
        if (/\bcacheHints?\b/.test(masked))
            hasCacheHints = true;
        const hasTransport = new RegExp(`\\b${TRANSPORT_CLASSES}\\b`).test(masked);
        for (const m of matches(file, masked, new RegExp(`\\bnew\\s+(${TRANSPORT_CLASSES})\\s*\\(`))) {
            const window = masked.slice(m.index, m.index + 800);
            const sessionful = /sessionIdGenerator\s*:\s*(?!undefined\b)[^,}\s]/.test(window);
            at(m, {
                rule: "transport-entry",
                severity: "required",
                message: sessionful
                    ? `new ${m.groups[0]}({ sessionIdGenerator: … }) is the 2025-era sessionful transport: it needs initialize first and issues Mcp-Session-Id, so a 2026-07-28 client cannot use this endpoint.`
                    : `new ${m.groups[0]}(…) is the 2025-era transport. Even in stateless mode (sessionIdGenerator: undefined) it speaks only 2025-11-25 and earlier.`,
                fix: "Serve the endpoint with createMcpHandler(() => buildServer()) from @modelcontextprotocol/server, mounted with toNodeHandler from @modelcontextprotocol/node (Express: app.all('/mcp', (req, res) => void node(req, res, req.body))). It serves 2026-07-28 per request and keeps serving 2025 clients statelessly from the same endpoint.",
                source: TS_GUIDE,
                codemod: "http-entry",
            });
        }
        for (const m of matches(file, masked, /\b(?:const|let|var)\s+(\w+)\s*(?::\s*([^=;]+))?=\s*(\{\s*\}|new\s+Map\b[^;\n]*)/)) {
            const [name = "", type = "", init = ""] = m.groups;
            const transporty = /transport/i.test(type) || /transport/i.test(init) || (/transport|session/i.test(name) && hasTransport);
            if (!transporty)
                continue;
            at(m, {
                rule: "session-map",
                severity: "required",
                message: `\`${name}\` stores transports per session. 2026-07-28 has no sessions to look up.`,
                fix: "Delete the map and the code that fills and reads it. Each request is served by a fresh server from your factory.",
                source: SPEC.legacyTraffic,
                codemod: "http-entry",
            });
        }
        for (const m of matches(file, masked, /\bisInitializeRequest\s*\(/)) {
            at(m, {
                rule: "initialize-routing",
                severity: "required",
                message: "Branches on isInitializeRequest(): 2026-07-28 has no initialize request, so this branch never sees a modern client.",
                fix: "Remove the branch. Requests are self-describing; createMcpHandler tells the eras apart from params._meta.",
                source: SPEC.statelessness,
                codemod: "http-entry",
            });
        }
        for (const m of matches(file, masked, /\b(onsessioninitialized|onsessionclosed)\b/)) {
            at(m, {
                rule: "session-callbacks",
                severity: "required",
                message: `${m.groups[0]} only fires for 2025-era sessions.`,
                fix: "Remove it together with the session map.",
                source: SPEC.legacyTraffic,
                codemod: "http-entry",
            });
        }
        for (const m of matches(file, masked, /\b(?:extra|ctx)\s*\.\s*sessionId\b/)) {
            at(m, {
                rule: "session-state",
                severity: "required",
                message: "Keys behaviour or state on the session id. There is no session in 2026-07-28, so this value is undefined for modern clients.",
                fix: "Return an explicit handle from a creation tool (for example { basket_id }) and take it as a tool argument on later calls (spec: Stateful Tools). For multi-step input, carry state in MRTR requestState sealed with createRequestStateCodec.",
                source: SPEC.statefulTools,
            });
        }
        for (const m of matches(file, masked, /\.(elicitInput|createMessage|listRoots|requestSampling)\s*\(|\bsendRequest\s*\(\s*\{\s*method\s*:\s*["'](elicitation\/create|sampling\/createMessage|roots\/list)["']/)) {
            at(m, {
                rule: "server-to-client-request",
                severity: "required",
                message: `${m.groups[0] || m.groups[1]} sends a request from the server to the client. 2026-07-28 removed server-initiated requests.`,
                fix: "Return inputRequired({ inputRequests: { answer: inputRequired.elicit({ … }) } }) from the tools/call, prompts/get or resources/read handler, and read acceptedContent(ctx.mcpReq.inputResponses, 'answer') when the client retries (Multi Round-Trip Requests, SEP-2322). On 2025 connections the SDK's legacy shim turns this into a real request, so one handler serves both eras.",
                source: SPEC.mrtr,
            });
        }
        for (const m of matches(file, masked, /\bUrlElicitationRequiredError\b|(?<![\w.])-32042\b/)) {
            at(m, {
                rule: "url-elicitation",
                severity: "required",
                message: "Uses URL-elicitation-required (-32042), which only existed in 2025-11-25.",
                fix: "Return inputRequired({ inputRequests: { link: inputRequired.elicitUrl({ … }) } }) instead of throwing.",
                source: SPEC.errorCodes,
            });
        }
        for (const m of matches(file, masked, /\b(SubscribeRequestSchema|UnsubscribeRequestSchema)\b|["']resources\/(?:un)?subscribe["']/)) {
            at(m, {
                rule: "resources-subscribe",
                severity: "required",
                message: "Handles resources/subscribe, which 2026-07-28 replaced with subscriptions/listen.",
                fix: "Remove the handler. The SDK entry answers subscriptions/listen itself; publish changes with handler.notify.resourceUpdated(uri).",
                source: SPEC.subscriptions,
            });
        }
        for (const m of matches(file, masked, /(?<![\w.])-\s?32002\b/)) {
            at(m, {
                rule: "retired-error-code",
                severity: "required",
                message: "Uses -32002 for resource not found. Implementations of 2026-07-28 MUST NOT emit it.",
                fix: "Use -32602 (Invalid params) for a missing resource (SEP-2164).",
                source: SPEC.resourceErrors,
                codemod: "error-codes",
            });
        }
        for (const m of matches(file, masked, /^.*(?<![\w.])-3200([134])\b.*$/m)) {
            if (!/HeaderMismatch|MissingRequiredClientCapability|UnsupportedProtocolVersion/i.test(m.text))
                continue;
            const to = { "1": "-32020", "3": "-32021", "4": "-32022" }[m.groups[0]];
            at(m, {
                rule: "draft-error-code",
                severity: "required",
                message: `Uses the pre-release draft code -3200${m.groups[0]}; the final 2026-07-28 text renumbered it to ${to}.`,
                fix: `Use ${to} (or the SDK constant, e.g. ProtocolErrorCode / HEADER_MISMATCH_ERROR_CODE) instead of the literal.`,
                source: SPEC.errorCodes,
                codemod: "error-codes",
            });
        }
        for (const m of matches(file, masked, /\.connect\(\s*new\s+StdioServerTransport\s*\(|\bnew\s+StdioServerTransport\s*\(/)) {
            at(m, {
                rule: "stdio-entry",
                severity: "required",
                message: "A server connected directly to StdioServerTransport keeps speaking the 2025 era, whatever SDK version is installed.",
                fix: "Replace server.connect(new StdioServerTransport()) with serveStdio(() => buildServer()) from @modelcontextprotocol/server/stdio. It serves both eras on one connection.",
                source: TS_GUIDE,
                codemod: "stdio-entry",
            });
            break;
        }
        for (const m of matches(file, masked, /\bSSEServerTransport\b/)) {
            at(m, {
                rule: "sse-transport",
                severity: "required",
                message: "Serves the HTTP+SSE transport from 2024-11-05, Deprecated under SEP-2596. v2 servers never serve it.",
                fix: "Move to Streamable HTTP with createMcpHandler. During the transition, @modelcontextprotocol/server-legacy/sse is a frozen v1 copy (planned for removal in v3).",
                source: SPEC.deprecated,
            });
            break;
        }
        // The TODO that the http-entry codemod leaves behind stays a finding until it is resolved.
        for (const m of matches(file, file.text, /TODO\(statelint\): the old transport validated Host\/Origin/)) {
            at(m, {
                rule: "dns-rebinding",
                severity: "required",
                message: "Statelint switched this endpoint to createMcpHandler and left a TODO: the old transport's Host/Origin validation is not mounted yet.",
                fix: "Mount localhostHostValidation() and localhostOriginValidation() from @modelcontextprotocol/node in front of the handler (or build the app with createMcpExpressApp()), then delete the TODO comment.",
                source: TS_HTTP,
            });
        }
        if (hasTransport) {
            for (const m of matches(file, masked, /\benableDnsRebindingProtection\b|\ballowedHosts\s*:|\ballowedOrigins\s*:/)) {
                at(m, {
                    rule: "dns-rebinding",
                    severity: "required",
                    message: "The transport validated Host/Origin for you. createMcpHandler checks neither, so switching entry points silently drops DNS-rebinding protection.",
                    fix: "Mount validation in front of the handler: createMcpExpressApp() from @modelcontextprotocol/express (on by default for localhost), or localhostHostValidation() and localhostOriginValidation() from @modelcontextprotocol/node. On 0.0.0.0, pass allowedHosts.",
                    source: TS_HTTP,
                });
                break;
            }
        }
        for (const m of matches(file, masked, /["']?x-mcp-header["']?\s*:\s*["']([^"']*)["']/)) {
            const around = masked.slice(Math.max(0, m.index - 220), m.index + 220);
            if (/type\s*:\s*["']number["']|z\s*\.\s*number\s*\(\s*\)/.test(around)) {
                at(m, {
                    rule: "x-mcp-header-number",
                    severity: "required",
                    message: `x-mcp-header "${m.groups[0]}" sits on a number parameter. Conforming clients drop the whole tool from tools/list.`,
                    fix: "Annotate a string, integer or boolean parameter instead (z.int() rather than z.number()), or remove the annotation.",
                    source: SPEC.xMcpHeader,
                });
            }
            const before = masked.slice(Math.max(0, m.index - 120), m.index);
            const prop = /([A-Za-z_$][\w$]*)["']?\s*:\s*(?:\{[^{}]*)?$/.exec(before)?.[1] ?? "";
            if (SENSITIVE.test(m.groups[0] ?? "") || SENSITIVE.test(prop)) {
                at(m, {
                    rule: "x-mcp-header-sensitive",
                    severity: "recommended",
                    message: `Mirrors ${prop ? `\`${prop}\`` : "a parameter"} into Mcp-Param-${m.groups[0]}; header values are visible to every proxy and log on the path.`,
                    fix: "Keep credentials and personal data in the JSON body: remove x-mcp-header from this parameter (the spec says SHOULD NOT).",
                    source: SPEC.xMcpHeader,
                });
            }
        }
        const routes = [...matches(file, masked, /\b(\w+)\.(get|delete)\(\s*(["'`])([^"'`]*)\3/)].filter((m) => /mcp/i.test(m.groups[3] ?? "") && hasTransport);
        for (const m of routes) {
            at(m, {
                rule: "get-delete-routes",
                severity: "recommended",
                message: `${m.groups[1]?.toUpperCase()} ${m.groups[3]} served the 2025-era standalone stream or session termination.`,
                fix: "Drop the route: a 2026-07-28 endpoint answers GET and DELETE with 405 (createMcpHandler does), and change notifications flow on subscriptions/listen.",
                source: SPEC.legacyTraffic,
                codemod: "http-entry",
            });
        }
        for (const m of matches(file, masked, /\beventStore\s*:|\b\w*EventStore\b|["']last-event-id["']/i)) {
            at(m, {
                rule: "event-store",
                severity: "recommended",
                message: "Configures SSE resumability. 2026-07-28 removed it: a broken stream loses the in-flight request and the client re-issues it.",
                fix: "Drop the event store. Keep response streams short; long-lived change feeds belong on subscriptions/listen.",
                source: SPEC.receivingMessages,
                codemod: "http-entry",
            });
            break;
        }
        for (const m of matches(file, masked, /\.(sendToolListChanged|sendPromptListChanged|sendResourceListChanged|sendResourceUpdated)\s*\(/)) {
            at(m, {
                rule: "list-changed-push",
                severity: "recommended",
                message: `${m.groups[0]}() pushes from one server instance. With createMcpHandler each request gets a fresh instance, and notifications only reach clients that opened subscriptions/listen.`,
                fix: "Publish through the handler instead: handler.notify.toolsChanged() / promptsChanged() / resourcesChanged() / resourceUpdated(uri); across processes, give createMcpHandler a shared ServerEventBus. (serveStdio routes these calls for you on stdio.)",
                source: SPEC.subscriptions,
            });
        }
        for (const m of matches(file, masked, /setRequestHandler\(\s*(?:PingRequestSchema|["']ping["'])|\.ping\(\s*\)/)) {
            at(m, {
                rule: "ping-handler",
                severity: "recommended",
                message: "ping was removed in 2026-07-28; on modern connections the SDK answers it with -32601.",
                fix: "Remove the ping handler or call. Use an HTTP health check for liveness.",
                source: SPEC.changelog,
            });
        }
        for (const m of matches(file, masked, /\bSetLevelRequestSchema\b|["']logging\/setLevel["']|\.sendLoggingMessage\s*\(/)) {
            at(m, {
                rule: "logging",
                severity: "recommended",
                message: "Uses MCP logging, deprecated in 2026-07-28 (SEP-2577); logging/setLevel is gone.",
                fix: "Log to stderr or OpenTelemetry. If you keep MCP logging, notifications/message only flow for requests whose _meta carries io.modelcontextprotocol/logLevel.",
                source: SPEC.logging,
            });
            break;
        }
        for (const m of matches(file, masked, /\b(GetTaskRequestSchema|ListTasksRequestSchema|GetTaskPayloadRequestSchema|CancelTaskRequestSchema)\b|["']tasks\/(?:result|list)["']/)) {
            at(m, {
                rule: "tasks",
                severity: "recommended",
                message: "Uses the experimental core tasks API from 2025-11-25. Tasks moved to the io.modelcontextprotocol/tasks extension (SEP-2663); tasks/result and tasks/list are gone.",
                fix: "Adopt the Tasks extension: poll with tasks/get, send input with tasks/update.",
                source: SPEC.changelog,
            });
            break;
        }
        for (const m of matches(file, masked, /["'`](2025-11-25|2025-06-18|2025-03-26|2024-11-05)["'`]/)) {
            at(m, {
                rule: "legacy-version-literal",
                severity: "info",
                message: `Hard-codes protocol version ${m.groups[0]}.`,
                fix: "If this pins what the server offers, add \"2026-07-28\" or let the SDK negotiate. Leave it if it deliberately targets legacy clients.",
                source: SPEC.versioning,
            });
        }
    }
    if (servesModern && !hasCacheHints) {
        add({
            rule: "cache-hints",
            severity: "info",
            message: "Serves 2026-07-28 with the SDK's default cache hints (ttlMs 0, cacheScope \"private\"): conformant, but clients cannot cache anything.",
            fix: "Set ServerOptions.cacheHints (or cacheHint on registerResource) with real ttlMs values, and \"public\" for lists that are the same for every caller.",
            source: SPEC.caching,
        });
    }
    const rank = { required: 0, recommended: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0));
}
