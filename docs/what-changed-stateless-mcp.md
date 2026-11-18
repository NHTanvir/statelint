# What changed in stateless MCP (2026-07-28): a SEP-by-SEP reference

The 2026-07-28 revision of the Model Context Protocol made MCP stateless. It removed the `initialize` handshake ([SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575)) and protocol sessions with their `Mcp-Session-Id` header ([SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567)), so every request carries its protocol version and client capabilities in `_meta`. It also made Streamable HTTP POSTs mirror their method and target into `Mcp-Method` and `Mcp-Name` headers that servers must check against the body, answering `-32020` on a mismatch ([SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243)). It replaced server-to-client requests with Multi Round-Trip Requests ([SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)) and added cache hints to list results ([SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549)).

*Read against the specification source at commit `d4b3172` (2026-11-17). Released 2026-07-28; release candidate 2026-05-21. Updated 2026-11-18.*

## What does "stateless MCP" mean?

In the specification's words: "The Model Context Protocol (MCP) is a **stateless protocol**: all the information needed to process a request is contained in the request itself. A server processes each request independently; no state should be inferred from previous requests, even those on the same connection or stream." Servers "**MUST NOT** rely on prior requests over the same connection to establish context (e.g., capabilities, protocol version, client identity)". The [announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/) puts the practical effect plainly: "Any request can now land on any server instance behind a plain round-robin load balancer without needing shared storage."

Stateless is about the protocol, not your application. "Dropping the protocol-level session doesn't force your application to be stateless": a server that needs state across calls mints an explicit handle from a tool and takes it back as an argument.

## Stateless vs stateful MCP: what is the difference?

| | Stateful (2025-11-25 and earlier) | Stateless (2026-07-28) |
| --- | --- | --- |
| How a conversation starts | `initialize` request, then `notifications/initialized` | no handshake; `server/discover` is an optional first call |
| Where version and capabilities live | negotiated once, held in the session | `params._meta` of every request |
| Session identifier | `Mcp-Session-Id` response header, echoed by the client | none; servers ignore one if an old client sends it |
| Scaling | sticky sessions or a shared session store | any replica, plain round robin |
| Server asking the client for input | server-to-client JSON-RPC requests on an open stream | `InputRequiredResult`, client retries with `inputResponses` |
| Change notifications | unsolicited, on a `GET` SSE stream | `subscriptions/listen`, opted into per type |
| Dropped stream | resumable with `Last-Event-ID` | request lost; client re-issues it |

## Which SEPs changed what?

| Change | SEP | Statelint rule |
| --- | --- | --- |
| No `initialize`, per-request `_meta`, `server/discover`, `UnsupportedProtocolVersionError` | [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) | `no-handshake`, `server-discover`, `meta-required`, `unsupported-version` |
| No protocol sessions, no `Mcp-Session-Id` | [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) | `no-session-id`, `session-id-ignored` |
| `GET` stream and `resources/subscribe` replaced by `subscriptions/listen` | SEP-2575 | `legacy-methods-405`, `subscriptions-listen` |
| `ping`, `logging/setLevel` removed; per-request `logLevel` | SEP-2575 | `sse-no-unrequested-logs` |
| SSE resumability removed | SEP-2575 | `sse-closes` |
| `Mcp-Method`, `Mcp-Name`, `x-mcp-header` / `Mcp-Param-*` | [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) | the ten header/body agreement rules |
| Multi Round-Trip Requests, required `resultType` | [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) | `result-type`, `sse-no-server-requests` |
| `ttlMs` and `cacheScope` | [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549) | `cache-hints` |
| Resource not found `-32002` → `-32602` | SEP-2164 | `resource-not-found-code` |
| Tasks moved to the `io.modelcontextprotocol/tasks` extension | [SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663) | migration finding `tasks` |
| Roots, Sampling, Logging deprecated | [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) | migration finding `logging` |
| Feature lifecycle; HTTP+SSE transport Deprecated | [SEP-2596](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2596) | migration finding `sse-transport` |
| `iss` validation (RFC 9207), `application_type`, credentials bound to issuer, DCR deprecated | [SEP-2468](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2468), [SEP-837](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/837), [SEP-2352](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2352), [PR #2858](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2858) | client and authorization-server side; not checked |

## SEP-2575: no handshake, and `server/discover`

Every request carries:

| `_meta` key | Required |
| --- | --- |
| `io.modelcontextprotocol/protocolVersion` | yes |
| `io.modelcontextprotocol/clientCapabilities` | yes |
| `io.modelcontextprotocol/clientInfo` | no (SHOULD) |
| `io.modelcontextprotocol/logLevel` | no |

"A request missing any required field is malformed; the server **MUST** reject it with JSON-RPC error code `-32602` (Invalid params). On HTTP, the response status **MUST** be `400 Bad Request`." Servers "**MUST** implement" `server/discover`, which returns `supportedVersions`, `capabilities` and, in `_meta`, `io.modelcontextprotocol/serverInfo`. A version the server does not implement gets `400` and `UnsupportedProtocolVersionError`:

```json
{ "jsonrpc": "2.0", "id": 1,
  "error": { "code": -32022, "message": "Unsupported protocol version",
             "data": { "supported": ["2026-07-28", "2025-11-25"], "requested": "1900-01-01" } } }
```

An unknown method gets `404 Not Found` with `-32601`. The JSON-RPC body is what lets a client tell a modern server's 404 from a legacy HTTP+SSE server's.

## SEP-2567: no sessions

"Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP transport. List endpoints (`tools/list`, `resources/list`, `prompts/list`) no longer vary per-connection." A server that supports only 2026-07-28 and receives old traffic **SHOULD** answer `GET` or `DELETE` on the endpoint with `405 Method Not Allowed`, ignore an incoming `Mcp-Session-Id` ("do not mint or echo session IDs"), and ignore `Last-Event-ID`.

## SEP-2243: the routing headers and the `-32020` agreement rule

| Header | Mirrors | Required on |
| --- | --- | --- |
| `MCP-Protocol-Version` | `_meta["io.modelcontextprotocol/protocolVersion"]` | every POST |
| `Mcp-Method` | `method` | every request |
| `Mcp-Name` | `params.name`, or `params.uri` for `resources/read` | `tools/call`, `resources/read`, `prompts/get` |
| `Mcp-Param-{Name}` | a tool argument annotated with `x-mcp-header` | `tools/call` of that tool |

The agreement rule: "Servers that process the request body **MUST** reject requests where the values specified in the headers do not match the corresponding values in the request body … When rejecting a request due to header validation failure, servers **MUST** return HTTP status `400 Bad Request` and **MUST** include a JSON-RPC error response" with code `-32020` (`HeaderMismatch`). Validation fails when a required header is missing, when a value does not match, or when a value contains invalid characters. Header names are case-insensitive; "Header _values_ (such as method names) are case-sensitive."

Values that are not plain ASCII (or that have leading or trailing whitespace) travel as `=?base64?{UTF-8 in Base64}?=`, and "servers **MUST** decode an encoded `Mcp-Name` or `Mcp-Param-{Name}` value before comparing it". The spec's examples: `Hello, 世界` becomes `=?base64?SGVsbG8sIOS4lueVjA==?=`.

`x-mcp-header` lets a tool mirror an argument into a header. The value must be a non-empty RFC 9110 token, unique within the tool (case-insensitively), on a `string`, `integer` or `boolean` parameter (`number` is not allowed), reached only through `properties` keys. "Clients using the Streamable HTTP transport **MUST** reject tool definitions where any `x-mcp-header` value violates these constraints," which means the tool disappears from `tools/list`. And "Server developers **SHOULD NOT** mark sensitive parameters (passwords, API keys, tokens, PII) with `x-mcp-header`."

The number changed during the drafts: the 2026-07-28 changelog renumbered `HeaderMismatch` from `-32001` to `-32020` (and `MissingRequiredClientCapability` `-32003` → `-32021`, `UnsupportedProtocolVersion` `-32004` → `-32022`), and reserved `-32020` to `-32099` for the specification.

## SEP-2322: Multi Round-Trip Requests and `resultType`

"The `result` **MUST** include a `resultType` field": `"complete"` for ordinary results, `"input_required"` for an interim result whose `inputRequests` ask the client for elicitation, sampling or roots. The client answers by retrying the original request, with a new JSON-RPC id, carrying `inputResponses` and echoing any opaque `requestState`. Only `tools/call`, `prompts/get` and `resources/read` may return `input_required`. On Streamable HTTP, "The server **MUST NOT** send independent JSON-RPC _requests_" on a response stream. Servers must treat `requestState` as attacker-controlled and integrity-protect it when it influences authorization or business logic.

## SEP-2549: `ttlMs` and `cacheScope`

"Servers MUST include caching hints on results with `resultType: "complete"`" returned by `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list` and `resources/read`. `ttlMs` is an integer number of milliseconds ("Servers **MUST** provide a `ttlMs` value that is `>= 0`"); `cacheScope` is `"public"` (shared caches may serve it to anyone) or `"private"` (one authorization context). All pages of one list must share a `cacheScope`. The changelog names five of the six operations; `server/discover` comes from the caching page and from `schema.ts`, where `DiscoverResult extends CacheableResult`.

## What new risks did the stateless revision introduce?

- **Header/body desync.** Akamai's analysis ([2026-06-25](https://www.akamai.com/blog/security-research/new-mcp-specification-security-teams-must-prepare)) describes "protocol confusion (desync) attacks": "Attackers can send conflicting values between the HTTP headers and the JSON-RPC request body." If a gateway authorizes on `Mcp-Name` and the server executes the body's `params.name`, a request can be approved for one tool and run another. The agreement rule above closes this, but only on servers that enforce it.
- **Secrets in headers.** If a sensitive argument is mapped through `x-mcp-header`, "those secrets are pushed straight into the headers" and "become visible to every load balancer, proxy, and logging system along the path" (Akamai).
- **Client-controlled state.** `_meta` and `requestState` come from the client and are not signed; treat them as untrusted.
- **Downgrade.** Header validation exists only from 2026-07-28 on, so the spec tells header-trusting intermediaries to reject requests whose `MCP-Protocol-Version` is older or missing.
- **Shared caches.** A `"public"` `cacheScope` on an authenticated endpoint may be served across tokens.

## How do gateways enforce the new headers?

- [agentgateway](https://agentgateway.dev/blog/2026-07-21-stateless-mcp-still-needs-mcp-native-dataplane/) validates headers against the body on every POST, "ahead of any routing or session logic", and returns `-32020` (`"Mcp-Name header/body mismatch"`). It argues a header-only proxy is "not just insufficient but actively unsafe" because both copies are client-supplied.
- [Tyk Gateway 5.16.0](https://tyk.io/docs/developer-support/release-notes/gateway) (2026-10-27) requires `MCP-Protocol-Version` and `Mcp-Method` (plus `Mcp-Name` on the three named methods) on modern requests and checks them at ingress, before policies and rate limits. [PR #8680](https://github.com/TykTechnologies/tyk/pull/8680) answers modern `GET`, `DELETE` and other methods with `405` and `Allow: POST`.
- [F5 NGINX Plus](https://community.f5.com/t/nginx-plus-as-mcp-security-gateway/77301) routes and authorizes on `$http_mcp_method` and `$http_mcp_name`, with an njs check that compares them with the body and returns `400` on mismatch.
- [Cloudflare's Agents SDK](https://blog.cloudflare.com/mcp-v2) moved from `McpAgent` to `createMcpHandler`.

A gateway check does not replace the server's: the spec puts the MUST on "servers that process the request body", and a request that reaches the server through another path is only as safe as the server's own validation. `statelint check` tests the server directly.

## FAQ

### Is `server/discover` required?

For servers, yes ("Servers **MUST** implement it"). For clients it is optional: they can send any request directly and handle `UnsupportedProtocolVersionError`.

### What happened to `ping`?

It was removed in 2026-07-28 (as were `logging/setLevel` and `notifications/roots/list_changed`). Use an HTTP health check for liveness.

### What replaced `resources/subscribe`?

`subscriptions/listen`: one long-lived POST whose SSE response delivers only the notification types the client asked for, starting with `notifications/subscriptions/acknowledged`, each message tagged with `io.modelcontextprotocol/subscriptionId`.

### Did the auth model change?

Mostly on the client and authorization-server side: `iss` validation per RFC 9207 (SEP-2468), `application_type` in Dynamic Client Registration (SEP-837), credentials bound to their issuer (SEP-2352), and Dynamic Client Registration deprecated in favour of Client ID Metadata Documents. Resource servers still validate token audience (RFC 8707), answer `401` for invalid tokens, and expect `Authorization` on every request.

### Which SDK versions support 2026-07-28?

TypeScript `@modelcontextprotocol/server` 2.x (2.4.0 at the time of writing; serving 2026-07-28 is an explicit opt-in through `createMcpHandler` or `serveStdio`), Python `mcp` 2.x (2.3.0), Go `go-sdk` v1.7.0 and later (v1.8.0) with `Stateless: true`, and C# `ModelContextProtocol` 2.x (2.4.0). The v1 TypeScript package `@modelcontextprotocol/sdk` (1.32.2) serves 2025-era clients only.

## Sources

- [Specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) and its [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic/index), [versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching), [subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions), [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)
- [`schema.ts`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
- [The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/) and [Beta SDKs for the release candidate](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)
- [TypeScript SDK: supporting 2026-07-28](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)
- Full research notes with every quotation and date: [RESEARCH.md](RESEARCH.md)
