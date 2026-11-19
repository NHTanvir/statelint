import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { exampleProjectPath } from "../src/commands/demo.js";
import { errorCodes, httpEntry, stdioEntry } from "../src/migrate/codemods.js";
import { migrateProject, runMigrate } from "../src/migrate/index.js";
import { lex, matchBrackets } from "../src/migrate/lexer.js";
import { detectFindings, goVersionBelow, MIGRATION_RULES, pythonSpecIsV2 } from "../src/migrate/rules.js";
import { analyzeProject, type VirtualFile } from "../src/migrate/scan.js";

const V2_PKG: VirtualFile = {
  path: "package.json",
  text: JSON.stringify({ dependencies: { "@modelcontextprotocol/server": "^2.4.0", "@modelcontextprotocol/node": "^2.1.2", express: "^5.1.0" } }),
};
const project = (...files: VirtualFile[]) => analyzeProject([V2_PKG, ...files]);
const rulesOf = (...files: VirtualFile[]) => detectFindings(project(...files)).map((f) => f.rule);
const ts = (text: string, path = "src/server.ts"): VirtualFile => ({ path, text });

const SESSIONFUL = `import express from 'express';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { getServer } from './build.js';

const app = express();
app.use(express.json());

const transports: Record<string, NodeStreamableHTTPServerTransport> = {};

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: NodeStreamableHTTPServerTransport;
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports[id] = transport; },
    });
    transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
    const server = getServer();
    await server.connect(transport);
  } else {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) { res.status(400).send('Invalid or missing session ID'); return; }
  await transports[sessionId].handleRequest(req, res);
};

app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

app.listen(3000);
`;

// The v1 SDK README's stateless example, as the official v1-to-v2 codemod rewrites it.
const STATELESS = `import express, { Request, Response } from 'express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { getServer } from './build.js';

const app = express();
app.use(express.json());

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const server = getServer();
    const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

// SSE notifications not supported in stateless mode
app.get('/mcp', async (req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
});

// Session termination not needed in stateless mode
app.delete('/mcp', async (req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
});

app.listen(3000);
`;

function balanced(text: string): boolean {
  try {
    matchBrackets(lex(text).tokens);
    return true;
  } catch {
    return false;
  }
}

describe("migration findings", () => {
  test("a sessionful Express server shows every session leftover", () => {
    const rules = new Set(rulesOf(ts(SESSIONFUL)));
    for (const r of ["transport-entry", "session-map", "session-header", "initialize-routing", "session-callbacks", "get-delete-routes"]) {
      assert.ok(rules.has(r), r);
    }
  });
  test("the v1 SDK dependency is reported with the official codemod command", () => {
    const f = detectFindings(analyzeProject([{ path: "package.json", text: JSON.stringify({ dependencies: { "@modelcontextprotocol/sdk": "^1.24.0" } }) }]));
    assert.equal(f[0]?.rule, "sdk-v1");
    assert.match(f[0]!.fix, /npx @modelcontextprotocol\/codemod@latest v1-to-v2 \./);
  });
  test("per-session state, server-to-client requests and change pushes", () => {
    const rules = new Set(
      rulesOf(
        ts(`server.registerTool('t', {}, async (args, ctx) => {
  const cart = carts.get(ctx.sessionId);
  const answer = await ctx.mcpReq.elicitInput({ message: 'Sure?' });
  server.sendToolListChanged();
  return { content: [] };
});`),
      ),
    );
    for (const r of ["session-state", "server-to-client-request", "list-changed-push"]) assert.ok(rules.has(r), r);
  });
  test("retired and draft error codes", () => {
    const rules = rulesOf(ts("throw new ProtocolError(-32002, 'Resource not found');\nconst HeaderMismatch = -32001;\n"));
    assert.ok(rules.includes("retired-error-code"));
    assert.ok(rules.includes("draft-error-code"));
  });
  test("stdio, SSE transport, resources/subscribe, ping, logging and tasks", () => {
    const rules = new Set(
      rulesOf(
        ts(`await server.connect(new StdioServerTransport());
const sse = new SSEServerTransport('/messages', res);
server.server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
server.server.setRequestHandler('ping', async () => ({}));
await server.sendLoggingMessage({ level: 'info', data: 'x' });
server.server.setRequestHandler(GetTaskRequestSchema, async () => ({}));`),
      ),
    );
    for (const r of ["stdio-entry", "sse-transport", "resources-subscribe", "ping-handler", "logging", "tasks"]) assert.ok(rules.has(r), r);
  });
  test("DNS-rebinding options on the transport", () => {
    const rules = rulesOf(ts("const t = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableDnsRebindingProtection: true });"));
    assert.ok(rules.includes("dns-rebinding"));
  });
  test("x-mcp-header on a number, and on an API key", () => {
    const rules = rulesOf(ts("const s = { level: { type: 'number', 'x-mcp-header': 'Level' }, apiKey: { type: 'string', 'x-mcp-header': 'Api-Key' } };"));
    assert.ok(rules.includes("x-mcp-header-number"));
    assert.ok(rules.includes("x-mcp-header-sensitive"));
  });
  test("comments are not findings", () => {
    assert.deepEqual(rulesOf(ts("// we used to read 'mcp-session-id' here\n/* isInitializeRequest( */\n")), []);
  });
  test("Python: v1 pins and FastMCP", () => {
    const f = detectFindings(analyzeProject([
      { path: "requirements.txt", text: "mcp[cli]==1.27.0\nhttpx\n" },
      { path: "server.py", text: "from mcp.server.fastmcp import FastMCP\nmcp = FastMCP('x')\n" },
    ]));
    assert.deepEqual(f.map((x) => x.rule), ["py-sdk-v1", "py-fastmcp"]);
    assert.equal(pythonSpecIsV2(">=2.0"), true);
    assert.equal(pythonSpecIsV2("<2"), false);
  });
  test("Go: old go-sdk and StreamableHTTPOptions without Stateless", () => {
    const f = detectFindings(analyzeProject([
      { path: "go.mod", text: "module x\nrequire github.com/modelcontextprotocol/go-sdk v1.6.1\n" },
      { path: "main.go", text: "h := mcp.NewStreamableHTTPHandler(get, &mcp.StreamableHTTPOptions{JSONResponse: true})\n" },
    ]));
    assert.deepEqual(f.map((x) => x.rule), ["go-sdk-version", "go-stateless"]);
    assert.ok(goVersionBelow("v1.7.0-pre.1", "v1.7.0"));
    assert.ok(!goVersionBelow("v1.8.0", "v1.7.0"));
  });
  test("a stateless v2 server with cache hints has nothing required left", () => {
    const f = detectFindings(project(ts("const handler = createMcpHandler(() => buildServer(), { cacheHints: {} });\napp.all('/mcp', (req, res) => void toNodeHandler(handler)(req, res, req.body));\n")));
    assert.deepEqual(f, []);
  });
  test("every rule id in the catalog is unique", () => {
    const ids = MIGRATION_RULES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("codemod: http-entry", () => {
  test("rewrites the sessionful route, the map, GET/DELETE and the imports", () => {
    const o = httpEntry(ts(SESSIONFUL), project(ts(SESSIONFUL)));
    assert.equal(o.status, "rewritten", o.reason);
    const out = o.newText!;
    assert.match(out, /import \{ createMcpHandler \} from '@modelcontextprotocol\/server';/);
    assert.match(out, /import \{ toNodeHandler \} from '@modelcontextprotocol\/node';/);
    assert.match(out, /const mcpHandler = createMcpHandler\(\(\) => getServer\(\)\);/);
    assert.match(out, /app\.all\('\/mcp', \(req, res\) => void mcpNodeHandler\(req, res, req\.body\)\);/);
    for (const gone of ["transports", "isInitializeRequest", "randomUUID", "handleSessionRequest", "app.get(", "app.delete(", "mcp-session-id"]) {
      assert.ok(!out.includes(gone), `${gone} should be gone`);
    }
    assert.match(out, /app\.listen\(3000\);/);
    assert.ok(balanced(out));
  });
  test("rewrites the stateless route, keeping JSON mode", () => {
    const o = httpEntry(ts(STATELESS), project(ts(STATELESS)));
    assert.equal(o.status, "rewritten", o.reason);
    assert.match(o.newText!, /createMcpHandler\(\(\) => getServer\(\), \{ responseMode: 'json' \}\)/);
    assert.ok(!/app\.get\(|app\.delete\(|res\.writeHead\(405\)/.test(o.newText!));
    assert.match(o.newText!, /^import express, \{ Request, Response \} from 'express';/);
    assert.ok(balanced(o.newText!));
    // Nothing a 2026-07-28 rewrite cares about is left in the result.
    const left = detectFindings(project(ts(o.newText!))).filter((f) => f.severity === "required");
    assert.deepEqual(left, []);
  });
  test("keeps middleware and inserts a TODO when the transport guarded Host/Origin", () => {
    const src = SESSIONFUL.replace("app.post('/mcp', async", "app.post('/mcp', requireAuth, async").replace(
      "sessionIdGenerator: () => randomUUID(),",
      "sessionIdGenerator: () => randomUUID(),\n      enableDnsRebindingProtection: true,",
    );
    const o = httpEntry(ts(src), project(ts(src)));
    assert.equal(o.status, "rewritten", o.reason);
    assert.match(o.newText!, /app\.all\('\/mcp', requireAuth, \(req, res\) =>/);
    assert.match(o.newText!, /TODO\(statelint\): the old transport validated Host\/Origin/);
    // The TODO keeps the finding open.
    assert.ok(detectFindings(project(ts(o.newText!))).some((f) => f.rule === "dns-rebinding"));
  });
  const refusals: Array<[string, string, RegExp]> = [
    ["v1 imports", SESSIONFUL.replace("'@modelcontextprotocol/node'", "'@modelcontextprotocol/sdk/server/streamableHttp.js'"), /still on the v1 SDK/],
    ["a shared server instance", SESSIONFUL.replace("const server = getServer();\n    await server.connect(transport);", "await sharedServer.connect(transport);"), /shared instance/],
    ["an inline server", SESSIONFUL.replace("const server = getServer();", "const server = new McpServer({ name: 'x', version: '1' });"), /constructed inline/],
    ["extra logic in the handler", SESSIONFUL.replace("  await transport.handleRequest(req, res, req.body);", "  metrics.increment('mcp');\n  await transport.handleRequest(req, res, req.body);"), /does more than host the transport/],
    ["a factory with arguments", SESSIONFUL.replace("const server = getServer();", "const server = getServer(req.auth);"), /built with arguments/],
    ["an unknown transport option", SESSIONFUL.replace("sessionIdGenerator: () => randomUUID(),", "sessionIdGenerator: () => randomUUID(),\n      customThing: 1,"), /does not know how to carry over/],
    ["a custom body argument", SESSIONFUL.replace("handleRequest(req, res, req.body)", "handleRequest(req, res, parsed)"), /custom body/],
    ["the map used elsewhere", `${SESSIONFUL}\nsetInterval(() => console.log(Object.keys(transports).length), 1000);\n`, /also used on line/],
  ];
  for (const [what, src, reason] of refusals) {
    test(`refuses ${what}`, () => {
      const o = httpEntry(ts(src), project(ts(src)));
      assert.equal(o.status, "refused");
      assert.match(o.reason ?? "", reason);
    });
  }
  test("refuses when tools read ctx.sessionId anywhere in the project", () => {
    const tool = ts("server.registerTool('t', {}, async (a, ctx) => ({ content: [{ type: 'text', text: String(ctx.sessionId) }] }));", "src/tools.ts");
    const o = httpEntry(ts(SESSIONFUL), project(ts(SESSIONFUL), tool));
    assert.equal(o.status, "refused");
    assert.match(o.reason ?? "", /ctx\.sessionId/);
  });
});

// Verbatim output of `npx @modelcontextprotocol/codemod@2.4.0 v1-to-v2 .` on the SDK README's sessionful server.
const OFFICIAL_CODEMOD_OUTPUT = `import express from 'express';
import { randomUUID } from 'node:crypto';
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer, isInitializeRequest } from "@modelcontextprotocol/server";
import { z } from 'zod';
function getServer() {
  const server = new McpServer({ name: 'v1-notes', version: '1.0.0' });
  server.registerTool('add', { inputSchema: z.object({ a: z.number(), b: z.number() }) }, async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }));
  return server;
}
const app = express(); app.use(express.json());
const transports = {};
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;
  if (sessionId && transports[sessionId]) transport = transports[sessionId];
  else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports[id] = transport; } });
    await getServer().connect(transport);
  } else { res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null }); return; }
  await transport.handleRequest(req, res, req.body);
});
app.listen(Number(process.env.PORT), '127.0.0.1');
`;

describe("codemod: http-entry on the official codemod's output", () => {
  test("accepts brace-less if branches and rewrites the route", () => {
    const f = ts(OFFICIAL_CODEMOD_OUTPUT, "src/server.mjs");
    const o = httpEntry(f, project(f));
    assert.equal(o.status, "rewritten", o.reason);
    assert.match(o.newText!, /const mcpHandler = createMcpHandler\(\(\) => getServer\(\)\);/);
    assert.ok(!o.newText!.includes("transports"));
    assert.ok(balanced(o.newText!));
  });
  test("still refuses unrelated logic in a brace-less branch", () => {
    const src = OFFICIAL_CODEMOD_OUTPUT.replace("transport = transports[sessionId];", "metrics.hit(sessionId);");
    const f = ts(src, "src/server.mjs");
    const o = httpEntry(f, project(f));
    assert.equal(o.status, "refused");
    assert.match(o.reason ?? "", /metrics\.hit/);
  });
});

describe("codemod: stdio-entry", () => {
  test("rewrites a factory call", () => {
    const src = "import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';\nimport { buildServer } from './b.js';\n\nawait buildServer().connect(new StdioServerTransport());\n";
    const o = stdioEntry(ts(src, "src/stdio.ts"), project());
    assert.equal(o.status, "rewritten", o.reason);
    assert.equal(o.newText, "import { serveStdio } from '@modelcontextprotocol/server/stdio';\nimport { buildServer } from './b.js';\n\nserveStdio(() => buildServer());\n");
  });
  test("rewrites a server variable built by a factory and a transport variable", () => {
    const src = "import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';\nconst server = createServer();\nconst transport = new StdioServerTransport();\nawait server.connect(transport);\n";
    const o = stdioEntry(ts(src, "src/stdio.ts"), project());
    assert.equal(o.status, "rewritten", o.reason);
    assert.equal(o.newText, "import { serveStdio } from '@modelcontextprotocol/server/stdio';\nserveStdio(() => createServer());\n");
  });
  test("refuses a module-level new McpServer and says how to wrap it", () => {
    const src = "import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';\nconst server = new McpServer({ name: 'x', version: '1' });\nserver.registerTool('t', {}, async () => ({ content: [] }));\nawait server.connect(new StdioServerTransport());\n";
    const o = stdioEntry(ts(src, "src/stdio.ts"), project());
    assert.equal(o.status, "refused");
    assert.match(o.reason ?? "", /function buildServer\(\)/);
  });
});

describe("codemod: error-codes", () => {
  test("renumbers error constructions only", () => {
    const src = "throw new ProtocolError(-32002, 'gone');\nconst port = 32002;\nconst x = { code: -32001, name: 'HeaderMismatch' };\n// -32002 in a comment\n";
    const o = errorCodes(ts(src));
    assert.equal(o.status, "rewritten");
    assert.equal(o.newText, "throw new ProtocolError(-32602, 'gone');\nconst port = 32002;\nconst x = { code: -32020, name: 'HeaderMismatch' };\n// -32002 in a comment\n");
  });
});

describe("migrate on the bundled example", () => {
  test("rewrites three files and leaves the DNS-rebinding step open", () => {
    const r = runMigrate(exampleProjectPath());
    assert.deepEqual(
      r.codemods.filter((c) => c.status === "rewritten").map((c) => [c.codemod, c.file]),
      [
        ["error-codes", "src/build-server.ts"],
        ["http-entry", "src/http.ts"],
        ["stdio-entry", "src/stdio.ts"],
      ],
    );
    assert.ok(r.findings.find((f) => f.rule === "dns-rebinding" && !f.fixedByCodemod));
    assert.equal(r.summary.required, 9);
    assert.equal(r.summary.requiredAfterRewrite, 1);
    assert.ok(r.plan.at(-1)?.includes("statelint check"));
  });
  test("--write applies the rewrites to the files", () => {
    const dir = mkdtempSync(join(tmpdir(), "statelint-migrate-"));
    try {
      cpSync(exampleProjectPath(), dir, { recursive: true });
      const r = runMigrate(dir, { write: true });
      assert.deepEqual(r.written.sort(), ["src/build-server.ts", "src/http.ts", "src/stdio.ts"]);
      assert.match(readFileSync(join(dir, "src/http.ts"), "utf8"), /createMcpHandler\(\(\) => buildServer\(\)\)/);
      // A second run finds only the open TODO.
      const again = runMigrate(dir);
      assert.deepEqual(again.findings.filter((f) => f.severity === "required").map((f) => f.rule), ["dns-rebinding"]);
      assert.deepEqual(again.codemods.filter((c) => c.status === "rewritten"), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("an unrelated project is not an MCP project", () => {
    const r = migrateProject(analyzeProject([{ path: "index.js", text: "console.log('hi')\n" }]), ".");
    assert.equal(r.noMcp, true);
  });
});
