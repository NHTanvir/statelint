# Research notes: stateless MCP (protocol revision 2026-07-28)

Phase 0 notes for Statelint. Every rule the tool checks and every change the migration
assistant proposes comes from these notes, and every claim links to where it came from.
Read on **2026-11-18**. Where a source and this file disagree, the source wins.

## Sources

| What | Where | Version read |
| --- | --- | --- |
| Specification, revision 2026-07-28 | [modelcontextprotocol.io/specification/2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28), source in [`docs/specification/2026-07-28/`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/d4b317231161ee96d3eefb2448bda4230c76f4c6/docs/specification/2026-07-28) | repo `main` @ `d4b3172`, 2026-11-17 |
| Key changes (changelog) | [specification/2026-07-28/changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | same commit |
| Streamable HTTP transport | [basic/transports/streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) | same commit |
| Base protocol, `_meta`, error codes | [basic/index](https://modelcontextprotocol.io/specification/2026-07-28/basic/index) | same commit |
| Versioning and compatibility | [basic/versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning) | same commit |
| `server/discover` | [server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover) | same commit |
| Caching | [server/utilities/caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching) | same commit |
| Subscriptions | [basic/patterns/subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions) | same commit |
| Multi Round-Trip Requests | [basic/patterns/mrtr](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr) | same commit |
| Authorization | [basic/authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | same commit |
| Deprecated features registry | [specification/2026-07-28/deprecated](https://modelcontextprotocol.io/specification/2026-07-28/deprecated) | same commit |
| TypeScript schema (source of truth) | [`schema/2026-07-28/schema.ts`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/d4b317231161ee96d3eefb2448bda4230c76f4c6/schema/2026-07-28/schema.ts) | same commit |
| Release announcement | [blog.modelcontextprotocol.io/posts/2026-07-28/](https://blog.modelcontextprotocol.io/posts/2026-07-28/) ("The 2026-07-28 Specification", David Soria Parra and Den Delimarsky) | published 2026-07-28 |
| SDK beta announcement | [blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/) | published 2026-06-29 |
| SEP-2575 Make MCP stateless | [PR #2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575), `seps/2575-stateless-mcp.md` | same commit |
| SEP-2567 Sessionless MCP | [PR #2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567), `seps/2567-sessionless-mcp.md` | same commit |
| SEP-2243 HTTP standardization (headers) | [PR #2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243), `seps/2243-http-standardization.md` | same commit |
| SEP-2549 TTL for list results | [PR #2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549), `seps/2549-TTL-for-list-results.md` | same commit |
| SEP-2322 Multi Round-Trip Requests | [PR #2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322), `seps/2322-MRTR.md` | same commit |
| TypeScript SDK v2 docs: adopting 2026-07-28 | [`docs/migration/support-2026-07-28.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/919bb8ea88b6e10e72c2f8b6218fad4cfdc40b2c/docs/migration/support-2026-07-28.md), [Serve over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http), [Sessions, state, and scaling](https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling) | repo `main` @ `919bb8e`, 2026-11-10 |
| TypeScript SDK upgrade skill and codemod maps | [`skills/mcp-typescript-sdk-upgrade-to-v2/`](https://github.com/modelcontextprotocol/typescript-sdk/tree/919bb8ea88b6e10e72c2f8b6218fad4cfdc40b2c/skills/mcp-typescript-sdk-upgrade-to-v2), [`packages/codemod`](https://github.com/modelcontextprotocol/typescript-sdk/tree/919bb8ea88b6e10e72c2f8b6218fad4cfdc40b2c/packages/codemod) | same commit |
| Official conformance suite | [modelcontextprotocol/conformance](https://github.com/modelcontextprotocol/conformance) (`requirements/2026-07-28.yaml`, `src/seps/*.yaml`, `src/scenarios/server/*.ts`) | `main` @ `96a6f94`, 2026-11-10; npm `@modelcontextprotocol/conformance` 0.1.16 |
| agentgateway | [MCP goes stateless with headers. Do you need an MCP-native data plane?](https://agentgateway.dev/blog/2026-07-21-stateless-mcp-still-needs-mcp-native-dataplane/) | written in July 2026, before the release |
| Tyk Gateway | [Release notes, 5.16.0](https://tyk.io/docs/developer-support/release-notes/gateway) (released 2026-10-27); [TykTechnologies/tyk#8680](https://github.com/TykTechnologies/tyk/pull/8680) (merged 2026-10-06) | fetched 2026-11-18 |
| F5 NGINX | [NGINX Plus as MCP Security Gateway](https://community.f5.com/t/nginx-plus-as-mcp-security-gateway/77301) (DevCentral, 2026-08-17) | fetched 2026-11-18 |
| Cloudflare | [The next generation of MCP](https://blog.cloudflare.com/mcp-v2) (Matt Carey, 2026-08-06) | fetched 2026-11-18 |
| Akamai | [The New MCP Specification: What Security Teams Must Prepare For](https://www.akamai.com/blog/security-research/new-mcp-specification-security-teams-must-prepare) (Maxim Zavodchik, Segev Fogel, Gal Meiri, 2026-06-25) | fetched 2026-11-18 |
| Competing tools | [AlpayC/mcp-migration-check](https://github.com/AlpayC/mcp-migration-check), [dheerajjha/mcp-migrate](https://github.com/dheerajjha/mcp-migrate) | READMEs and rule files, fetched 2026-11-18 |
| Package registries | npm (`@modelcontextprotocol/*`, `statelint`), PyPI (`mcp`), GitHub releases (go-sdk, csharp-sdk) | queried 2026-11-18 |

## Timeline

- **2026-05-21**: release candidate announced (`blog/content/posts/2026-05-21-mcp-2026-07-28-rc.md`).
- **2026-06-29**: beta SDKs for the RC: TypeScript v2 and Python v2, plus Go and C# betas.
- **2026-07-28**: the revision is final. `LATEST_PROTOCOL_VERSION = "2026-07-28"` in `schema.ts`.
  The announcement says the TypeScript, Python, Go and C# SDKs "are updated to match".
- **Today (2026-11-18)**: `@modelcontextprotocol/server` and `/client` are at **2.4.0**,
  `@modelcontextprotocol/node` 2.1.2, `/express` and `/hono` 2.0.2, `/codemod` 2.4.0. The v1
  package `@modelcontextprotocol/sdk` is at **1.32.2** and serves 2025-era clients only. Python
  `mcp` is **2.3.0** (2026-10-02), Go SDK **v1.8.0** (2026-09-14), C# SDK **v2.4.0** (2026-11-07).

## What changed, and the SEP behind each change

From the [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog). The SEP
numbers are PR numbers in `modelcontextprotocol/modelcontextprotocol`.

| Change | SEP |
| --- | --- |
| Protocol-level sessions and the `Mcp-Session-Id` header removed; list endpoints "no longer vary per-connection"; cross-call state uses explicit server-minted handles passed as tool arguments | [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) |
| `initialize` / `notifications/initialized` removed; every request carries protocol version and client capabilities in `_meta`; `UnsupportedProtocolVersionError` on mismatch | [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) |
| `server/discover` added; servers MUST implement it | SEP-2575 |
| HTTP GET endpoint and `resources/subscribe` / `resources/unsubscribe` replaced by `subscriptions/listen` | SEP-2575 |
| `ping`, `logging/setLevel`, `notifications/roots/list_changed` removed; log level is per request | SEP-2575 |
| SSE resumability (`Last-Event-ID`, SSE event IDs) removed | SEP-2575 |
| Multi Round-Trip Requests replace server-initiated requests; required `resultType` on every result | [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) |
| Required `Mcp-Method` and `Mcp-Name` headers on Streamable HTTP POSTs, plus `x-mcp-header` custom headers | [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) |
| Required `ttlMs` and `cacheScope` on cacheable results (`CacheableResult`) | [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549) |
| Tasks moved to the `io.modelcontextprotocol/tasks` extension | [SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663) |
| Resource-not-found changes from `-32002` to `-32602` | SEP-2164 (named in the SDK beta post) |
| Error-code allocation: `-32000`..`-32019` legacy, `-32020`..`-32099` reserved for the spec; draft codes renumbered: `HeaderMismatch` `-32001` to `-32020`, `MissingRequiredClientCapability` `-32003` to `-32021`, `UnsupportedProtocolVersion` `-32004` to `-32022` | changelog, minor change 12 |
| `iss` in authorization responses (RFC 9207) | [SEP-2468](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2468) |
| `application_type` in Dynamic Client Registration | [SEP-837](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/837) |
| Client credentials bound to the issuing authorization server | [SEP-2352](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2352) |
| Dynamic Client Registration deprecated in favour of Client ID Metadata Documents | [PR #2858](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2858) |
| Roots, Sampling and Logging deprecated (12-month window) | [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) |
| HTTP+SSE transport reclassified as Deprecated; feature lifecycle policy | [SEP-2596](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2596) |
| JSON Schema 2020-12 keywords allowed in `inputSchema`/`outputSchema` | [SEP-2106](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2106) |

## The normative rules, quoted

### No handshake, no sessions

- [basic/index › Statelessness](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#statelessness):
  "all the information needed to process a request is contained in the request itself."
  "Servers **MUST NOT** rely on prior requests over the same connection to establish context
  (e.g., capabilities, protocol version, client identity)."
- [versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning):
  "There is no negotiation handshake. Every request carries its protocol version, and the server
  accepts or rejects each request independently."
- Dual-era servers are allowed: a server "that wishes to support both legacy clients (which expect
  an `initialize` handshake) and modern clients ... **MAY** implement both behaviors". A request
  carrying modern `_meta` "is served statelessly"; an `initialize` request selects legacy semantics.
  So answering `initialize` is not a violation, but requiring it is.
- A modern-only server "**SHOULD** name the protocol versions it supports in any error it returns
  to an `initialize` request".

### Per-request `_meta` fields

[basic/index › `_meta`](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#_meta):

| Key | Required |
| --- | --- |
| `io.modelcontextprotocol/protocolVersion` | yes |
| `io.modelcontextprotocol/clientCapabilities` | yes |
| `io.modelcontextprotocol/clientInfo` | no (SHOULD) |
| `io.modelcontextprotocol/logLevel` | no |

"A request missing any required field is malformed; the server **MUST** reject it with JSON-RPC
error code `-32602` (Invalid params). On HTTP, the response status **MUST** be `400 Bad Request`."
Servers "**SHOULD** include ... `io.modelcontextprotocol/serverInfo`" in every result's `_meta`.

### `server/discover`

[server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover):
"Servers **MUST** implement it." Result: `supportedVersions` (string array), `capabilities`,
optional `instructions`, `_meta["io.modelcontextprotocol/serverInfo"]` (SHOULD). In `schema.ts`,
`DiscoverResult extends CacheableResult`, so it also carries `ttlMs` and `cacheScope`.

### The required headers on every Streamable HTTP POST

[streamable-http › Request Metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#request-metadata):

| Header | Source field | Required for |
| --- | --- | --- |
| `MCP-Protocol-Version` | `params._meta["io.modelcontextprotocol/protocolVersion"]` | every POST |
| `Mcp-Method` | `method` | all requests |
| `Mcp-Name` | `params.name` or `params.uri` | `tools/call`, `resources/read`, `prompts/get` |

"These headers are **REQUIRED** for compliance." The header value of `MCP-Protocol-Version`
"**MUST** match" the `_meta` field; "If the values do not match, the server **MUST** reject the
request with `400 Bad Request` and a `HeaderMismatch` JSON-RPC error."

A server that supports pre-2025-06-18 clients "**MAY** treat a request that omits the header as
protocol version `2025-03-26`. A server that does not support such clients **MUST** reject a
request without the header."

Header names are case-insensitive; "Header _values_ (such as method names) are case-sensitive."

### The header/body agreement rule and `-32020`

[streamable-http › Server Validation](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation):

> Servers that process the request body **MUST** reject requests where the values specified in the
> headers do not match the corresponding values in the request body. This prevents potential
> security vulnerabilities when different components in the network rely on different sources of
> truth (e.g., a load balancer routing on the header value while the MCP server executes based on
> the body value).

> When rejecting a request due to header validation failure, servers **MUST** return HTTP status
> `400 Bad Request` and **MUST** include a JSON-RPC error response using the following error code:
> `-32020` `HeaderMismatch`.

Validation failure conditions: a required standard header is **missing**; a header value **does
not match** the body (after Base64 decoding for `Mcp-Name` and `Mcp-Param-{Name}`); a header value
**contains invalid characters**. Integer parameter values SHOULD be compared numerically.

In `schema.ts`: `export const HEADER_MISMATCH = -32020;` and `interface HeaderMismatchError` ("For
HTTP, the response status code MUST be `400 Bad Request`"). The example error is:

```json
{ "jsonrpc": "2.0", "id": 1,
  "error": { "code": -32020, "message": "Header mismatch: Mcp-Name header value 'foo' does not match body value 'bar'" } }
```

Intermediaries "**MUST** return an appropriate HTTP error status (e.g., `400 Bad Request`) for
validation failures but are not required to return a JSON-RPC error response", and intermediaries
that enforce policy on mirrored headers "**SHOULD** verify that the `MCP-Protocol-Version` header
indicates a version that requires header–body validation".

### Base64 sentinel, `Mcp-Param-{Name}` and `x-mcp-header`

- Values that cannot be a plain ASCII header value (non-ASCII, control characters, leading or
  trailing whitespace, or a value that itself looks like the sentinel) are sent as
  `=?base64?{Base64 of UTF-8}?=`. "servers **MUST** decode an encoded `Mcp-Name` or
  `Mcp-Param-{Name}` value before comparing it to the corresponding request body value."
- A tool parameter annotated with `x-mcp-header: "Region"` is mirrored by clients as
  `Mcp-Param-Region`. The annotation value MUST be non-empty, an RFC 9110 token, free of control
  characters, case-insensitively unique within the `inputSchema`, applied only to `string`,
  `integer` or `boolean` parameters (`number` is not permitted), and only to properties reachable
  through a chain of `properties` keys (no `items`, composition, conditionals or `$ref`).
- "Clients using the Streamable HTTP transport **MUST** reject tool definitions where any
  `x-mcp-header` value violates these constraints. Rejection means the client **MUST** exclude the
  invalid tool from the result of `tools/list`." So a server bug here silently hides a tool.
- "Server developers **SHOULD NOT** mark sensitive parameters (passwords, API keys, tokens, PII)
  with `x-mcp-header`, as header values are visible to network intermediaries."
- Server table: if the client omits a header but the value is in the body, "Server MUST reject the
  request"; a `null` or absent value means the server "MUST NOT expect the header".

### Version, method and capability errors

- Unsupported version: "**MUST** respond with `400 Bad Request` and an
  `UnsupportedProtocolVersionError` listing its supported versions": code `-32022`,
  `data.supported: string[]`, `data.requested: string`.
- Unknown method: "**MUST** respond with `404 Not Found` and a JSON-RPC error with code `-32601`".
  The JSON-RPC body is what tells a modern 404 apart from a legacy HTTP+SSE 404.
- Missing client capability: `MissingRequiredClientCapabilityError`, code `-32021`,
  `data.requiredCapabilities`, HTTP `400`.
- Error responses carry "the same ID as the request they correspond to (except in error cases
  where the ID could not be read due a malformed request)".

### One POST endpoint, and JSON or a request-scoped SSE stream

[streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http):

- "The server **MUST** provide a single HTTP endpoint path ... that supports POST."
- "If the body is a JSON-RPC _request_, the server **MUST** return either
  `Content-Type: application/json` (a single JSON object) or `Content-Type: text/event-stream` (an
  SSE response stream)." Clients MUST support both.
- On the SSE stream, notifications "**MUST** relate to the originating client request"; "The
  server **MUST NOT** send independent JSON-RPC _requests_ on this stream" (server-to-client input
  goes through MRTR); "The final JSON-RPC _response_ **SHOULD** terminate the stream."
- "servers **SHOULD** include the `X-Accel-Buffering: no` header" when starting an SSE stream.
- "Resumable SSE streams via `Last-Event-ID` are not supported."
- Closing the SSE response stream is the cancellation signal on HTTP.
- Notifications: `202 Accepted` with no body if accepted. "This revision of the core protocol
  defines no client-to-server _notifications_ over Streamable HTTP", and header requirements for
  notification POSTs "are not defined by this revision".
- Origin: "Servers **MUST** validate the `Origin` header ... If the `Origin` header is present and
  invalid, servers **MUST** respond with HTTP 403 Forbidden."

### Backward compatibility (what a modern server does with legacy traffic)

[streamable-http › Earlier Streamable HTTP Revisions](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions):
a server that supports only this revision "**SHOULD**" answer:

- HTTP GET or DELETE to the MCP endpoint: `405 Method Not Allowed`.
- An `Mcp-Session-Id` header on a request: "ignore it, and do not mint or echo session IDs."
- A `Last-Event-ID` header: ignore it.

RFC 9110 §15.5.6 also requires an `Allow` header on every `405` response.

### Results: `resultType` and server identity

- [basic/index › Result Responses](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#result-responses):
  "The `result` **MUST** include a `resultType` field". Values: `"complete"`, `"input_required"`.
- [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr): only
  `prompts/get`, `resources/read` and `tools/call` support `InputRequiredResult`; "Servers **MUST
  NOT** send `InputRequiredResult` responses on any other client requests."

### Caching: `ttlMs` and `cacheScope`

[server/utilities/caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching):
"Servers MUST include caching hints on results with `resultType: "complete"`" returned by
`server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list` and
`resources/read`. `ttlMs` is an integer in milliseconds and "Servers **MUST** provide a `ttlMs`
value that is `>= 0`". `cacheScope` is `"public"` (no user-specific data; shared caches may serve
it to anyone) or `"private"` (reuse only within one authorization context). All pages of one list
request MUST use the same `cacheScope`. `input_required` results "are not cacheable and carry no
caching hints". Security note: a `"public"` result from an authenticated endpoint may be shared
across tokens.

### `subscriptions/listen`

[basic/patterns/subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions):
one long-lived POST whose response is an SSE stream. Filter fields: `toolsListChanged`,
`promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions`. "The server **MUST** send
`notifications/subscriptions/acknowledged` as the first message carrying the subscription's ID in
`_meta` under `io.modelcontextprotocol/subscriptionId`", the value being the JSON-RPC id of the
listen request, and "**MUST NOT** send notification types the client has not explicitly
requested."

### Error codes

[basic/index › Error Codes](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#error-codes):

| Code | Name |
| --- | --- |
| `-32020` | `HeaderMismatch` |
| `-32021` | `MissingRequiredClientCapability` |
| `-32022` | `UnsupportedProtocolVersion` |

"Implementations of this protocol version **MUST NOT** emit these codes: `-32002` (resource not
found, 2025-11-25 and earlier; replaced by `-32602`), `-32042` (URL elicitation required,
2025-11-25 only)." For a missing resource, "servers **MUST** return a JSON-RPC error with code
`-32602`" and "**MUST NOT** return an empty `contents` array". Unknown tool is `-32602` too.

### Logging, removed methods, deprecations

- "The server **MUST NOT** emit `notifications/message` for a request that does not include"
  `io.modelcontextprotocol/logLevel`.
- `ping` and `logging/setLevel` are gone from the `ClientRequest` union in `schema.ts`, which is
  now: `server/discover`, `completion/complete`, `prompts/get`, `prompts/list`, `resources/list`,
  `resources/templates/list`, `resources/read`, `subscriptions/listen`, `tools/call`,
  `tools/list`.
- [Deprecated registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated):
  Roots, Sampling, Logging and Dynamic Client Registration (earliest removal: first revision on or
  after 2027-07-28); `includeContext` `thisServer`/`allServers`; the HTTP+SSE transport.

### Auth changes

[basic/authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
and the announcement:

- Authorization servers SHOULD send `iss` in authorization responses (RFC 9207) and MUST advertise
  `authorization_response_iss_parameter_supported`; clients MUST validate a present `iss` against
  the recorded issuer before redeeming the code (SEP-2468, closes AS mix-up).
- Clients MUST send an appropriate `application_type` during Dynamic Client Registration
  (SEP-837), so CLI and desktop `localhost` redirects stop being rejected.
- Client credentials are keyed by issuer and never reused across authorization servers (SEP-2352).
- Dynamic Client Registration is deprecated in favour of Client ID Metadata Documents (PR #2858).
- Scope accumulation on step-up (SEP-2350, named in the SDK beta post).
- Unchanged and still binding on servers: Protected Resource Metadata for discovery, audience
  validation of tokens (RFC 8707), `401` for invalid or expired tokens, tokens never in the query
  string, `Authorization` on every request.

Almost all of these are client and authorization-server obligations, which is why Statelint v1
does not test auth (the brief also rules auth out of v1). It forwards an `Authorization` header so
authenticated servers can be checked.

## How gateways enforce it in practice

- **agentgateway** validates headers against the body on every Streamable HTTP POST "ahead of any
  routing or session logic", "regardless of which protocol version the client negotiated", and
  answers `-32020` (`"Mcp-Name header/body mismatch"`, `"Mcp-Method header/body mismatch"`). Its
  argument: a header-only proxy is "not just insufficient but actively unsafe", because both copies
  are client-supplied and a proxy that trusts `Mcp-Name` can be steered to a different tool.
  ([post](https://agentgateway.dev/blog/2026-07-21-stateless-mcp-still-needs-mcp-native-dataplane/))
- **Tyk Gateway 5.16.0** (2026-10-27): "Modern requests must carry the `MCP-Protocol-Version` and
  `Mcp-Method` headers", plus `Mcp-Name` for `tools/call`, `resources/read` and `prompts/get`,
  checked at ingress before policy and rate limits so invalid requests consume no quota;
  "mismatches and unsupported versions are rejected with the corresponding spec-defined error";
  "Headerless legacy requests continue to work, falling back to protocol version 2025-03-26".
  [PR #8680](https://github.com/TykTechnologies/tyk/pull/8680) rejects modern GET, DELETE, PUT,
  PATCH, HEAD, CONNECT and TRACE with `405` and `Allow: POST`, and covers "mirrored-header
  multiplicity, encoding, UTF-8".
- **F5 NGINX Plus** ([DevCentral](https://community.f5.com/t/nginx-plus-as-mcp-security-gateway/77301)):
  routes and authorizes on `$http_mcp_method` / `$http_mcp_name` through a `map`, and uses an njs
  `js_access` hook that compares the headers with the body and returns a plain `400` (no JSON-RPC
  `-32020` body) on mismatch, which the spec allows for intermediaries.
- **Cloudflare** ([post](https://blog.cloudflare.com/mcp-v2)): the Agents SDK moves from
  `McpAgent` to `createMcpHandler`; servers that rely on sessions, server-to-client requests or
  standalone streams "run a strict stateless route beside the existing sessionful route", then
  drain and remove the legacy path.
- **Real client bug**: a report against Claude Desktop and Claude Code described them sending
  `MCP-Protocol-Version: 2025-11-25` with a `2026-07-28` body, which strict servers answered with
  `400` / `-32020` ([claudeissues.com #93290](https://claudeissues.com/issue/93290-bug-claude-desktop-claude-code-cli-send-mcp-protocol-version-2025-11-25-with-met)).
  Header/body disagreement is not hypothetical.

## New risks the revision introduced

- **Header/body desync** (Akamai): "Attackers can send conflicting values between the HTTP headers
  and the JSON-RPC request body", so a proxy and the server interpret one request differently,
  which can bypass controls, evade monitoring or mask actions. The spec's answer is the agreement
  rule above, and it only protects you if the server (and any header-trusting gateway) actually
  enforces it. That is the property Statelint tests.
- **Secrets in mirrored headers** (Akamai, and the spec's SHOULD NOT): mapping API keys, tokens or
  PII through `x-mcp-header` pushes them to "every load balancer, proxy, and logging system along
  the path".
- **Client-controlled state**: `_meta` and MRTR `requestState` round-trip through the client, so
  servers must treat them as untrusted (the spec requires integrity protection when `requestState`
  influences authorization or business logic).
- **Downgrade**: header validation exists only from 2026-07-28 on, which is why the spec tells
  header-trusting intermediaries to reject older or missing `MCP-Protocol-Version` values.
- **`cacheScope: "public"`** on an authenticated endpoint may be shared across tokens.
- Akamai also flags MCP Apps (stored XSS in panels) and task-creation cost (DoS); both are outside
  Statelint's scope.

## The TypeScript SDK migration path (facts `statelint migrate` relies on)

- **v2 is a package split**: `@modelcontextprotocol/server`, `/client`, `/core`, adapters `/node`,
  `/express`, `/hono`, `/fastify`, and the frozen `/server-legacy`. Node.js 20+.
- **The official codemod** (`npx @modelcontextprotocol/codemod@latest v1-to-v2 .`) contains one
  migration, `v1-to-v2` (import paths, symbol renames, handler registration, `extra` to `ctx`). It
  renames `StreamableHTTPServerTransport` to `NodeStreamableHTTPServerTransport` from
  `@modelcontextprotocol/node`, keeps `extra.sessionId` as `ctx.sessionId`, and moves
  `SSEServerTransport` to `@modelcontextprotocol/server-legacy/sse`. It does **not** switch the
  server to 2026-07-28. Its own guide, step 7: "The upgrade alone does not: a server that still ...
  hands requests to a `*StreamableHTTPServerTransport` serves 2025-era clients only."
- **Serving 2026-07-28 is an explicit opt-in**: "Nothing in v2 puts a 2026-07-28 byte on the wire
  by default." Over HTTP the entry point is `createMcpHandler(factory)` from
  `@modelcontextprotocol/server`, mounted on Node frameworks with `toNodeHandler(handler)` from
  `@modelcontextprotocol/node` (`app.all('/mcp', (req, res) => void node(req, res, req.body))`).
  The factory builds a fresh `McpServer` per request.
- **Both eras from one endpoint**: the default `legacy: 'stateless'` also serves 2025-era requests
  statelessly (legacy GET and DELETE answer `405`); `legacy: 'reject'` makes it modern-only. "A v1
  stateless `StreamableHTTPServerTransport` hosting (`sessionIdGenerator: undefined`, fresh
  transport per request) maps directly onto the default entry." A sessionful deployment keeps its
  2025 clients by routing `isLegacyRequest(request)` to the old handler in front of
  `createMcpHandler(factory, { legacy: 'reject' })`.
- **Host and Origin**: "`createMcpHandler` checks no `Host` or `Origin` header, so a server that set
  `enableDnsRebindingProtection` mounts host and origin validation in front of it"
  (`createMcpExpressApp`, or `localhostHostValidation()` / `localhostOriginValidation()`).
- **stdio**: replace `server.connect(new StdioServerTransport())` with
  `serveStdio(() => buildServer())` from `@modelcontextprotocol/server/stdio` (returns a handle).
- **Session state**: state keyed on `ctx.sessionId` moves to explicit handles in tool arguments, or
  to MRTR `requestState` (sealed with `createRequestStateCodec`, verified by
  `ServerOptions.requestState.verify`).
- **Server-to-client requests**: `ctx.mcpReq.elicitInput` / `requestSampling`, instance
  `createMessage()` / `elicitInput()` / `listRoots()` / `ping()` fail on 2026-era requests; return
  `inputRequired({ inputRequests: { … } })` instead; `UrlElicitationRequiredError` becomes
  `inputRequired.elicitUrl(...)`.
- **Change notifications**: `handler.notify.toolsChanged()` / `promptsChanged()` /
  `resourcesChanged()` / `resourceUpdated(uri)` publish to `subscriptions/listen` streams; across
  nodes, supply a shared `ServerEventBus`.
- **Logging**: `ctx.mcpReq.log()` is suppressed unless the request carries `logLevel`.
- **Cache hints**: when serving 2026-07-28 the SDK always emits both fields, defaulting to
  `ttlMs: 0` and `cacheScope: 'private'`; set real policies with `ServerOptions.cacheHints` or
  `cacheHint` on `registerResource`.
- **`x-mcp-header` on `z.number()`**: such a tool "is no longer listed by `Client.listTools()` on a
  2026-07-28 connection"; use `z.int()`.
- **Header enforcement in the SDK**: `createMcpHandler` validates `MCP-Protocol-Version`,
  `Mcp-Method` and `Mcp-Name` presence and agreement and answers `400` / `-32020`; a
  modern-enveloped request without `MCP-Protocol-Version` "is refused rather than served".
- **Era is decided by the body**: `isLegacyRequest` "returns `true` only for requests with no
  per-request `_meta` envelope claim". So a probe that omits the envelope is a legacy request to a
  dual-era server, and every Statelint probe must carry the envelope.

## Other SDKs (for the migration report)

- **Python** `mcp` v2: `FastMCP` becomes `MCPServer`; "a Python v2 server answers both protocol
  revisions from one endpoint". Migration: upgrade to `mcp>=2` and follow the
  [v2 migration guide](https://py.sdk.modelcontextprotocol.io/v2/migration/).
- **Go**: `2026-07-28` support since `v1.7.0-pre.1`; the HTTP transport accepts `2026-07-28` "only
  when you set `StreamableHTTPOptions.Stateless = true`".
- **C#**: v2 "HTTP transport defaults to the new stateless mode".

## Existing tools, and the gaps Statelint targets

| Tool | What it does | Gap |
| --- | --- | --- |
| [Official conformance suite](https://github.com/modelcontextprotocol/conformance) | Scenario framework for SDK maintainers. `server-stateless` covers discover, version mismatch `400`, invalid `_meta` `400`, unknown method `404`, unsupported version `400`, error ids, listen ack, log gating. | In the frozen `requirements/2026-07-28.yaml`, the server scenarios **`http-header-validation` and `http-custom-header-server-validation` (SEP-2243) are `not_scored`, "pending against the reference fixture"**. Several scenarios expect fixture tools (`test_missing_capability`, `test_logging_tool`, …). Its `Mcp-Name` mismatch case sends the server's **real first tool** with `arguments: {}`, so a server that skips validation executes that tool. No score, no fix text, no migration help. |
| [mcp-migration-check](https://github.com/AlpayC/mcp-migration-check) (npm, MIT, 5 stars) | Readiness probe and source scan with a letter grade: MCP001 legacy-only, MCP002 session state, MCP003-005 deprecated capabilities, MCP006 OAuth posture, MCP007-011 SDK versions; web demo; Action; agent skill; ecosystem snapshot (60.1% of 10,890 graded public servers legacy-only, 2026-08-23). | Answers "is this server on the new era?", not "does it enforce header/body agreement?". No codemods. |
| [mcp-migrate](https://github.com/dheerajjha/mcp-migrate) (PyPI, Apache-2.0, 12 stars) | Static rules R001-R021 with fixers, SARIF, a readiness board; Python-first. | Its README says `grade` and `score` are `null` for TypeScript-only trees; no `createMcpHandler` rewrite; no wire probe. |
| `@modelcontextprotocol/codemod` | `v1-to-v2` renames. | Leaves the transport on the 2025 era (see above). |
| Others: [mcp-conformance-kit](https://github.com/shriramkv/mcp-conformance-kit) (25 stars), [mcp-use/mcp-conformance-action](https://github.com/mcp-use/mcp-conformance-action), mcp-conformance-scanner, several "mcp-lint" repos | General MCP checks, tool-design linting. | None grade SEP-2243 server validation. |

So Statelint's honest edge:

1. **It grades the header/body agreement rule on the wire** (missing, mismatched and
   case-different `Mcp-Method`, `Mcp-Name` and `MCP-Protocol-Version`, Base64 sentinel decoding,
   `-32020` with `400`), which the official suite runs but does not score and the readiness checkers
   do not test.
2. **Its probes never execute anything**: discovery and list methods, plus deliberately invalid
   requests that name tools, prompts and resources that do not exist.
3. **It rewrites the TypeScript HTTP entry point** to `createMcpHandler` + `toNodeHandler`, the
   step the official codemod leaves to you, and refuses when the rewrite would not be safe.
4. A 0-100 score with a specific fix per failure, `--json`, an offline demo, and a GitHub Action.

## What differs from the brief

1. **"requires and echoes the mandatory headers"**: the spec defines the three headers as
   **request** headers only. There is no requirement for servers to echo them in responses. The only
   "echo" in the transport text is a prohibition: "do not mint or echo session IDs". Statelint
   therefore checks that the server **requires and validates** the headers, and that it never
   returns `Mcp-Session-Id`.
2. **`-32020` covers more than a mismatched `Mcp-Method`/`Mcp-Name`**: the same `400` /
   `HeaderMismatch` answer is required for a **missing** header, a mismatched or missing
   **`MCP-Protocol-Version`**, and invalid characters. The HTTP status must be `400`.
3. **The error's schema name is `HeaderMismatchError`** (`HEADER_MISMATCH = -32020`), as expected.
   It was `-32001` in drafts, and the 2026-07-28 changelog renumbered it, so servers built on RC or
   alpha SDKs may still send `-32001`. Statelint recognizes the draft codes and says so.
4. **`Mcp-Name` also carries `params.uri`** (for `resources/read`), and non-ASCII values use the
   `=?base64?…?=` sentinel that servers must decode.
5. **Caching applies to six operations, not five**: the changelog lists `tools/list`,
   `prompts/list`, `resources/list`, `resources/read` and `resources/templates/list`, but the
   caching page and `schema.ts` (`DiscoverResult extends CacheableResult`) add `server/discover`.
6. **GET/DELETE `405` and ignoring `Mcp-Session-Id` are SHOULDs**, so Statelint reports them as
   warnings, not failures.
7. **Answering `initialize` is allowed** (dual-era servers). Requiring it is the violation.
8. **SDK reality**: TypeScript v2 is stable (2.4.0), but upgrading does not switch the wire
   protocol; the official codemod handles only renames. The migration assistant is built around
   that fact.
9. **The official conformance suite already exists** and Statelint does not replace it; it covers
   the scored gap (SEP-2243 server validation), safety, scoring and migration.

## Keyword and landscape research (SEO and AEO)

### Search demand, measured

Google autocomplete (`suggestqueries.google.com`, `hl=en`) and DuckDuckGo autocomplete, queried
2026-11-18. "none" means no autocomplete volume yet, which for a four-month-old revision usually
means an open gap rather than zero interest.

| Query | Suggestions (abridged) |
| --- | --- |
| `stateless mcp` | stateless mcp **server / spec / protocol / meaning / update / anthropic / claude / 2.0**; DDG: **mcp stateless vs stateful**, stateless and stateful mcp |
| `mcp stateless` | mcp stateless **vs stateful / architecture update / spec / core / http** |
| `mcp 2026-07-28` | mcp 2026-07-28 **spec / protocol / release / claude / anthropic** |
| `mcp 2026` | mcp 2026-07-28, mcp 2026 roadmap, mcp 2026 update, mcp 2026 spec |
| `mcp-session-id` | **mcp-session-id header is required**, mcp session id **missing / is required / deprecated / stateless / example / fastmcp / agentcore**, mcp-session-id must be set |
| `mcp-protocol-version` | mcp-protocol-version **header**, mcp protocol version **latest / list / history**, **mcp unsupported protocol version** |
| `mcp initialize` | mcp initialize **request / response / handshake / capabilities** |
| `mcp server/discover` | mcp server/discover, mcp server discovery |
| `mcp sdk v2` | mcp sdk 2.0, **mcp typescript sdk v2**, mcp python sdk v2, mcp c# sdk v2 |
| `mcp new spec` | mcp new specification, mcp latest spec, anthropic new mcp spec |
| `mcp conformance` | **mcp conformance test**, mcp conformance test framework |
| `mcp server test` | mcp server **testing tool / tester / test online / testing framework / test client** |
| `mcp validator` | mcp validator, **mcp server validator**, mcp schema validator, **mcp server checker** |
| `mcp linter` | mcp linter, linter mcp server |
| `mcp streamable http` | mcp streamable http **vs sse / example / transport / server / spec** |
| `mcp github action` | mcp server github actions, claude mcp github actions |
| `mcp-method header` | mcp-method header (thin) |
| `mcp-name header`, `-32020`, `mcp header mismatch`, `mcp migration guide`, `migrate mcp server`, `createmcphandler` | none (open) |
| `mcp migration` | dominated by unrelated products (VS Code, Angular, Atlassian MCP) |

### What already ranks

- **Explainers are crowded.** "What changed" articles from Appwrite, Google Developers Blog,
  Cloudflare, AWS (two), Nango, Composio, Better Stack, InfoQ, Highflame, Equixly, the AAIF blog,
  agentgateway, and many individual blogs (digitalapplied, matthewswong, avinashsangle, sandbase,
  particula, vindler, opentools, eseospace, bovo-digital, azukiazusa, rohitghumare,
  developersdigest, computingforgeeks). Statelint's docs should not try to win "what is stateless
  MCP" with one more explainer; they should answer precise questions with verifiable detail.
- **`-32020` has a few thin pages** (eseospace error lookup, withone.ai "MCP's new routing header
  can disagree with the body", startdebugging gateway routing) and spec mirrors. None explains how
  to test that a server rejects mismatches.
- **Tools**: see the table above. GitHub has a handful of small repos; the largest MCP 2026-07-28
  repos are clients and servers (apify/mcpc 1,107 stars), not checkers.

### Gaps to target

1. **Testing the header/body agreement rule**: "test MCP header mismatch", "-32020
   HeaderMismatch", "Mcp-Method header", "Mcp-Name header", "MCP-Protocol-Version header". Exact
   ids that answer engines quote, with no tool answering them.
2. **Error-driven migration queries**: "Mcp-Session-Id header is required", "mcp session id
   deprecated", "mcp unsupported protocol version", "initialize handshake removed".
3. **TypeScript migration**: "migrate MCP server to 2026-07-28", "MCP TypeScript SDK v2
   stateless", "createMcpHandler", "sessionIdGenerator". The official codemod's gap is real and
   quotable.
4. **Borrowed head terms with proven demand**: "stateless MCP server", "MCP stateless vs stateful",
   "MCP conformance test", "MCP server testing tool / validator / checker", "MCP server GitHub
   Actions".

### Name collision

- **npm `statelint` is taken** by an unrelated CSS/Tailwind "interactive state coverage" linter
  (vitalratel, 0.1.0, 2025-11-27). `@wmfs/statelint` (Amazon States Language) exists too, and AWS
  Labs publishes a Ruby `statelint` for Step Functions. `npx statelint` would run someone else's
  package, so the docs must never say that.
- **The `@tanvir` npm scope already exists** (registered by an unknown owner, no packages), so it
  cannot be assumed to be ours. **`@nhtanvir` is unclaimed** and matches the GitHub account and
  the two earlier tools (`@nhtanvir/pollen`, `@nhtanvir/hookbench`). Package:
  **`@nhtanvir/statelint`**, binary `statelint`. Until it is published, the docs use
  `npx github:NHTanvir/statelint`.
- **SEO consequence**: the bare word "statelint" is contested, so every surface pairs it with the
  category: "Statelint, a stateless MCP (2026-07-28) conformance linter".

### Target keywords

| Tier | Keywords | Where they go |
| --- | --- | --- |
| Primary | stateless MCP, MCP 2026-07-28, MCP conformance, migrate MCP server to 2026-07-28 | repo description, README H1 and first paragraph, Action name and tagline, blog title |
| Secondary | header/body agreement, `-32020` HeaderMismatch, `Mcp-Method` / `Mcp-Name` / `MCP-Protocol-Version` headers, MCP conformance test, MCP TypeScript SDK v2, `createMcpHandler` | README headings, docs titles, FAQ |
| Supporting | stateless MCP server, MCP stateless vs stateful, Mcp-Session-Id removed, initialize handshake removed, `server/discover`, `ttlMs` / `cacheScope`, MCP server testing tool, MCP linter, GitHub Action for MCP | body copy, FAQ, topics |
| Exact ids | SEP-2243, SEP-2575, SEP-2567, SEP-2549, SEP-2322, `HeaderMismatchError`, `-32020`, `-32022`, `-32601`, `x-mcp-header`, `Mcp-Param-{Name}`, `=?base64?…?=` | explainer, rule reference, code blocks |

## Decisions for Statelint, from these notes

- **Every probe carries the full `_meta` envelope** and varies only what it tests, because the
  envelope is what makes a request modern to a dual-era server.
- **Probes are safe by construction**: `server/discover`, `tools/list`, `prompts/list`,
  `resources/list`, `resources/templates/list`, and invalid requests that name
  `statelint_probe_*` tools, prompts and `statelint://probe/*` resources that do not exist. No
  real tool is ever called and no real resource is read.
- **Rule levels follow the spec keyword**: MUST rules fail, SHOULD rules warn. Rules whose
  prerequisite failed are reported as blocked, and rules for capabilities the server does not
  advertise are skipped.
- **Header rules check "rejected with 400"; a separate rule checks that every header rejection
  used `-32020`**, so a server with the right status but the wrong code fails exactly one rule.
- **Draft error codes** (`-32001`, `-32003`, `-32004`) get a specific fix: the SDK predates the
  2026-07-28 renumbering.
- **Each rule cites the spec section, the SEP, and the official conformance check id** where one
  exists (`sep-2243-server-reject-invalid-headers`, `sep-2575-http-server-header-mismatch-400`,
  `sep-2549-tools-list-caching-hints`, …).
- **The migration assistant defers v1-to-v2 renames to the official codemod** and owns the
  stateless switch: entry point, sessions, GET/DELETE routes, resumability, session state, MRTR,
  notifications, error codes, DNS-rebinding protection. It rewrites code only for patterns it can
  match exactly and prints precise manual steps for everything else.
