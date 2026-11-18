# Statelint: stateless MCP 2026-07-28 conformance linter and migration tool

**Statelint checks that an MCP server really speaks the stateless 2026-07-28 spec (no `initialize`, no `Mcp-Session-Id`, `Mcp-Method` and `Mcp-Name` headers that agree with the body or get `-32020`), scores it 0-100, and rewrites TypeScript SDK servers to `createMcpHandler`.**

```bash
npx github:NHTanvir/statelint demo
```

That runs everything offline, with no network and no install: a compliant server scores 100/100, 35 deliberately broken servers each fail exactly one rule, and a stateful 2025-11-25 server is migrated in front of you. Then point it at your own server:

```bash
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp   # conformance score + a fix for every failure
npx github:NHTanvir/statelint migrate .                          # what to change; --diff to review, --write to apply
```

[![CI](https://github.com/NHTanvir/statelint/actions/workflows/ci.yml/badge.svg)](https://github.com/NHTanvir/statelint/actions/workflows/ci.yml)
![MCP 2026-07-28](https://img.shields.io/badge/MCP-2026--07--28-2f6feb)
![dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-2ea44f)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> **npm name.** `statelint` on npm is an unrelated CSS linter, so do not run `npx statelint`. This package is
> `@nhtanvir/statelint` (binary `statelint`); until it is published, use `npx github:NHTanvir/statelint`.

## What is Statelint?

Statelint is an open-source conformance linter and migration assistant for the stateless Model Context Protocol revision **2026-07-28**. `statelint check` sends at most 28 safe requests to a running MCP server and grades it on **33 rules** (23 MUST, 10 SHOULD) taken from the specification text, including the header/body agreement rule that returns `-32020 HeaderMismatch`. `statelint migrate` reads a 2025-11-25 server's code, lists exactly what must change to go stateless, and rewrites what it can prove safe. It is deterministic (no LLM), has zero runtime dependencies, and runs on Node.js 18 or later.

## How do I run the conformance check in GitHub Actions?

Add Statelint's Action after the step that starts your server. It waits for the endpoint (up to `wait`, default 30s), runs every rule, writes a table to the job summary, annotates each failure with its fix, and fails the job when a MUST rule fails:

```yaml
name: MCP 2026-07-28 conformance
on: [push, pull_request]

jobs:
  statelint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci && npm run build
      - run: npm start &                 # your MCP server, listening on port 3000
      - uses: NHTanvir/statelint@v0
        with:
          url: http://127.0.0.1:3000/mcp
          min-score: 90                  # 90+ always means every MUST rule passed
```

| Input | Default | What it does |
| --- | --- | --- |
| `url` | (required) | The MCP endpoint, for example `http://127.0.0.1:3000/mcp`. |
| `headers` | | Extra headers, one `Name: value` per line, for example `Authorization: Bearer ${{ secrets.MCP_TOKEN }}`. |
| `min-score` | | Fail below this score. Empty: fail only on MUST failures. |
| `strict` | `false` | Fail on SHOULD warnings too. |
| `only` / `skip` | | Comma-separated rule ids to run or leave out. |
| `wait` | `30s` | How long to wait for the server to start accepting connections. |
| `timeout` | `10000` | Per-request limit in milliseconds. |

Outputs: `score`, `conformant`, `failures`, `warnings`, `exit-code` and `report` (the path to the JSON report). Not on GitHub Actions? The CLI does the same anywhere: `npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp --wait 30s --min-score 90`.

## What is stateless MCP (2026-07-28)?

Stateless MCP is the [2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28) of the Model Context Protocol, in which "all the information needed to process a request is contained in the request itself". It removed the `initialize` handshake and protocol sessions (`Mcp-Session-Id`), so any request can reach any server instance behind a plain load balancer. Every request now carries its protocol version and client capabilities in `params._meta`, and every Streamable HTTP POST mirrors its method and target into the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, which servers must check against the body ([SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575), [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567), [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243)).

| | Stateful MCP (2025-11-25 and earlier) | Stateless MCP (2026-07-28) |
| --- | --- | --- |
| First request | `initialize`, then `notifications/initialized` | any request; `server/discover` is optional |
| Session | `Mcp-Session-Id` header, ended with `DELETE` | none; state travels as explicit handles in tool arguments |
| Version and capabilities | negotiated once per session | in `params._meta` of every request |
| HTTP endpoint | `POST`, plus a `GET` SSE stream | `POST` only; `GET` and `DELETE` get `405` |
| Routing headers | `MCP-Protocol-Version` after initialize | `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` on every POST, checked against the body |
| Change notifications | unsolicited, on the `GET` stream | `subscriptions/listen` stream, opt-in per type |
| Server-to-client requests | sampling, elicitation, roots sent to the client | Multi Round-Trip Requests: `resultType: "input_required"` |
| Caching | none | `ttlMs` and `cacheScope` on discovery and list results |

The full list, with the SEP behind each change, is in [What changed in stateless MCP](docs/what-changed-stateless-mcp.md).

## How do I check an MCP server against the 2026-07-28 spec?

Start your server, then run `statelint check` against its endpoint. Here is real output against a server that forgets to compare `Mcp-Name` with the body:

```text
$ statelint check http://127.0.0.1:3001/mcp
statelint 0.1.0 · MCP 2026-07-28 conformance check
target  http://127.0.0.1:3001/mcp
server  statelint-reference 0.1.0 · 2026-07-28 only · tools, prompts, resources
...
  ✗ FAIL    name-header-match          MUST   tools/call with Mcp-Name: statelint_probe_header_value and a different
            body target got HTTP 200, error -32602 "Unknown tool: statelint_probe_body_value"; … The server looked up the
            body's target and ignored the header, so anything that authorizes or routes on Mcp-Name can be bypassed.
            fix  Before dispatch, compare Mcp-Name (decoded if it uses =?base64?…?=) with params.name, or params.uri for
                 resources/read, and answer HTTP 400 with -32020 on any difference. …
            spec https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation
            seen name-mismatch-tools: POST tools/call · MCP-Protocol-Version: 2026-07-28 · Mcp-Method: tools/call ·
                 Mcp-Name: statelint_probe_header_value · _meta version 2026-07-28 → HTTP 200, error -32602 …
...
Score 89/100  30 passed · 1 failed · 0 warnings · 2 skipped  (97 ms)
Not conformant: 1 MUST rule failed (name-header-match).
```

Every failure comes with the request that exposed it, the response, a specific fix and the spec section. The same server with the check in place scores 100/100.

| Option | What it does |
| --- | --- |
| `-H "Authorization: Bearer $TOKEN"` | Send a header on every probe (repeatable). Statelint does no OAuth itself. |
| `--json` | Machine-readable report for CI. |
| `--min-score 90` | Exit 1 below a score. 90 or more always means every MUST rule passed. |
| `--strict` | Exit 1 on SHOULD warnings too. |
| `--summary "$GITHUB_STEP_SUMMARY"` | Append a Markdown table to a GitHub Actions job summary. |
| `--only rule,rule` / `--skip rule` | Run a subset of the rules. |

Exit codes: `0` conformant, `1` not conformant, `2` could not check (unreachable, or authentication needed). More in [Getting started](docs/getting-started.md).

## What does Statelint check?

33 rules in six groups. MUST rules fail, SHOULD rules warn, and each rule cites its spec section, its SEP and the matching check in the official conformance suite. The full table, with how each rule is tested, is in [docs/rules.md](docs/rules.md).

| Group | Rules | What it covers |
| --- | --- | --- |
| Stateless core | 6 | no `initialize` needed, `server/discover`, no `Mcp-Session-Id` issued or required, `GET`/`DELETE` answer `405`, legacy `initialize` is told the supported versions |
| Header/body agreement (SEP-2243) | 10 | missing, mismatched and case-different `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`; Base64-sentinel decoding; `-32020` on every rejection; valid and non-secret `x-mcp-header` annotations |
| Versions and errors | 5 | `-32022` with `data.supported`, `-32602` for incomplete `_meta`, `404` + `-32601` for unknown methods, error ids, `-32602` (not `-32002`) for missing resources |
| Results and caching | 4 | `resultType` on every result, `ttlMs` and `cacheScope` (SEP-2549), `serverInfo` in `_meta`, deterministic `tools/list` order |
| Responses: JSON and SSE | 7 | `application/json` or `text/event-stream`, one response per SSE stream, no server-to-client requests, no unrequested logs, stream closes, `X-Accel-Buffering: no`, `subscriptions/listen` acknowledgment |
| Security | 1 | foreign `Origin` refused (DNS rebinding) |

### Is it safe to run against a production server?

Yes, by construction. Statelint only calls `server/discover` and the list methods (`tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`), and sends deliberately invalid requests that name tools, prompts and resources that do not exist (`statelint_probe_*`, `statelint://probe/*`). It never calls one of your tools and never reads one of your resources; a test in this repository records every request to prove it. The official conformance suite's `Mcp-Name` mismatch case, by contrast, sends your first real tool with empty arguments, so a server that skips validation executes it.

## What is the -32020 HeaderMismatch error?

`-32020` (`HeaderMismatch`, defined in the schema as `HeaderMismatchError`) is the JSON-RPC error a 2026-07-28 server returns, with HTTP `400 Bad Request`, when a request's `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` or `Mcp-Param-*` header is missing, malformed, or does not match the corresponding value in the JSON-RPC body. The [specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation) says:

> Servers that process the request body **MUST** reject requests where the values specified in the headers do not match the corresponding values in the request body. This prevents potential security vulnerabilities when different components in the network rely on different sources of truth (e.g., a load balancer routing on the header value while the MCP server executes based on the body value).

```json
{ "jsonrpc": "2.0", "id": 1,
  "error": { "code": -32020, "message": "Header mismatch: Mcp-Name header value 'foo' does not match body value 'bar'" } }
```

Gateways already route and authorize on these headers: [agentgateway](https://agentgateway.dev/blog/2026-07-21-stateless-mcp-still-needs-mcp-native-dataplane/) rejects mismatches with `-32020`, and [Tyk Gateway 5.16](https://tyk.io/docs/developer-support/release-notes/gateway) checks them at ingress before rate limits. [Akamai's analysis](https://www.akamai.com/blog/security-research/new-mcp-specification-security-teams-must-prepare) of the revision calls the resulting attack class "protocol confusion (desync)": "Attackers can send conflicting values between the HTTP headers and the JSON-RPC request body." A server that does not enforce the rule lets a gateway authorize one tool while the server runs another. `-32020` was `-32001` in the pre-release drafts, so servers built on release-candidate SDKs may still send the old number; Statelint names that case.

Statelint sends eight kinds of header probe (`MCP-Protocol-Version` missing and contradicting `_meta`; `Mcp-Method` missing, contradicting and differing only in case; `Mcp-Name` missing and contradicting on `tools/call`, `prompts/get` and `resources/read`; and a Base64-encoded `Mcp-Name` that must be decoded) and checks that every rejection uses `-32020`.

## How do I migrate an MCP server to stateless 2026-07-28?

For a TypeScript server on the official SDK: upgrade the packages with the SDK's own codemod, then let Statelint switch the transport, which the SDK codemod deliberately leaves alone.

```bash
npx @modelcontextprotocol/codemod@latest v1-to-v2 .   # @modelcontextprotocol/sdk v1 → v2 packages (renames only)
npx github:NHTanvir/statelint migrate . --diff         # review what Statelint would change
npx github:NHTanvir/statelint migrate . --write        # apply it
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp   # verify on the wire
```

An abridged excerpt of the diff Statelint produces for the [bundled example](examples/stateful-notes-server), a sessionful Express server (+9 lines, −56 in `src/http.ts`):

```diff
-import { randomUUID } from 'node:crypto';
-import { isInitializeRequest } from '@modelcontextprotocol/server';
-import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
+import { createMcpHandler } from '@modelcontextprotocol/server';
+import { toNodeHandler } from '@modelcontextprotocol/node';
 …
-const transports: { [sessionId: string]: NodeStreamableHTTPServerTransport } = {};
+const mcpHandler = createMcpHandler(() => buildServer());
+const mcpNodeHandler = toNodeHandler(mcpHandler);
+app.all('/mcp', (req, res) => void mcpNodeHandler(req, res, req.body));
-app.post('/mcp', async (req, res) => { … session routing … });
-const handleSessionRequest = async (req, res) => { … };
-app.get('/mcp', handleSessionRequest);
-app.delete('/mcp', handleSessionRequest);
```

The codemods are conservative. `http-entry` rewrites a route only after proving the handler contains nothing but transport and session plumbing; it refuses, with the reason and the line, when the route does anything else, when the server instance is shared between requests, or when tools still read `ctx.sessionId`. When the old transport validated `Host`/`Origin`, it inserts a TODO and keeps the finding open, because `createMcpHandler` validates neither. Python (`mcp` v1 → v2) and Go (`go-sdk` before v1.7.0, `Stateless: true`) projects get SDK and transport findings with manual steps. The step-by-step guide is [Migrate your MCP server to 2026-07-28](docs/migrate-to-2026-07-28.md).

## How is Statelint different from the official MCP conformance suite?

They answer different questions, and you can use both. Statelint is a black-box linter for any running server; the [official suite](https://github.com/modelcontextprotocol/conformance) is a scenario framework for SDK maintainers.

| | Statelint | [Official conformance suite](https://github.com/modelcontextprotocol/conformance) | [mcp-migration-check](https://github.com/AlpayC/mcp-migration-check) | [mcp-migrate](https://github.com/dheerajjha/mcp-migrate) | [SDK codemod](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/codemod) |
| --- | --- | --- | --- | --- | --- |
| Grades SEP-2243 header/body agreement (`-32020`) on the wire | yes, 8 probes, scored | runs `http-header-validation`, but the frozen 2026-07-28 requirements mark it `not_scored` ("pending against the reference fixture") | no (readiness: legacy vs modern era) | no (static) | no |
| Works on any server, without special test tools | yes | several scenarios expect fixture tools such as `test_logging_tool` | yes | n/a | n/a |
| Never executes your tools | yes | sends your first real tool with `arguments: {}` | yes | n/a | n/a |
| 0-100 score and a fix per failure | yes | pass/fail per check | letter grade | letter grade (not for TypeScript-only trees) | n/a |
| Rewrites the TypeScript transport to `createMcpHandler` | yes, with refusals | no | no (agent skill) | no | no (renames only) |
| Offline demo and broken fixtures | 35, one per rule | reference fixtures | live web demo | fixtures | n/a |

The closest Action on the Marketplace, [MCP Stateless Check](https://github.com/marketplace/actions/mcp-stateless-check), probes a running server for 2026-07-28 readiness over stdio and HTTP (21 rules). Its header rule checks that a server *accepts* `Mcp-Method` and `Mcp-Name`; Statelint checks that it *rejects* missing and contradicting ones with `-32020`, and Statelint checks HTTP servers only. If your goal is "is my server on the new protocol at all", mcp-migration-check's ecosystem scan is a good read: its [2026-08-23 snapshot](https://mcp-migration-check.alpaycelik.workers.dev/state-of-mcp) found that 60.1% of 10,890 gradable public MCP servers still served only the legacy protocol. Statelint answers the next question: once a server says it speaks 2026-07-28, does it enforce the rules that keep gateways and servers in agreement?

## Use it in any CI

`statelint check` exits non-zero when a MUST rule fails, so any CI system can gate on it, with or without the GitHub Action above:

```bash
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp --wait 30s --min-score 90 --json > statelint.json
```

`--json` prints the full report (every rule's status, message, fix, evidence and the requests sent), and `statelint migrate . --json` fails while required migration steps remain.

## Rules

| Rule | Level | Rule | Level |
| --- | --- | --- | --- |
| `no-handshake` | MUST | `unsupported-version` | MUST |
| `server-discover` | MUST | `meta-required` | MUST |
| `no-session-id` | SHOULD | `unknown-method-404` | MUST |
| `session-id-ignored` | SHOULD | `error-id-echo` | MUST |
| `legacy-methods-405` | SHOULD | `resource-not-found-code` | MUST |
| `initialize-names-versions` | SHOULD | `result-type` | MUST |
| `version-header-required` | MUST | `cache-hints` | MUST |
| `version-header-match` | MUST | `server-info` | SHOULD |
| `method-header-required` | MUST | `tools-order` | SHOULD |
| `method-header-match` | MUST | `response-content-type` | MUST |
| `name-header-required` | MUST | `sse-single-response` | MUST |
| `name-header-match` | MUST | `sse-no-server-requests` | MUST |
| `name-header-base64` | MUST | `sse-no-unrequested-logs` | MUST |
| `header-error-code` | MUST | `sse-closes` | SHOULD |
| `x-mcp-header-valid` | MUST | `sse-x-accel-buffering` | SHOULD |
| `x-mcp-header-no-secrets` | SHOULD | `subscriptions-listen` | MUST |
| | | `origin-validation` | SHOULD |

What each one sends and expects: [docs/rules.md](docs/rules.md), or `statelint rules --verbose`. The 29 migration findings and 3 codemods are listed there too.

## FAQ

### Does Statelint need an LLM, an API key or a network connection?

No. It is deterministic TypeScript with zero runtime dependencies. `check` talks only to the URL you give it, and `demo` uses in-process servers with no sockets at all.

### Does my server have to drop 2025-11-25 clients?

No. The spec allows dual-era servers, and the TypeScript SDK's `createMcpHandler` serves 2025-era clients statelessly from the same endpoint by default. Statelint reports a server that answers a legacy `initialize` as "dual-era" and does not count it against you; what it fails is a server that *requires* the handshake.

### Why does a missing `Mcp-Session-Id` not fix everything?

Sessions often hid application state. After migration, state that must span calls belongs in explicit handles that a tool returns and later calls take as arguments ([Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools)), or in Multi Round-Trip Requests' `requestState`. `statelint migrate` flags every `ctx.sessionId` read for that reason.

### Which caching fields are required, and on which results?

`ttlMs` (integer milliseconds, `>= 0`) and `cacheScope` (`"public"` or `"private"`) on complete results of `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list` and `resources/read` ([SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549), [caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)). The changelog lists five of these; the caching page and `schema.ts` (`DiscoverResult extends CacheableResult`) add `server/discover`.

### What should a 2026-07-28 server do with GET, DELETE and Mcp-Session-Id from old clients?

Answer `GET` and `DELETE` with `405 Method Not Allowed`, ignore an incoming `Mcp-Session-Id`, and never mint or echo one ([Earlier Streamable HTTP Revisions](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions)). These are SHOULDs, so Statelint warns rather than fails.

### Can I use Statelint as a library?

Yes: `runCheck(url, options)`, `runMigrate(path)`, `createReferenceServer({ fault })` and the protocol helpers (`encodeHeaderValue`, `validateXMcpHeaders`, …) are exported from the package entry.

```ts
import { runCheck } from "@nhtanvir/statelint";
const report = await runCheck("http://127.0.0.1:3000/mcp");
console.log(report.score, report.conformant, report.rules.filter((r) => r.status === "fail"));
```

### How do I try a specific failure?

`statelint serve --fault <id>` runs the bundled reference server with exactly one rule broken (35 faults; `statelint serve --help` lists them), and `statelint demo --fault <id>` prints its full report.

## Sources

Statelint's rules come from the [2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28), its [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) and [`schema.ts`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts), the SEPs ([2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575), [2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567), [2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243), [2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549), [2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)), and the TypeScript SDK's [2026-07-28 migration guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md). Every claim is traced to its source in [docs/RESEARCH.md](docs/RESEARCH.md).

## Contributing and license

Bug reports, false positives and new rules are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed. Spec revision 2026-07-28 · Statelint 0.1.0 · updated 2026-11-18.
