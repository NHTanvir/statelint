/**
 * Wire constants for MCP protocol revision 2026-07-28 (stateless).
 * Every value here is quoted in docs/RESEARCH.md with its source.
 */
/** The revision Statelint checks against. */
export declare const SPEC_VERSION = "2026-07-28";
/** Handshake-based ("legacy") revisions, newest first. */
export declare const LEGACY_VERSIONS: readonly ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export declare const SPEC_BASE = "https://modelcontextprotocol.io/specification/2026-07-28";
/** Reserved `_meta` keys (basic/index › _meta). */
export declare const META: {
    readonly protocolVersion: "io.modelcontextprotocol/protocolVersion";
    readonly clientCapabilities: "io.modelcontextprotocol/clientCapabilities";
    readonly clientInfo: "io.modelcontextprotocol/clientInfo";
    readonly serverInfo: "io.modelcontextprotocol/serverInfo";
    readonly logLevel: "io.modelcontextprotocol/logLevel";
    readonly subscriptionId: "io.modelcontextprotocol/subscriptionId";
};
/** Header names as the spec spells them. HTTP compares names case-insensitively. */
export declare const HEADER: {
    readonly protocolVersion: "MCP-Protocol-Version";
    readonly method: "Mcp-Method";
    readonly name: "Mcp-Name";
    readonly paramPrefix: "Mcp-Param-";
    readonly sessionId: "Mcp-Session-Id";
    readonly lastEventId: "Last-Event-ID";
    readonly accelBuffering: "X-Accel-Buffering";
};
/** JSON-RPC and MCP error codes (basic/index › Error Codes, schema.ts). */
export declare const ERROR_CODE: {
    readonly ParseError: -32700;
    readonly InvalidRequest: -32600;
    readonly MethodNotFound: -32601;
    readonly InvalidParams: -32602;
    readonly InternalError: -32603;
    readonly HeaderMismatch: -32020;
    readonly MissingRequiredClientCapability: -32021;
    readonly UnsupportedProtocolVersion: -32022;
};
/** Codes the 2026-07-28 drafts used before the changelog renumbered them. */
export declare const DRAFT_ERROR_CODE: {
    readonly HeaderMismatch: -32001;
    readonly MissingRequiredClientCapability: -32003;
    readonly UnsupportedProtocolVersion: -32004;
};
/** Codes from earlier revisions that 2026-07-28 implementations MUST NOT emit. */
export declare const RETIRED_ERROR_CODE: {
    readonly ResourceNotFound: -32002;
    readonly UrlElicitationRequired: -32042;
};
/** Requests whose `Mcp-Name` header mirrors a params field. */
export declare const NAMED_METHODS: Readonly<Record<string, "name" | "uri">>;
/** Operations whose complete results MUST carry ttlMs and cacheScope (server/utilities/caching). */
export declare const CACHEABLE_METHODS: readonly ["server/discover", "tools/list", "prompts/list", "resources/list", "resources/templates/list", "resources/read"];
/** The only requests that may answer with resultType "input_required" (basic/patterns/mrtr). */
export declare const INPUT_REQUIRED_METHODS: readonly ["tools/call", "resources/read", "prompts/get"];
export declare const SEP_URL: (n: number) => string;
/** Spec pages, by short key, so rules and migration findings cite the same place. */
export declare const SPEC: {
    readonly statelessness: "https://modelcontextprotocol.io/specification/2026-07-28/basic/index#statelessness";
    readonly meta: "https://modelcontextprotocol.io/specification/2026-07-28/basic/index#_meta";
    readonly results: "https://modelcontextprotocol.io/specification/2026-07-28/basic/index#result-responses";
    readonly errorCodes: "https://modelcontextprotocol.io/specification/2026-07-28/basic/index#error-codes";
    readonly versioning: "https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning";
    readonly versionNegotiation: "https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#protocol-version-negotiation";
    readonly backwardCompat: "https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#backward-compatibility-with-initialization-based-versions";
    readonly discover: "https://modelcontextprotocol.io/specification/2026-07-28/server/discover";
    readonly transport: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http";
    readonly security: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http";
    readonly sendingMessages: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#sending-messages";
    readonly receivingMessages: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages";
    readonly versionHeader: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header";
    readonly standardHeaders: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#standard-request-headers";
    readonly customHeaders: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#custom-headers-from-tool-parameters";
    readonly valueEncoding: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#value-encoding";
    readonly serverValidation: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation";
    readonly legacyTraffic: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions";
    readonly caching: "https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching#cacheable-results";
    readonly subscriptions: "https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions#acknowledgment";
    readonly xMcpHeader: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header";
    readonly toolsOrder: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools#listing-tools";
    readonly mrtr: "https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr";
    readonly logging: "https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging";
    readonly tools: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools";
    readonly statefulTools: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools";
    readonly resources: "https://modelcontextprotocol.io/specification/2026-07-28/server/resources";
    readonly resourceErrors: "https://modelcontextprotocol.io/specification/2026-07-28/server/resources#error-handling";
    readonly deprecated: "https://modelcontextprotocol.io/specification/2026-07-28/deprecated";
    readonly changelog: "https://modelcontextprotocol.io/specification/2026-07-28/changelog";
    readonly authorization: "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization";
};
