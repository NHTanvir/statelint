# How to migrate an MCP server to the stateless 2026-07-28 spec

To migrate an MCP server to the 2026-07-28 revision, drop the `initialize` handshake and `Mcp-Session-Id` sessions, and serve every request on its own from a single POST endpoint. That endpoint must validate the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers against the body, and state that used to live in the session moves into explicit handles. On the official TypeScript SDK, that means moving to the v2 packages and replacing `StreamableHTTPServerTransport` with `createMcpHandler`. `npx github:NHTanvir/statelint migrate .` lists every place to change and rewrites the entry point when it can prove the rewrite is safe.

*Statelint 0.1.0 · spec revision 2026-07-28 · TypeScript SDK 2.4.0 · updated 2026-11-18*

## What has to change?

| Area | 2025-11-25 (stateful) | 2026-07-28 (stateless) | Source |
| --- | --- | --- | --- |
| Opening | `initialize` + `notifications/initialized` | none; `server/discover` is optional for clients, MUST for servers | [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) |
| Sessions | `Mcp-Session-Id`, `DELETE` to end | none; explicit handles in tool arguments | [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) |
| Per-request context | negotiated once | `_meta.protocolVersion`, `clientCapabilities` (required), `clientInfo` | SEP-2575 |
| HTTP shape | `POST` + `GET` stream + `DELETE` | `POST` only; `GET`/`DELETE` → `405` | [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| Headers | `MCP-Protocol-Version` after initialize | `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`; mismatch → `400` + `-32020` | [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243) |
| Server → client | `elicitation/create`, `sampling/createMessage`, `roots/list` requests | `resultType: "input_required"` + `inputRequests`; client retries | [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) |
| Notifications | unsolicited on the `GET` stream; `resources/subscribe` | `subscriptions/listen`, opt-in per type | SEP-2575 |
| Resumability | `Last-Event-ID`, event store | removed; a broken stream loses the request | SEP-2575 |
| Results | no `resultType` | `resultType` on every result; `ttlMs` + `cacheScope` on discovery and lists | SEP-2322, [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549) |
| Errors | `-32002` resource not found | `-32602`; `-32020`/`-32021`/`-32022` defined | [Error codes](https://modelcontextprotocol.io/specification/2026-07-28/basic/index#error-codes) |
| Removed | `ping`, `logging/setLevel` | log level is per request; logging, sampling, roots deprecated | changelog, [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) |

## Step by step on the TypeScript SDK

### 1. See what has to change

```bash
npx github:NHTanvir/statelint migrate .
```

Statelint scans the project (skipping `node_modules`, `dist` and similar), reads `package.json`, and reports every finding with its file, line, the change to make and the source, grouped as required, recommended and info. It also tells you which findings its codemods can fix and prints an ordered plan.

### 2. Move from `@modelcontextprotocol/sdk` (v1) to the v2 packages

If `package.json` still depends on `@modelcontextprotocol/sdk`, run the SDK's own codemod at the package root first:

```bash
npx @modelcontextprotocol/codemod@latest v1-to-v2 .
npm install
```

It rewrites imports and renamed APIs (`McpError` → `ProtocolError`, `.tool()` → `registerTool`, `extra` → `ctx`, `StreamableHTTPServerTransport` → `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`). It does **not** switch the protocol. The SDK's guide says so itself: "a server that still … hands requests to a `*StreamableHTTPServerTransport` serves 2025-era clients only." The next step does that.

### 3. Switch the HTTP entry point to `createMcpHandler`

```bash
npx github:NHTanvir/statelint migrate . --diff    # review
npx github:NHTanvir/statelint migrate . --write   # apply
```

For an Express route that hosts the transport (sessionful or stateless), Statelint replaces the route, the session map, the `isInitializeRequest` branch, the `GET`/`DELETE` routes and the unused imports with three lines:

```ts
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';

const mcpHandler = createMcpHandler(() => buildServer());
const mcpNodeHandler = toNodeHandler(mcpHandler);
app.all('/mcp', (req, res) => void mcpNodeHandler(req, res, req.body));
```

`createMcpHandler` builds a fresh server from your factory for every request, serves 2026-07-28, and by default also serves 2025-era clients statelessly (`legacy: 'stateless'`), answering their `GET` and `DELETE` with `405`. Middleware on the old route (for example an auth check) is kept; `enableJsonResponse: true` becomes `{ responseMode: 'json' }`.

If you write it by hand, the factory must build the server and register its tools inside the function, never return one shared instance:

```ts
function buildServer() {
  const server = new McpServer({ name: 'notes', version: '1.4.0' });
  server.registerTool('add-note', { description: 'Save a note', inputSchema: z.object({ text: z.string() }) }, async ({ text }) => ({
    content: [{ type: 'text', text: `Saved: ${text}` }],
  }));
  return server;
}
```

### 4. Keep DNS-rebinding protection

`createMcpHandler` validates no `Host` and no `Origin` header. If your old transport set `enableDnsRebindingProtection`, `allowedHosts` or `allowedOrigins`, switching entry points silently drops that protection, so Statelint inserts a `TODO(statelint)` and keeps the finding open until you deal with it. With Express, the simplest fix is the SDK's app factory, which applies `express.json()` and Host/Origin validation for localhost binds:

```ts
import { createMcpExpressApp } from '@modelcontextprotocol/express';

const app = createMcpExpressApp();                       // instead of express() + express.json()
// binding to 0.0.0.0? name your hosts: createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['api.example.com'] })
```

On plain `node:http`, put `localhostHostValidation()` and `localhostOriginValidation()` from `@modelcontextprotocol/node` in front of the handler. Then delete the TODO comment, and `statelint check` should show `origin-validation` passing.

### 5. Replace per-session state with explicit handles

Anything you stored per session (a cart, a browser context, a transaction) no longer has a session to hang off: `ctx.sessionId` is undefined for 2026-07-28 clients. The spec's answer is a handle that one tool returns and later calls take as an argument ([Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools)):

```ts
server.registerTool('create_basket', { description: 'Start a basket. Baskets expire after 24 hours.', inputSchema: z.object({}) }, async () => {
  const basket_id = `bsk_${randomUUID()}`;
  await baskets.create(basket_id);
  return { content: [{ type: 'text', text: `Created basket ${basket_id}` }], structuredContent: { basket_id } };
});

server.registerTool('add_item', { inputSchema: z.object({ basket_id: z.string(), sku: z.string() }) }, async ({ basket_id, sku }) => {
  await baskets.add(basket_id, sku);   // check the caller may use this basket on every call
  return { content: [{ type: 'text', text: `Added ${sku}` }] };
});
```

For state that only spans the rounds of one interaction, use Multi Round-Trip Requests' `requestState`, which the SDK seals with `createRequestStateCodec` (step 6). `statelint migrate` refuses to rewrite the entry point while any `ctx.sessionId` read remains, because the rewrite would break it.

### 6. Turn elicitation, sampling and roots into Multi Round-Trip Requests

Servers no longer send requests to the client. A handler that needs input returns an `InputRequiredResult`, and the client retries the original call with the answers ([SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)). In the TypeScript SDK the mechanical change is:

| Before | After |
| --- | --- |
| `await ctx.mcpReq.elicitInput({ … })` | `return inputRequired({ inputRequests: { confirm: inputRequired.elicit({ … }) } })`, then read `acceptedContent(ctx.mcpReq.inputResponses, 'confirm')` on the retry |
| `await ctx.mcpReq.requestSampling({ … })` | the same, with a sampling input request |
| `throw new UrlElicitationRequiredError([…])` | `return inputRequired({ inputRequests: { link: inputRequired.elicitUrl({ … }) } })` |

On 2025-era connections the SDK's legacy shim turns the same `inputRequired(...)` return into a real server-to-client request, so one handler serves both eras. See the SDK's [Multi-round-trip requests](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md#multi-round-trip-requests) section for multi-step flows.

### 7. Publish change notifications through the handler

With a fresh server per request, `server.sendToolListChanged()` on one instance reaches nobody. Clients that want change notifications open a `subscriptions/listen` stream; you publish through the handler:

```ts
const mcpHandler = createMcpHandler(() => buildServer());
// …when the tool set changes:
mcpHandler.notify.toolsChanged();
mcpHandler.notify.resourceUpdated('notes://42');
```

Across several processes, give `createMcpHandler` a shared `ServerEventBus` (for example over Redis pub/sub) so every node's listen streams see every change.

### 8. Serve stdio with `serveStdio`

A server connected directly to `StdioServerTransport` keeps speaking the 2025 era, whatever SDK version is installed. Statelint rewrites the common factory form:

```diff
-import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
+import { serveStdio } from '@modelcontextprotocol/server/stdio';
 import { buildServer } from './build-server.js';

-await buildServer().connect(new StdioServerTransport());
+serveStdio(() => buildServer());
```

If your stdio server is a module-level `const server = new McpServer(…)` with registrations below it, wrap that block in `function buildServer() { … return server; }` and call `serveStdio(buildServer)`. Statelint refuses to move registrations for you and says so.

### 9. Fix error codes

Use `-32602` (Invalid params) for a missing resource or unknown tool; `-32002` is retired and 2026-07-28 servers MUST NOT send it. Code written against the pre-release drafts may use `-32001`, `-32003` and `-32004`; the final numbers are `-32020` (HeaderMismatch), `-32021` (MissingRequiredClientCapability) and `-32022` (UnsupportedProtocolVersion). `statelint migrate --write` renumbers these where the line clearly constructs or names the error.

### 10. Set cache hints (optional, but cheap)

When it serves 2026-07-28, the SDK always sends `ttlMs: 0` and `cacheScope: "private"`, which is conformant but lets no client cache anything. Set `ServerOptions.cacheHints` (or `cacheHint` on `registerResource`) with real TTLs, and `"public"` for lists that are the same for every caller.

### 11. Verify on the wire

```bash
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp
```

A score of 90 or more means every MUST rule passed. Put the same command in CI with `--wait 30s --min-score 90` so a regression fails the build.

## How do I keep 2025-11-25 clients working?

You do not have to drop them. The spec allows dual-era servers, and `createMcpHandler` serves both eras from one endpoint by default: a request with the per-request `_meta` envelope is served as 2026-07-28, and one without it is served statelessly as 2025-era. If some clients depend on real 2025 sessions (a standalone `GET` stream, server-to-client requests), keep your old transport for them and route in front of a strict handler:

```ts
import { createMcpHandler, isLegacyRequest } from '@modelcontextprotocol/server';

const modern = createMcpHandler(buildServer, { legacy: 'reject' });
export default {
  async fetch(request: Request) {
    if (await isLegacyRequest(request)) return myExistingLegacyHandler(request);
    return modern.fetch(request);
  },
};
```

Drain and remove the legacy path during the deprecation window. Cloudflare's [migration write-up](https://blog.cloudflare.com/mcp-v2) describes the same staged rollout.

## What will `statelint migrate` not rewrite, and why?

The codemods change code only when they can prove the result is equivalent. Each refusal names the reason and the line:

| Refusal | Why |
| --- | --- |
| "still on the v1 SDK" | The entry-point rewrite produces v2 code; run the official `v1-to-v2` codemod first. |
| "does more than host the transport (line N …)" | The route has logic besides session and transport plumbing (metrics, auth, rewriting the body); a rewrite would drop it. Move it into middleware or tools. |
| "a shared instance declared outside the request handler" | `createMcpHandler` needs a factory that builds a fresh server per request. |
| "constructed inline in the handler" | Registrations would have to move; put construction in a factory function. |
| "built with arguments" | The factory takes request data; pass it through `createMcpHandler`'s factory context (`authInfo`, `requestInfo`) instead. |
| "tools read ctx.sessionId" | Session-keyed state would break; replace it with handles (step 5) first. |
| "an option statelint does not know how to carry over" | An unrecognised transport option might change behaviour. |
| "module-level new McpServer" (stdio) | Wrapping registrations in a factory is a judgment call left to you. |

After every rewrite the output is re-tokenized and bracket-checked before anything is written.

## What about Python, Go and C#?

- **Python** (`mcp`): v2 renames `FastMCP` to `MCPServer`, and "a Python v2 server answers both protocol revisions from one endpoint". Pin `mcp>=2` and follow the [v2 migration guide](https://py.sdk.modelcontextprotocol.io/v2/migration/). Statelint flags v1 pins and `FastMCP`.
- **Go** (`github.com/modelcontextprotocol/go-sdk`): 2026-07-28 support arrived in v1.7.0 on the same module path, and the HTTP transport accepts it "only when you set `StreamableHTTPOptions.Stateless = true`". Statelint flags older versions and options without `Stateless: true`.
- **C#** (`ModelContextProtocol` 2.x): the HTTP transport is stateless by default in v2.

`statelint check` is language-neutral: it tests the running server over HTTP whatever it is written in.

## What else changes in your infrastructure?

- **Load balancers:** sticky sessions are no longer needed; round robin works.
- **Proxies and CDNs:** pass `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and `Mcp-Param-*` through, and do not buffer SSE (the server sends `X-Accel-Buffering: no`).
- **Gateways:** gateways that route or authorize on the new headers (agentgateway, Tyk 5.16, NGINX with njs) assume the server rejects header/body mismatches. Statelint's `method-header-match` and `name-header-match` rules check exactly that.
- **CORS:** browser clients need the new headers in `Access-Control-Allow-Headers`.

## FAQ

### Is 2026-07-28 backwards compatible with 2025-11-25?

Not on the wire: a legacy client's `initialize` reaches a modern-only server without the required headers and is rejected, and a modern client's request means nothing to a legacy server. Compatibility comes from dual-era servers and clients: modern clients fall back to `initialize` when a server does not answer like a modern one, and dual-era servers answer both.

### Do I have to rewrite my tools?

Usually not. Tool, prompt and resource handlers keep their shape. What changes is the entry point, anything keyed on the session, and code that asked the client for input (elicitation, sampling, roots).

### How long will 2025-era servers keep working?

Nothing switched off on July 28: the date is when the normative text was published. The deprecated features (Roots, Sampling, Logging, Dynamic Client Registration) have at least twelve months before they can be removed (earliest: the first revision released on or after 2027-07-28).

### Can `statelint migrate` run in CI?

Yes. `statelint migrate . --json` exits 1 while required findings remain, so it can block a regression to session-based code.
