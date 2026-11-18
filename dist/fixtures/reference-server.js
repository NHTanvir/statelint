/**
 * A small, spec-faithful MCP 2026-07-28 server (Streamable HTTP, stateless), written as a
 * web-standard fetch handler so it runs in-process with no sockets. Each fault from
 * ./faults.ts breaks exactly one rule; everything else stays conformant.
 */
import { randomUUID } from "node:crypto";
import { CACHEABLE_METHODS, DRAFT_ERROR_CODE, ERROR_CODE, META, NAMED_METHODS, RETIRED_ERROR_CODE, SPEC_VERSION, } from "../protocol/constants.js";
import { decodeHeaderValue, findXMcpHeaders } from "../protocol/headers.js";
import { isNotification, isObject, isRequest, isResponse, tryParseJson, } from "../protocol/jsonrpc.js";
import { formatSseEvent } from "../protocol/sse.js";
import { VERSION } from "../version.js";
export const SERVER_INFO = { name: "statelint-reference", version: VERSION };
export const SUPPORTED_VERSIONS = [SPEC_VERSION];
const CAPABILITIES = {
    tools: { listChanged: true },
    prompts: { listChanged: true },
    resources: { subscribe: true, listChanged: true },
};
const BASE_TOOLS = [
    {
        name: "add",
        title: "Add two integers",
        description: "Add two integers and return the sum.",
        inputSchema: {
            type: "object",
            properties: { a: { type: "integer" }, b: { type: "integer" } },
            required: ["a", "b"],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: "execute_query",
        title: "Run a read-only query",
        description: "Run a read-only query against a regional replica. The region travels in the Mcp-Param-Region header.",
        inputSchema: {
            type: "object",
            properties: {
                region: { type: "string", description: "Replica region, for example us-west1", "x-mcp-header": "Region" },
                query: { type: "string", description: "The query to run" },
            },
            required: ["region", "query"],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: "get_time",
        title: "Server time",
        description: "Return the server time in ISO 8601.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
    },
];
const NUMBER_HEADER_TOOL = {
    name: "set_volume",
    description: "Set the output volume.",
    inputSchema: {
        type: "object",
        properties: { level: { type: "number", minimum: 0, maximum: 1, "x-mcp-header": "Level" } },
        required: ["level"],
    },
};
const SECRET_HEADER_TOOL = {
    name: "call_partner_api",
    description: "Call the partner API.",
    inputSchema: {
        type: "object",
        properties: {
            apiKey: { type: "string", description: "Partner API key", "x-mcp-header": "Api-Key" },
            path: { type: "string" },
        },
        required: ["apiKey", "path"],
    },
};
const RESOURCES = [
    {
        uri: "statelint://reference/readme",
        name: "readme",
        title: "About this server",
        description: "What the Statelint reference server is for.",
        mimeType: "text/markdown",
    },
];
const README_TEXT = "# Statelint reference server\n\nA stateless MCP 2026-07-28 server bundled with Statelint. " +
    "It passes every conformance rule unless it was started with a --fault.\n";
const TEMPLATES = [
    { uriTemplate: "statelint://reference/notes/{id}", name: "note", title: "A note by id", mimeType: "text/plain" },
];
const PROMPTS = [
    {
        name: "review_code",
        title: "Review code",
        description: "Ask for a careful code review.",
        arguments: [{ name: "code", description: "The code to review", required: true }],
    },
];
const CACHE_HINTS = {
    "server/discover": { ttlMs: 3_600_000, cacheScope: "public" },
    "tools/list": { ttlMs: 300_000, cacheScope: "public" },
    "prompts/list": { ttlMs: 300_000, cacheScope: "public" },
    "resources/list": { ttlMs: 60_000, cacheScope: "public" },
    "resources/templates/list": { ttlMs: 300_000, cacheScope: "public" },
    "resources/read": { ttlMs: 60_000, cacheScope: "public" },
};
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function isLocalOrigin(origin) {
    try {
        return LOCAL_HOSTS.has(new URL(origin).hostname);
    }
    catch {
        return false;
    }
}
function mediaType(header) {
    return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
function errorObject(code, message, data) {
    return data === undefined ? { code, message } : { code, message, data };
}
export function createReferenceServer(options = {}) {
    const fault = options.fault;
    const sse = options.sse ?? false;
    const keepAliveMs = options.keepAliveMs ?? 15_000;
    const name = fault ? `reference${sse ? "-sse" : ""} + ${fault}` : `reference${sse ? "-sse" : ""}`;
    /** Open streams, so close() can end them. */
    const streams = new Set();
    let toolsListCalls = 0;
    /** Sessions for the requires-initialize fault (a 2025-era server). */
    const legacySessions = new Set();
    const tools = () => {
        const list = [...BASE_TOOLS];
        if (fault === "x-mcp-header-on-number")
            list.push(NUMBER_HEADER_TOOL);
        if (fault === "x-mcp-header-secret")
            list.push(SECRET_HEADER_TOOL);
        return list;
    };
    const baseHeaders = () => {
        const h = {};
        if (fault === "mints-session-id")
            h["Mcp-Session-Id"] = randomUUID();
        return h;
    };
    const jsonResponse = (status, body, extra = {}) => {
        const headers = { ...baseHeaders(), ...extra };
        if (body === undefined)
            return new Response(null, { status, headers });
        headers["Content-Type"] = fault === "wrong-content-type" ? "text/plain; charset=utf-8" : "application/json";
        return new Response(JSON.stringify(body), { status, headers });
    };
    /** An SSE response stream. `keepOpen` holds it open until the client cancels or close() runs. */
    const sseResponse = (messages, opts = {}) => {
        const encoder = new TextEncoder();
        let timer;
        let closed = false;
        let handle;
        const body = new ReadableStream({
            start(controller) {
                for (const m of messages)
                    controller.enqueue(encoder.encode(formatSseEvent(JSON.stringify(m), { event: "message" })));
                if (!opts.keepOpen) {
                    closed = true;
                    controller.close();
                    return;
                }
                timer = setInterval(() => {
                    if (!closed)
                        controller.enqueue(encoder.encode(":\n\n"));
                }, keepAliveMs);
                timer.unref?.();
                handle = {
                    end(graceful) {
                        if (closed)
                            return;
                        closed = true;
                        if (timer)
                            clearInterval(timer);
                        if (graceful && opts.onGracefulEnd) {
                            controller.enqueue(encoder.encode(formatSseEvent(JSON.stringify(opts.onGracefulEnd()), { event: "message" })));
                        }
                        controller.close();
                        if (handle)
                            streams.delete(handle);
                    },
                };
                streams.add(handle);
            },
            cancel() {
                closed = true;
                if (timer)
                    clearInterval(timer);
                if (handle)
                    streams.delete(handle);
            },
        });
        const headers = { ...baseHeaders(), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
        if (fault !== "sse-buffered")
            headers["X-Accel-Buffering"] = "no";
        return new Response(body, { status: 200, headers });
    };
    const decorate = (method, result) => {
        const out = { ...result };
        if (fault !== "no-result-type")
            out["resultType"] = "complete";
        if (fault !== "no-server-info") {
            const meta = isObject(out["_meta"]) ? out["_meta"] : {};
            out["_meta"] = { ...meta, [META.serverInfo]: { ...SERVER_INFO } };
        }
        const hints = CACHE_HINTS[method];
        if (hints && CACHEABLE_METHODS.includes(method) && fault !== "no-cache-hints") {
            out["ttlMs"] = hints.ttlMs;
            out["cacheScope"] = hints.cacheScope;
        }
        return out;
    };
    /** Deliver a result or in-band error in the configured response mode. */
    const deliver = (id, method, outcome, errId) => {
        if (outcome.kind === "response")
            return outcome.response;
        if (outcome.kind === "error" && outcome.status !== 200) {
            return jsonResponse(outcome.status, { jsonrpc: "2.0", id: errId, error: outcome.error });
        }
        const message = outcome.kind === "result"
            ? { jsonrpc: "2.0", id, result: decorate(method, outcome.result) }
            : { jsonrpc: "2.0", id: errId, error: outcome.error };
        if (!sse)
            return jsonResponse(200, message);
        const before = [];
        if (fault === "sse-server-request") {
            before.push({
                jsonrpc: "2.0",
                id: "server-elicit-1",
                method: "elicitation/create",
                params: { message: "Confirm?", requestedSchema: { type: "object", properties: {} } },
            });
        }
        if (fault === "sse-unrequested-log") {
            before.push({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: `handling ${method}` } });
        }
        const all = [...before, message];
        if (fault === "sse-duplicate-response")
            all.push(message);
        return sseResponse(all, { keepOpen: fault === "sse-stays-open" });
    };
    const headerMismatch = (message) => ({
        kind: "error",
        status: 400,
        error: errorObject(fault === "draft-error-code" ? DRAFT_ERROR_CODE.HeaderMismatch : ERROR_CODE.HeaderMismatch, `Header mismatch: ${message}`),
    });
    const invalidParams = (message, status = 400) => ({
        kind: "error",
        status,
        error: errorObject(ERROR_CODE.InvalidParams, message),
    });
    /** Mcp-Param-{Name} validation for annotated tool arguments (streamable-http › Server Behavior). */
    const checkParamHeaders = (tool, args, headers) => {
        for (const a of findXMcpHeaders(tool.inputSchema)) {
            if (!a.reachable || typeof a.value !== "string")
                continue;
            let value = args;
            for (const key of a.path.split("."))
                value = isObject(value) ? value[key] : undefined;
            const headerName = `Mcp-Param-${a.value}`;
            const raw = headers.get(headerName);
            if (value === undefined || value === null) {
                if (raw !== null)
                    return `${headerName} header is present but argument ${a.path} is absent`;
                continue;
            }
            if (raw === null)
                return `Missing ${headerName} header for argument ${a.path}`;
            const decoded = decodeHeaderValue(raw).value;
            const matches = typeof value === "number" ? Number(decoded) === value : typeof value === "boolean" ? decoded === String(value) : decoded === value;
            if (!matches)
                return `${headerName} header value '${raw}' does not match body value '${String(value)}'`;
        }
        return undefined;
    };
    const callTool = (params, headers) => {
        const toolName = params["name"];
        const tool = tools().find((t) => t.name === toolName);
        if (!tool)
            return invalidParams(`Unknown tool: ${String(toolName)}`, 200);
        const args = isObject(params["arguments"]) ? params["arguments"] : {};
        const mismatch = checkParamHeaders(tool, args, headers);
        if (mismatch)
            return headerMismatch(mismatch);
        const text = (t, isError = false) => ({
            kind: "result",
            result: { content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) },
        });
        switch (tool.name) {
            case "add": {
                const a = args["a"];
                const b = args["b"];
                if (!Number.isInteger(a) || !Number.isInteger(b))
                    return text("Both a and b must be integers.", true);
                const sum = a + b;
                return { kind: "result", result: { content: [{ type: "text", text: String(sum) }], structuredContent: { sum } } };
            }
            case "execute_query":
                return text(`[${String(args["region"])}] read-only replica would run: ${String(args["query"])}`);
            case "get_time":
                return text(new Date().toISOString());
            default:
                return text(`${tool.name} is a demo tool and does nothing.`);
        }
    };
    const listen = (id, params) => {
        const filter = isObject(params["notifications"]) ? params["notifications"] : {};
        const ack = {};
        if (filter["toolsListChanged"] === true)
            ack["toolsListChanged"] = true;
        if (filter["promptsListChanged"] === true)
            ack["promptsListChanged"] = true;
        if (filter["resourcesListChanged"] === true)
            ack["resourcesListChanged"] = true;
        if (Array.isArray(filter["resourceSubscriptions"])) {
            ack["resourceSubscriptions"] = filter["resourceSubscriptions"].filter((u) => typeof u === "string");
        }
        const first = fault === "listen-no-ack"
            ? { jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { _meta: { [META.subscriptionId]: id } } }
            : {
                jsonrpc: "2.0",
                method: "notifications/subscriptions/acknowledged",
                params: { _meta: { [META.subscriptionId]: id }, notifications: ack },
            };
        return {
            kind: "response",
            response: sseResponse([first], {
                keepOpen: true,
                onGracefulEnd: () => ({
                    jsonrpc: "2.0",
                    id,
                    result: { resultType: "complete", _meta: { [META.subscriptionId]: id, [META.serverInfo]: { ...SERVER_INFO } } },
                }),
            }),
        };
    };
    const dispatch = (id, method, params, headers) => {
        switch (method) {
            case "server/discover":
                if (fault === "no-discover") {
                    return { kind: "error", status: 404, error: errorObject(ERROR_CODE.MethodNotFound, "Method not found: server/discover") };
                }
                return {
                    kind: "result",
                    result: {
                        supportedVersions: [...SUPPORTED_VERSIONS],
                        capabilities: CAPABILITIES,
                        instructions: "Statelint's reference server: three demo tools, one resource, one prompt.",
                    },
                };
            case "tools/list": {
                toolsListCalls++;
                let list = tools().map((t) => ({ ...t }));
                if (fault === "unstable-tools-order" && toolsListCalls % 2 === 0)
                    list = list.reverse();
                return { kind: "result", result: { tools: list } };
            }
            case "tools/call":
                return callTool(params, headers);
            case "resources/list":
                return { kind: "result", result: { resources: RESOURCES } };
            case "resources/templates/list":
                return { kind: "result", result: { resourceTemplates: TEMPLATES } };
            case "resources/read": {
                const uri = params["uri"];
                if (uri === "statelint://reference/readme") {
                    return { kind: "result", result: { contents: [{ uri, mimeType: "text/markdown", text: README_TEXT }] } };
                }
                const code = fault === "legacy-not-found-code" ? RETIRED_ERROR_CODE.ResourceNotFound : ERROR_CODE.InvalidParams;
                return { kind: "error", status: 200, error: errorObject(code, "Resource not found", { uri: typeof uri === "string" ? uri : null }) };
            }
            case "prompts/list":
                return { kind: "result", result: { prompts: PROMPTS } };
            case "prompts/get": {
                if (params["name"] !== "review_code")
                    return invalidParams(`Unknown prompt: ${String(params["name"])}`, 200);
                const args = isObject(params["arguments"]) ? params["arguments"] : {};
                return {
                    kind: "result",
                    result: {
                        description: "Code review",
                        messages: [{ role: "user", content: { type: "text", text: `Please review this code:\n\n${String(args["code"] ?? "")}` } }],
                    },
                };
            }
            case "subscriptions/listen":
                return listen(id, params);
            default: {
                const status = fault === "unknown-method-200" ? 200 : 404;
                return { kind: "error", status, error: errorObject(ERROR_CODE.MethodNotFound, `Method not found: ${method}`) };
            }
        }
    };
    /** The requires-initialize fault: a 2025-11-25 sessionful server, as the v1 SDK builds it. */
    const legacySessionful = (request, id, method, params) => {
        const sessionId = request.headers.get("mcp-session-id");
        if (method === "initialize") {
            const newId = randomUUID();
            legacySessions.add(newId);
            return jsonResponse(200, {
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "2025-11-25",
                    capabilities: CAPABILITIES,
                    serverInfo: { ...SERVER_INFO },
                },
            }, { "Mcp-Session-Id": newId });
        }
        if (!sessionId || !legacySessions.has(sessionId)) {
            return jsonResponse(400, {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            });
        }
        if (method === "tools/list")
            return jsonResponse(200, { jsonrpc: "2.0", id, result: { tools: tools() } });
        return jsonResponse(200, { jsonrpc: "2.0", id, error: { code: ERROR_CODE.MethodNotFound, message: "Method not found" } });
    };
    const handle = async (request) => {
        if (request.method !== "POST") {
            if (fault === "requires-initialize" && request.method === "DELETE") {
                const sid = request.headers.get("mcp-session-id");
                if (sid)
                    legacySessions.delete(sid);
                return new Response(null, { status: 200 });
            }
            if (request.method === "GET" && fault === "get-opens-stream")
                return sseResponse([], { keepOpen: true });
            if (request.method === "DELETE" && fault === "delete-accepted")
                return new Response(null, { status: 204 });
            if (request.method === "OPTIONS")
                return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
            return jsonResponse(405, {
                jsonrpc: "2.0",
                id: null,
                error: errorObject(ERROR_CODE.InvalidRequest, "Method Not Allowed: this MCP endpoint accepts POST only (2026-07-28 removed the GET stream and DELETE session termination)"),
            }, { Allow: "POST" });
        }
        const origin = request.headers.get("origin");
        if (origin && !isLocalOrigin(origin) && fault !== "accepts-any-origin") {
            return jsonResponse(403, { jsonrpc: "2.0", id: null, error: errorObject(ERROR_CODE.InvalidRequest, `Forbidden: Origin ${origin} is not allowed`) });
        }
        if (mediaType(request.headers.get("content-type")) !== "application/json") {
            return jsonResponse(415, {
                jsonrpc: "2.0",
                id: null,
                error: errorObject(ERROR_CODE.InvalidRequest, "Unsupported Media Type: send Content-Type: application/json"),
            });
        }
        const parsed = tryParseJson(await request.text());
        if (!parsed.ok)
            return jsonResponse(400, { jsonrpc: "2.0", id: null, error: errorObject(ERROR_CODE.ParseError, "Parse error") });
        const msg = parsed.value;
        if (Array.isArray(msg)) {
            return jsonResponse(400, { jsonrpc: "2.0", id: null, error: errorObject(ERROR_CODE.InvalidRequest, "Batch requests are not supported") });
        }
        if (!isObject(msg) || msg["jsonrpc"] !== "2.0" || isResponse(msg)) {
            return jsonResponse(400, { jsonrpc: "2.0", id: null, error: errorObject(ERROR_CODE.InvalidRequest, "Invalid Request") });
        }
        if (isNotification(msg))
            return new Response(null, { status: 202, headers: baseHeaders() });
        if (!isRequest(msg))
            return jsonResponse(400, { jsonrpc: "2.0", id: null, error: errorObject(ERROR_CODE.InvalidRequest, "Invalid Request") });
        const id = msg.id;
        const method = msg.method;
        const params = isObject(msg.params) ? msg.params : {};
        const errId = fault === "error-id-null" ? null : id;
        const reject = (outcome) => deliver(id, method, outcome, errId);
        if (fault === "requires-initialize")
            return legacySessionful(request, id, method, params);
        if (fault === "rejects-unknown-session" && request.headers.get("mcp-session-id") !== null) {
            return jsonResponse(404, { jsonrpc: "2.0", id: errId, error: errorObject(-32001, "Session not found") });
        }
        const meta = isObject(params["_meta"]) ? params["_meta"] : undefined;
        const claimed = meta?.[META.protocolVersion];
        const headerVersion = request.headers.get("mcp-protocol-version");
        // Legacy traffic (no per-request envelope). This server is modern-only.
        if (claimed === undefined) {
            if (method === "initialize") {
                if (fault === "initialize-silent")
                    return reject({ kind: "error", status: 400, error: errorObject(ERROR_CODE.InvalidRequest, "Bad Request") });
                const requested = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "unknown";
                return reject({
                    kind: "error",
                    status: 400,
                    error: errorObject(ERROR_CODE.UnsupportedProtocolVersion, `Unsupported protocol version ${requested}: this server speaks MCP ${SPEC_VERSION} only (stateless, no initialize handshake). Supported versions: ${SUPPORTED_VERSIONS.join(", ")}.`, { supported: [...SUPPORTED_VERSIONS], requested }),
                });
            }
            if (headerVersion === null)
                return reject(headerMismatch("Missing MCP-Protocol-Version header"));
            return reject(invalidParams(`Invalid params: _meta is missing ${META.protocolVersion}`));
        }
        // (a) MCP-Protocol-Version is required on every POST.
        if (headerVersion === null && fault !== "version-header-optional")
            return reject(headerMismatch("Missing MCP-Protocol-Version header"));
        // (b) The envelope must be complete: protocolVersion and clientCapabilities are required.
        if (typeof claimed !== "string")
            return reject(invalidParams(`Invalid params: ${META.protocolVersion} must be a string`));
        if (!isObject(meta?.[META.clientCapabilities]) && fault !== "meta-optional") {
            return reject(invalidParams(`Invalid params: _meta is missing ${META.clientCapabilities}`));
        }
        // (c) The header must agree with the envelope.
        if (headerVersion !== null && headerVersion !== claimed && fault !== "version-header-unchecked") {
            return reject(headerMismatch(`MCP-Protocol-Version header '${headerVersion}' does not match _meta protocolVersion '${claimed}'`));
        }
        // (d) The version must be one this server implements.
        if (!SUPPORTED_VERSIONS.includes(claimed)) {
            const data = fault === "unsupported-version-no-list" ? undefined : { supported: [...SUPPORTED_VERSIONS], requested: claimed };
            return reject({ kind: "error", status: 400, error: errorObject(ERROR_CODE.UnsupportedProtocolVersion, "Unsupported protocol version", data) });
        }
        // (e) Mcp-Method must be present and equal to the body's method (values are case-sensitive).
        const headerMethod = request.headers.get("mcp-method");
        if (headerMethod === null) {
            if (fault !== "method-header-optional")
                return reject(headerMismatch("Missing Mcp-Method header"));
        }
        else if (fault !== "method-header-unchecked") {
            const same = fault === "method-header-case-insensitive" ? headerMethod.toLowerCase() === method.toLowerCase() : headerMethod === method;
            if (!same)
                return reject(headerMismatch(`Mcp-Method header value '${headerMethod}' does not match body value '${method}'`));
        }
        // (f) Mcp-Name mirrors params.name or params.uri for the three named methods.
        const nameField = NAMED_METHODS[method];
        if (nameField) {
            const bodyValue = params[nameField];
            const headerName = request.headers.get("mcp-name");
            if (headerName === null) {
                if (fault !== "name-header-optional")
                    return reject(headerMismatch("Missing Mcp-Name header"));
            }
            else if (fault !== "name-header-unchecked") {
                const compared = fault === "name-header-no-base64" ? headerName : decodeHeaderValue(headerName).value;
                if (compared !== bodyValue) {
                    return reject(headerMismatch(`Mcp-Name header value '${headerName}' does not match body value '${String(bodyValue)}'`));
                }
            }
        }
        return deliver(id, method, dispatch(id, method, params, request.headers), errId);
    };
    return {
        name,
        fetch: async (request) => {
            try {
                return await handle(request);
            }
            catch (err) {
                return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: ERROR_CODE.InternalError, message: err.message } }), { status: 500, headers: { "Content-Type": "application/json" } });
            }
        },
        close() {
            for (const s of [...streams])
                s.end(true);
        },
    };
}
