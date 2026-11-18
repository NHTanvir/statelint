/**
 * Wire constants for MCP protocol revision 2026-07-28 (stateless).
 * Every value here is quoted in docs/RESEARCH.md with its source.
 */

/** The revision Statelint checks against. */
export const SPEC_VERSION = "2026-07-28";

/** Handshake-based ("legacy") revisions, newest first. */
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const SPEC_BASE = `https://modelcontextprotocol.io/specification/${SPEC_VERSION}`;

/** Reserved `_meta` keys (basic/index › _meta). */
export const META = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  serverInfo: "io.modelcontextprotocol/serverInfo",
  logLevel: "io.modelcontextprotocol/logLevel",
  subscriptionId: "io.modelcontextprotocol/subscriptionId",
} as const;

/** Header names as the spec spells them. HTTP compares names case-insensitively. */
export const HEADER = {
  protocolVersion: "MCP-Protocol-Version",
  method: "Mcp-Method",
  name: "Mcp-Name",
  paramPrefix: "Mcp-Param-",
  sessionId: "Mcp-Session-Id",
  lastEventId: "Last-Event-ID",
  accelBuffering: "X-Accel-Buffering",
} as const;

/** JSON-RPC and MCP error codes (basic/index › Error Codes, schema.ts). */
export const ERROR_CODE = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  HeaderMismatch: -32020,
  MissingRequiredClientCapability: -32021,
  UnsupportedProtocolVersion: -32022,
} as const;

/** Codes the 2026-07-28 drafts used before the changelog renumbered them. */
export const DRAFT_ERROR_CODE = {
  HeaderMismatch: -32001,
  MissingRequiredClientCapability: -32003,
  UnsupportedProtocolVersion: -32004,
} as const;

/** Codes from earlier revisions that 2026-07-28 implementations MUST NOT emit. */
export const RETIRED_ERROR_CODE = {
  ResourceNotFound: -32002,
  UrlElicitationRequired: -32042,
} as const;

/** Requests whose `Mcp-Name` header mirrors a params field. */
export const NAMED_METHODS: Readonly<Record<string, "name" | "uri">> = {
  "tools/call": "name",
  "resources/read": "uri",
  "prompts/get": "name",
};

/** Operations whose complete results MUST carry ttlMs and cacheScope (server/utilities/caching). */
export const CACHEABLE_METHODS = [
  "server/discover",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
] as const;

/** The only requests that may answer with resultType "input_required" (basic/patterns/mrtr). */
export const INPUT_REQUIRED_METHODS = ["tools/call", "resources/read", "prompts/get"] as const;

export const SEP_URL = (n: number): string =>
  `https://github.com/modelcontextprotocol/modelcontextprotocol/pull/${n}`;

/** Spec pages, by short key, so rules and migration findings cite the same place. */
export const SPEC = {
  statelessness: `${SPEC_BASE}/basic/index#statelessness`,
  meta: `${SPEC_BASE}/basic/index#_meta`,
  results: `${SPEC_BASE}/basic/index#result-responses`,
  errorCodes: `${SPEC_BASE}/basic/index#error-codes`,
  versioning: `${SPEC_BASE}/basic/versioning`,
  versionNegotiation: `${SPEC_BASE}/basic/versioning#protocol-version-negotiation`,
  backwardCompat: `${SPEC_BASE}/basic/versioning#backward-compatibility-with-initialization-based-versions`,
  discover: `${SPEC_BASE}/server/discover`,
  transport: `${SPEC_BASE}/basic/transports/streamable-http`,
  security: `${SPEC_BASE}/basic/transports/streamable-http`,
  sendingMessages: `${SPEC_BASE}/basic/transports/streamable-http#sending-messages`,
  receivingMessages: `${SPEC_BASE}/basic/transports/streamable-http#receiving-messages`,
  versionHeader: `${SPEC_BASE}/basic/transports/streamable-http#protocol-version-header`,
  standardHeaders: `${SPEC_BASE}/basic/transports/streamable-http#standard-request-headers`,
  customHeaders: `${SPEC_BASE}/basic/transports/streamable-http#custom-headers-from-tool-parameters`,
  valueEncoding: `${SPEC_BASE}/basic/transports/streamable-http#value-encoding`,
  serverValidation: `${SPEC_BASE}/basic/transports/streamable-http#server-validation`,
  legacyTraffic: `${SPEC_BASE}/basic/transports/streamable-http#earlier-streamable-http-revisions`,
  caching: `${SPEC_BASE}/server/utilities/caching#cacheable-results`,
  subscriptions: `${SPEC_BASE}/basic/patterns/subscriptions#acknowledgment`,
  xMcpHeader: `${SPEC_BASE}/server/tools#x-mcp-header`,
  toolsOrder: `${SPEC_BASE}/server/tools#listing-tools`,
  mrtr: `${SPEC_BASE}/basic/patterns/mrtr`,
  logging: `${SPEC_BASE}/server/utilities/logging`,
  tools: `${SPEC_BASE}/server/tools`,
  statefulTools: `${SPEC_BASE}/server/tools#stateful-tools`,
  resources: `${SPEC_BASE}/server/resources`,
  resourceErrors: `${SPEC_BASE}/server/resources#error-handling`,
  deprecated: `${SPEC_BASE}/deprecated`,
  changelog: `${SPEC_BASE}/changelog`,
  authorization: `${SPEC_BASE}/basic/authorization`,
} as const;
