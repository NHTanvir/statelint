# Getting started: test an MCP server against the stateless 2026-07-28 spec

To test an MCP server against the stateless 2026-07-28 specification, start the server and run `npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp`. Statelint sends at most 28 safe requests, grades the server on 33 rules from the spec text, prints a 0-100 score with a fix for every failure, and exits non-zero when a MUST rule fails. Nothing to install, no account, and no LLM.

*Statelint 0.1.0 · spec revision 2026-07-28 · updated 2026-11-18*

## How do I run Statelint?

You need Node.js 18 or later. Run it straight from GitHub:

```bash
npx github:NHTanvir/statelint --help
```

or install it into a project and call the `statelint` binary:

```bash
npm install --save-dev github:NHTanvir/statelint
npx statelint check http://127.0.0.1:3000/mcp     # resolves to the local install
```

The npm package will be `@nhtanvir/statelint`. Do not run a bare `npx statelint` outside a project that has it installed: the `statelint` name on npm belongs to an unrelated CSS linter.

## How do I see what Statelint does before pointing it at my server?

```bash
npx github:NHTanvir/statelint demo
```

The demo is fully offline. It runs the checker against in-process servers (no sockets, no network): Statelint's reference server in JSON mode and in SSE mode (both score 100/100), then 35 deliberately broken copies, each with exactly one rule broken, and finally the migration assistant on a bundled 2025-11-25 server. `statelint demo --fault <id>` prints the full report for one broken server.

## How do I check my own MCP server?

```bash
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp
```

Point it at the MCP endpoint itself (usually `/mcp`), not the site root. For a server behind authentication, pass the token as a header; Statelint sends it on every request but does no OAuth itself:

```bash
npx github:NHTanvir/statelint check https://mcp.example.com/mcp -H "Authorization: Bearer $MCP_TOKEN"
```

A server that answers everything with `401` or `403` gets an *inconclusive* result (exit code 2) and a hint to pass a token, not a failing score.

## Which requests does Statelint send, and are they safe?

Every request carries the full 2026-07-28 `_meta` envelope (`io.modelcontextprotocol/protocolVersion`, `clientCapabilities`, `clientInfo`) and changes only the one thing it tests. Statelint calls `server/discover` and the list methods your server advertises, and sends deliberately wrong requests (a missing header, a contradicting header, an unknown protocol version, an unknown method) that name tools, prompts and resources that do not exist: `statelint_probe_*` and `statelint://probe/*`. It never calls one of your tools and never reads one of your resources. The last requests are a 2025-11-25 `initialize` (to see how the server treats old clients; any session it opens is closed with `DELETE`), a cross-origin request, a short `subscriptions/listen` that is closed after its first message, and a `tools/list` that asks for progress.

## How do I read the report?

```text
Header/body agreement (SEP-2243)
  ✓ pass    version-header-required    MUST   Rejects a request without MCP-Protocol-Version
  ✗ FAIL    name-header-match          MUST   tools/call with Mcp-Name: statelint_probe_header_value and a different body …
            fix  Before dispatch, compare Mcp-Name (decoded if it uses =?base64?…?=) with params.name, …
            spec https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation
            seen name-mismatch-tools: POST tools/call · … · Mcp-Name: statelint_probe_header_value … → HTTP 200, error -32602 …

Score 89/100  30 passed · 1 failed · 0 warnings · 2 skipped  (97 ms)
Not conformant: 1 MUST rule failed (name-header-match).
```

| Status | Meaning |
| --- | --- |
| `pass` | The server did what the spec requires. |
| `FAIL` | A MUST requirement was violated. Any FAIL makes the server *not conformant*. |
| `warn` | A SHOULD requirement was violated, or a MUST was only partly met. |
| `skip` | The rule does not apply (for example, SSE rules when the server always answers with JSON). Skips do not count toward the score. |
| `blocked` | The rule could not be checked because a prerequisite failed (for example, nothing worked without a handshake). Blocked MUST rules make the server not conformant. |

Each finding prints the fix (`fix`), the spec section (`spec`) and the exact request and response that exposed it (`seen`). `--verbose` shows the message and evidence for passing rules too.

### How is the score calculated?

MUST rules are worth 3 points and SHOULD rules 1. A passing rule earns its points, a MUST rule that only partly passes earns half, and a failed, warning SHOULD or blocked rule earns nothing; skipped rules do not count. A failed or blocked MUST rule caps the score at 89, so **a score of 90 or more always means conformant**. In practice: 100 is clean, 99 is one SHOULD warning, 89 or less is at least one MUST failure.

## How do I use Statelint in CI?

On GitHub Actions, use the Action (it adds outputs, inline annotations and a job summary):

```yaml
      - run: npm start &                      # your MCP server
      - uses: NHTanvir/statelint@v0
        with:
          url: http://127.0.0.1:3000/mcp
          min-score: 90
```

The inputs and outputs are listed in the [README](../README.md#how-do-i-run-the-conformance-check-in-github-actions). Anywhere else, run the CLI:

```yaml
jobs:
  mcp-conformance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - run: npm ci
      - run: npm start &                      # start your MCP server in the background
      - run: npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp --wait 30s --min-score 90 --summary "$GITHUB_STEP_SUMMARY"
```

| Flag | Effect |
| --- | --- |
| `--json` | Print the whole report as JSON: every rule's status, message, fix and evidence, plus every request sent. |
| `--output report.json` / `report.md` | Also write the report to a file (JSON, Markdown, or text by extension). |
| `--summary "$GITHUB_STEP_SUMMARY"` | Append a Markdown table to the job summary. |
| `--min-score <n>` | Exit 1 when the score is below `n`. |
| `--strict` | Exit 1 on SHOULD warnings as well. |
| `--only <rules>` / `--skip <rules>` | Run a subset; ids from `statelint rules`. |
| `--wait <duration>` | Wait for the server to accept connections first (`30s`, `500ms`); use it right after starting the server. |
| `--timeout <ms>` | Per-request limit (default 10000). |

Exit codes: `0` conformant, `1` not conformant (or `--min-score` / `--strict` not met), `2` the check could not run (bad URL, unreachable server, authentication needed).

## How do I try Statelint against a server I control?

`statelint serve` runs the bundled reference server over real HTTP (three demo tools, one resource, one prompt). It passes every rule; `--fault <id>` breaks exactly one, which is handy for checking your CI wiring or for seeing what a real failure looks like:

```bash
npx github:NHTanvir/statelint serve --port 3000 &
npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp            # 100/100

npx github:NHTanvir/statelint serve --port 3001 --fault method-header-unchecked &
npx github:NHTanvir/statelint check http://127.0.0.1:3001/mcp            # 89/100, method-header-match fails
```

`statelint serve --help` lists all 35 faults and the rule each one breaks.

## Troubleshooting

### Every rule is blocked and no-handshake fails

The server still requires the 2025-11-25 `initialize` handshake and a session. That is the main thing the 2026-07-28 revision removed. Run `npx github:NHTanvir/statelint migrate .` in the server's repository to see what to change; on the TypeScript SDK the fix is `createMcpHandler`.

### The result is inconclusive: authentication required

Pass a token with `-H "Authorization: Bearer <token>"`. Statelint forwards it on every request.

### The result is inconclusive: could not reach the server

Check the URL, the port, and that the server listens on the interface you are calling (`127.0.0.1` vs `0.0.0.0`).

### origin-validation warns on a public API

Servers must validate `Origin` to stop DNS rebinding, and Statelint expects `403` for an unknown origin. A public, token-authenticated API may allow every origin on purpose; then the warning is expected and costs one point. Use `--skip origin-validation` if you have decided so.

### sse-closes warns

Your server keeps SSE response streams open after the final response. Each response stream belongs to one request and should end with it; long-lived notification streams are what `subscriptions/listen` is for.

## Next steps

- [Migrate your MCP server to 2026-07-28](migrate-to-2026-07-28.md), with `statelint migrate`.
- [What changed in stateless MCP](what-changed-stateless-mcp.md), the SEP-by-SEP reference.
- [The rules](rules.md): what each of the 33 rules sends and expects.
