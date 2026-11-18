# Statelint rules: stateless MCP 2026-07-28 conformance and migration

Statelint checks **33 conformance rules** against a running MCP server and reports **29 kinds of migration finding** in source code. Every conformance rule cites the section of the [2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28) it comes from, the SEP that introduced it, and the matching check id in the official [`@modelcontextprotocol/conformance`](https://github.com/modelcontextprotocol/conformance) suite where one exists.

This page is generated from the rule definitions in [`src/check/rules.ts`](../src/check/rules.ts) by `scripts/rules-doc.mjs`, so it always matches the code. `statelint rules --verbose` prints the same list.

**Levels.** A MUST rule that is violated **fails**; a SHOULD rule that is violated **warns**. A rule whose prerequisite failed (for example, every rule needs one request to succeed without a handshake) is **blocked**, and a rule for a capability the server does not offer is **skipped**.

**Score.** MUST rules are worth 3 points and SHOULD rules 1. A passing rule earns its points, a MUST rule that only partly passes earns half, and anything else earns nothing; skipped rules do not count. A failed or blocked MUST rule caps the score at 89, so **90 or more always means conformant**.

## Conformance rules (`statelint check`)

### Stateless core

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `no-handshake` | MUST | Serves requests without the initialize handshake | Sends server/discover (then tools/list, prompts/list, resources/list) as the very first request, with the per-request _meta envelope and no initialize or session. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#statelessness) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `server-stateless` |
| `server-discover` | MUST | Implements server/discover | Calls server/discover and checks supportedVersions (a string array that includes 2026-07-28) and capabilities. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/discover) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-server-implements-discover` |
| `no-session-id` | SHOULD | Never issues Mcp-Session-Id on 2026-07-28 responses | Looks for an Mcp-Session-Id header on every response to a 2026-07-28 request. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions) · [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) |
| `session-id-ignored` | SHOULD | Ignores an Mcp-Session-Id sent by an older client | Repeats a working request with Mcp-Session-Id: statelint-probe-not-a-session and expects it to be served normally. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions) · [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) |
| `legacy-methods-405` | SHOULD | Answers GET and DELETE with 405 Method Not Allowed | Sends GET and DELETE to the endpoint and expects 405 Method Not Allowed with Allow: POST. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) |
| `initialize-names-versions` | SHOULD | Tells a legacy initialize which versions it supports | Sends a 2025-11-25 initialize (no envelope, no MCP headers) and expects either a successful dual-era answer or an error that names 2026-07-28. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#backward-compatibility-with-initialization-based-versions) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) |

### Header/body agreement (SEP-2243)

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `version-header-required` | MUST | Rejects a request without MCP-Protocol-Version | Sends a valid request without MCP-Protocol-Version and expects HTTP 400. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-invalid-headers` |
| `version-header-match` | MUST | Rejects an MCP-Protocol-Version that contradicts _meta | Sends MCP-Protocol-Version: 2025-11-25 with a 2026-07-28 _meta envelope and expects HTTP 400. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-http-server-header-mismatch-400` |
| `method-header-required` | MUST | Rejects a request without Mcp-Method | Sends a valid request without Mcp-Method and expects HTTP 400. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#standard-request-headers) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-invalid-headers` |
| `method-header-match` | MUST | Rejects an Mcp-Method that does not match the body (case-sensitive) | Sends Mcp-Method: tools/list on a server/discover body, and Mcp-Method: SERVER/DISCOVER on a server/discover body, and expects HTTP 400 for both. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-invalid-headers` |
| `name-header-required` | MUST | Rejects tools/call, resources/read and prompts/get without Mcp-Name | Sends tools/call (or prompts/get, resources/read) for a made-up target without Mcp-Name and expects HTTP 400. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#standard-request-headers) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-invalid-headers` |
| `name-header-match` | MUST | Rejects an Mcp-Name that does not match params.name or params.uri | Sends tools/call, prompts/get and resources/read whose Mcp-Name names a different made-up target than the body and expects HTTP 400 for each. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-invalid-headers` |
| `name-header-base64` | MUST | Decodes a Base64-sentinel Mcp-Name before comparing | Sends a non-ASCII made-up name in the body and its =?base64?…?= form in Mcp-Name and expects it not to be rejected as a mismatch. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#value-encoding) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-decode-base64` |
| `header-error-code` | MUST | Uses -32020 HeaderMismatch for every header rejection | Checks that every header rejection above carries the JSON-RPC error code -32020 (HeaderMismatch). | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-server-reject-error-code` · `sep-2575-http-server-header-mismatch-400` |
| `x-mcp-header-valid` | MUST | Lists only valid x-mcp-header annotations | Validates every x-mcp-header annotation in tools/list: non-empty RFC 9110 token, unique, on a string, integer or boolean parameter reached only through `properties`. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) · `sep-2243-x-mcp-header-not-empty` · `sep-2243-x-mcp-header-charset` · `sep-2243-x-mcp-header-unique` · `sep-2243-x-mcp-header-primitive-only` |
| `x-mcp-header-no-secrets` | SHOULD | Does not mirror secrets or personal data into headers | Flags x-mcp-header annotations on parameters named like passwords, keys, tokens, sessions or personal data. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header) · [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) |

### Versions and errors

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `unsupported-version` | MUST | Rejects an unknown protocol version with -32022 and the supported list | Sends protocol version 1999-01-01 and expects HTTP 400 with -32022, data.supported (including 2026-07-28) and data.requested. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#protocol-version-negotiation) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-http-server-unsupported-version-400` · `sep-2575-server-unsupported-version-error` |
| `meta-required` | MUST | Rejects a request whose _meta lacks clientCapabilities | Sends a request whose _meta has no clientCapabilities and expects HTTP 400 with -32602. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#_meta) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-http-server-meta-invalid-400` |
| `unknown-method-404` | MUST | Answers an unknown method with 404 and -32601 | Calls statelint/probe-unknown-method and expects HTTP 404 with -32601. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-http-server-method-not-found-404` |
| `error-id-echo` | MUST | Error responses carry the request's id | Checks that every error response to a request carries that request's JSON-RPC id. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#error-responses) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-http-server-error-jsonrpc-id` |
| `resource-not-found-code` | MUST | Reports a missing resource with -32602, not the retired -32002 | Reads statelint://probe/does-not-exist and expects error -32602, not the retired -32002 or an empty contents array. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/resources#error-handling) · [SEP-2164](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2164) · `sep-2164-resource-not-found` |

### Results and caching

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `result-type` | MUST | Every result carries resultType | Checks that every result carries resultType, and that discovery and list results use "complete". | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#result-responses) · [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) |
| `cache-hints` | MUST | Discovery and list results carry ttlMs and cacheScope | Checks ttlMs (integer >= 0) and cacheScope ("public" or "private") on server/discover, tools/list, prompts/list, resources/list and resources/templates/list results. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching#cacheable-results) · [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549) · `sep-2549-tools-list-caching-hints` · `sep-2549-prompts-list-caching-hints` · `sep-2549-resources-list-caching-hints` · `sep-2549-resources-templates-list-caching-hints` · `sep-2549-ttl-non-negative` · `sep-2549-cache-scope-valid` |
| `server-info` | SHOULD | Identifies itself in each result's _meta | Checks _meta["io.modelcontextprotocol/serverInfo"] with a name and version on every result. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#_meta) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-server-identifies-in-result-meta` |
| `tools-order` | SHOULD | Returns tools/list in a deterministic order | Calls tools/list twice and compares the order of the tools. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#listing-tools) |

### Responses: JSON and SSE

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `response-content-type` | MUST | Answers with application/json or text/event-stream | Checks that every response body is application/json (one JSON-RPC object) or text/event-stream. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#sending-messages) |
| `sse-single-response` | MUST | Each SSE response stream carries exactly one response | On every SSE response, counts the JSON-RPC responses that answer the request (exactly one) and rejects non-JSON events. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages) |
| `sse-no-server-requests` | MUST | Sends no server-to-client requests on SSE streams | Looks for JSON-RPC requests (a method and an id) on every SSE stream, including subscriptions/listen. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages) · [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) · `sep-2575-http-server-no-independent-requests-on-stream` |
| `sse-no-unrequested-logs` | MUST | Sends notifications/message only when the request set a logLevel | Looks for notifications/message on every SSE stream; none of Statelint's requests sets a logLevel. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-server-no-log-without-loglevel` |
| `sse-closes` | SHOULD | Closes the SSE stream after the final response | Waits a grace period (1500 ms by default) after the final response and checks that the stream ended. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages) |
| `sse-x-accel-buffering` | SHOULD | Starts SSE streams with X-Accel-Buffering: no | Checks X-Accel-Buffering: no on every SSE response, including subscriptions/listen. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages) |
| `subscriptions-listen` | MUST | Opens subscriptions/listen with the acknowledgment first | Opens subscriptions/listen for the advertised change notifications and expects notifications/subscriptions/acknowledged first, tagged with the request id. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions#acknowledgment) · [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) · `sep-2575-server-sends-subscription-ack` · `sep-2575-server-tags-subscription-id` · `sep-2575-server-honors-notification-filter` |

### Security

| Rule | Level | What it requires | How Statelint tests it | Source |
| --- | --- | --- | --- | --- |
| `origin-validation` | SHOULD | Refuses requests from an unexpected Origin | Sends a request with Origin: https://statelint-probe.invalid and expects 403. | [spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) · `dns-rebinding-protection` |

## Migration findings (`statelint migrate`)

| Finding | Severity | What it flags |
| --- | --- | --- |
| `sdk-v1` | required | Depends on the v1 TypeScript SDK (@modelcontextprotocol/sdk) |
| `transport-entry` | required | Hosts the 2025-era StreamableHTTPServerTransport |
| `session-map` | required | Keeps a map of transports keyed by session id |
| `session-header` | required | Reads or writes the removed Mcp-Session-Id header |
| `initialize-routing` | required | Branches on isInitializeRequest() |
| `session-callbacks` | required | Uses onsessioninitialized / onsessionclosed |
| `session-state` | required | Keys application state on the session id |
| `server-to-client-request` | required | Sends elicitation, sampling or roots requests to the client |
| `url-elicitation` | required | Uses UrlElicitationRequiredError or -32042 |
| `resources-subscribe` | required | Handles resources/subscribe or resources/unsubscribe |
| `retired-error-code` | required | Emits -32002 for resource not found |
| `draft-error-code` | required | Uses pre-release draft error codes (-32001, -32003, -32004) |
| `stdio-entry` | required | Connects a hand-built server to StdioServerTransport |
| `sse-transport` | required | Serves the deprecated HTTP+SSE transport |
| `dns-rebinding` | required | Relies on the transport for Host/Origin validation |
| `x-mcp-header-number` | required | Puts x-mcp-header on a number parameter |
| `get-delete-routes` | recommended | Serves GET or DELETE on the MCP endpoint |
| `event-store` | recommended | Configures SSE resumability (eventStore, Last-Event-ID) |
| `list-changed-push` | recommended | Pushes list-changed notifications from a server instance |
| `ping-handler` | recommended | Implements or calls the removed ping method |
| `logging` | recommended | Uses the deprecated logging feature |
| `tasks` | recommended | Uses the experimental core tasks API |
| `x-mcp-header-sensitive` | recommended | Mirrors a credential or personal data into a header |
| `legacy-version-literal` | info | Hard-codes a 2025-era protocol version |
| `cache-hints` | info | Serves 2026-07-28 with default cache hints only |
| `py-sdk-v1` | required | Python: depends on mcp v1 |
| `py-fastmcp` | info | Python: uses the v1 FastMCP name |
| `go-sdk-version` | required | Go: go-sdk older than v1.7.0 |
| `go-stateless` | required | Go: StreamableHTTPOptions without Stateless: true |

## Codemods (`statelint migrate --write`)

| Codemod | What it rewrites |
| --- | --- |
| `http-entry` | Rewrite an Express Streamable HTTP route to createMcpHandler + toNodeHandler |
| `stdio-entry` | Replace server.connect(new StdioServerTransport()) with serveStdio(factory) |
| `error-codes` | Renumber retired and draft error codes (-32002 → -32602, -32001/-32003/-32004 → -32020/-32021/-32022) |

Each codemod proves its preconditions on the token stream first and refuses, with the reason, when it cannot: for example when the route handler does more than host the transport, the server instance is shared between requests, or tools still read `ctx.sessionId`.
