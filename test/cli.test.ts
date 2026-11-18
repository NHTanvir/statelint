import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { CliIO } from "../src/commands/shared.js";
import { startServe } from "../src/commands/serve.js";
import { exampleProjectPath } from "../src/commands/demo.js";
import { inProcessFetch } from "../src/fixtures/node-adapter.js";
import { createReferenceServer } from "../src/fixtures/reference-server.js";
import { runCli } from "../src/run.js";
import { VERSION } from "../src/version.js";

function fakeIO(fetchImpl?: typeof fetch): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t), colorCapable: false, ...(fetchImpl ? { fetch: fetchImpl } : {}) }, out, err };
}

describe("statelint CLI", () => {
  test("--help and --version", async () => {
    const h = fakeIO();
    assert.equal(await runCli(["--help"], h.io), 0);
    assert.match(h.out.join("\n"), /statelint check <url>/);
    const v = fakeIO();
    assert.equal(await runCli(["--version"], v.io), 0);
    assert.equal(v.out[0], VERSION);
  });
  test("package.json and the code agree on the version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    assert.equal(pkg.version, VERSION);
  });
  test("an unknown command is a usage error", async () => {
    const f = fakeIO();
    assert.equal(await runCli(["lint"], f.io), 2);
    assert.match(f.err.join("\n"), /unknown command "lint"/);
  });
  test("check needs a URL, and refuses non-http URLs and unknown rules", async () => {
    for (const argv of [["check"], ["check", "ftp://x/mcp"], ["check", "http://x/mcp", "--only", "nope"], ["check", "http://x/mcp", "--min-score", "200"]]) {
      const f = fakeIO();
      assert.equal(await runCli(argv, f.io), 2, argv.join(" "));
    }
  });
  test("check --json against a compliant server exits 0", async () => {
    const server = createReferenceServer({});
    const f = fakeIO(inProcessFetch(server.fetch));
    const code = await runCli(["check", "http://statelint.test/mcp", "--json", "--close-grace", "100"], f.io);
    server.close();
    assert.equal(code, 0);
    const report = JSON.parse(f.out.join("\n")) as { score: number; conformant: boolean };
    assert.equal(report.score, 100);
    assert.equal(report.conformant, true);
  });
  test("check writes --output and appends --summary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "statelint-cli-"));
    try {
      const server = createReferenceServer({ fault: "no-cache-hints" });
      const f = fakeIO(inProcessFetch(server.fetch));
      const code = await runCli(
        ["check", "http://statelint.test/mcp", "--quiet", "--output", join(dir, "r.json"), "--summary", join(dir, "summary.md"), "--close-grace", "100"],
        f.io,
      );
      server.close();
      assert.equal(code, 1);
      assert.match(f.out[0] ?? "", /^89\/100 Not conformant: 1 MUST rule failed \(cache-hints\)\./);
      assert.equal((JSON.parse(readFileSync(join(dir, "r.json"), "utf8")) as { score: number }).score, 89);
      assert.match(readFileSync(join(dir, "summary.md"), "utf8"), /## Statelint: MCP 2026-07-28 conformance 89\/100/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("serve + check over real HTTP on a free port", async () => {
    const s = fakeIO();
    const handle = await startServe(["--port", "0", "--quiet"], s.io);
    try {
      assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const f = fakeIO();
      assert.equal(await runCli(["check", handle.url, "--quiet", "--close-grace", "100"], f.io), 0);
      assert.match(f.out[0] ?? "", /^100\/100 Conformant/);
    } finally {
      await handle.close();
    }
  });
  test("serve --fault over real HTTP fails exactly that rule", async () => {
    const handle = await startServe(["--port", "0", "--quiet", "--fault", "unknown-method-200"], fakeIO().io);
    try {
      const f = fakeIO();
      assert.equal(await runCli(["check", handle.url, "--json", "--close-grace", "100"], f.io), 1);
      const report = JSON.parse(f.out.join("\n")) as { rules: Array<{ id: string; status: string }> };
      assert.deepEqual(report.rules.filter((r) => r.status === "fail").map((r) => r.id), ["unknown-method-404"]);
    } finally {
      await handle.close();
    }
  });
  test("serve refuses an unknown fault", async () => {
    await assert.rejects(startServe(["--fault", "nope"], fakeIO().io), /unknown fault/);
  });
  test("migrate on the example exits 1 (a required step is left) and --json is complete", async () => {
    const f = fakeIO();
    assert.equal(await runCli(["migrate", exampleProjectPath(), "--json"], f.io), 1);
    const r = JSON.parse(f.out.join("\n")) as { codemods: Array<{ status: string; diff?: string }>; plan: string[] };
    assert.equal(r.codemods.filter((c) => c.status === "rewritten").length, 3);
    assert.ok(r.codemods.some((c) => c.diff?.includes("+const mcpHandler = createMcpHandler(() => buildServer());")));
    assert.ok(r.plan.length >= 4);
  });
  test("migrate --diff prints the unified diff", async () => {
    const f = fakeIO();
    await runCli(["migrate", exampleProjectPath(), "--diff", "--no-color"], f.io);
    const text = f.out.join("\n");
    assert.match(text, /--- a\/src\/http\.ts\n\+\+\+ b\/src\/http\.ts/);
    assert.match(text, /\+serveStdio\(\(\) => buildServer\(\)\);/);
  });
  test("migrate refuses a path that is not a directory", async () => {
    assert.equal(await runCli(["migrate", "/definitely/not/here"], fakeIO().io), 2);
  });
  test("rules lists every check rule, and --migrate the migration rules", async () => {
    const f = fakeIO();
    await runCli(["rules", "--json"], f.io);
    assert.equal((JSON.parse(f.out.join("\n")) as unknown[]).length, 33);
    const m = fakeIO();
    await runCli(["rules", "--migrate", "--json"], m.io);
    assert.ok((JSON.parse(m.out.join("\n")) as { rules: unknown[] }).rules.length >= 25);
  });
  test("demo --json is offline and every fixture behaves", async () => {
    const f = fakeIO();
    const code = await runCli(["demo", "--json"], f.io);
    const r = JSON.parse(f.out.join("\n")) as { ok: boolean; reference: { json: number; sse: number }; faults: Array<{ isolated: boolean }> };
    assert.equal(code, 0);
    assert.equal(r.ok, true);
    assert.deepEqual(r.reference, { json: 100, sse: 100 });
    assert.ok(r.faults.every((x) => x.isolated));
  });
  test("demo --fault shows one full report", async () => {
    const f = fakeIO();
    assert.equal(await runCli(["demo", "--fault", "draft-error-code", "--no-color"], f.io), 0);
    assert.match(f.out.join("\n"), /✗ FAIL\s+header-error-code/);
  });
});
