# Example: a stateful 2025-11-25 MCP server to migrate

This is the shape most TypeScript MCP servers had before the stateless 2026-07-28 revision, after the official `v1-to-v2` codemod has renamed the imports. The Express route in [`src/http.ts`](src/http.ts) keeps a map of `NodeStreamableHTTPServerTransport`s keyed by `Mcp-Session-Id`, branches on `isInitializeRequest`, serves `GET` and `DELETE` for the session stream, and relies on the transport's DNS-rebinding protection. [`src/stdio.ts`](src/stdio.ts) connects the server to `StdioServerTransport`, and one tool throws the retired `-32002` error code.

`statelint demo` migrates it in memory. To see the findings and the diff yourself:

```bash
npx github:NHTanvir/statelint migrate examples/stateful-notes-server --diff
```

Statelint rewrites the three files to `createMcpHandler` + `toNodeHandler`, `serveStdio` and `-32602`, and leaves one required step open on purpose: `createMcpHandler` does not validate `Host` or `Origin`, so the old transport's protection has to be mounted again by hand (it inserts a `TODO(statelint)` comment at the spot). The code is not built or run by this repository; it exists to be migrated.
