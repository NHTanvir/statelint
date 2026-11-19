import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { exitCodeFor } from "../src/commands/check.js";
import { renderMarkdown, renderText } from "../src/check/report.js";
import { RULES } from "../src/check/rules.js";
import { runCheck, selectRules, waitForServer, type CheckReport } from "../src/check/runner.js";
import { computeScore, NON_CONFORMANT_CAP } from "../src/check/score.js";
import { FAULTS, type FaultInfo } from "../src/fixtures/faults.js";
import { inProcessFetch } from "../src/fixtures/node-adapter.js";
import { createReferenceServer, type FetchHandler } from "../src/fixtures/reference-server.js";
import { palette } from "../src/util/color.js";

const URL_ = "http://statelint.test/mcp";
const FAST = { closeGraceMs: 150, firstEventMs: 300, timeoutMs: 3000 };

async function check(opts: { fault?: FaultInfo["id"]; sse?: boolean } = {}): Promise<CheckReport> {
  const server = createReferenceServer({ ...(opts.fault ? { fault: opts.fault } : {}), sse: !!opts.sse, keepAliveMs: 50 });
  try {
    return await runCheck(URL_, { fetch: inProcessFetch(server.fetch), ...FAST });
  } finally {
    server.close();
  }
}

const broken = (r: CheckReport) => r.rules.filter((x) => x.status === "fail" || x.status === "warn").map((x) => x.id);

describe("the compliant reference server", () => {
  test("scores 100 with JSON responses (SSE-only rules skipped)", async () => {
    const r = await check();
    assert.equal(r.score, 100);
    assert.equal(r.conformant, true);
    assert.deepEqual(broken(r), []);
    assert.deepEqual(
      r.rules.filter((x) => x.status === "skip").map((x) => x.id),
      ["sse-single-response", "sse-closes"],
    );
    assert.equal(r.server.era, "modern-only");
    assert.deepEqual(r.server.supportedVersions, ["2026-07-28"]);
  });
  test("scores 100 with SSE responses, with every rule applying", async () => {
    const r = await check({ sse: true });
    assert.equal(r.score, 100);
    assert.equal(r.summary.skip, 0);
    assert.equal(r.summary.pass, RULES.length);
  });
});

describe("one broken server per rule", () => {
  for (const f of FAULTS) {
    test(`${f.id} breaks exactly ${f.rule}`, async () => {
      const r = await check({ fault: f.id, sse: f.base === "sse" });
      assert.deepEqual(broken(r), [f.rule], `fault ${f.id}: ${JSON.stringify(r.rules.filter((x) => x.status !== "pass" && x.status !== "skip" && x.status !== "blocked").map((x) => [x.id, x.message]))}`);
      const rule = r.rules.find((x) => x.id === f.rule)!;
      assert.equal(rule.status, rule.level === "must" ? "fail" : "warn");
      if (rule.level === "must") {
        assert.equal(r.conformant, false);
        assert.ok(r.score <= NON_CONFORMANT_CAP);
      } else {
        assert.equal(r.conformant, true);
      }
      assert.ok(rule.fix && rule.fix.length > 20, "a failing rule says how to fix it");
    });
  }
  test("every rule is targeted by at least one fault", () => {
    const targeted = new Set(FAULTS.map((f) => f.rule));
    assert.deepEqual(RULES.map((r) => r.id).filter((id) => !targeted.has(id)), []);
  });
  test("a legacy-only server blocks the rules that need a modern baseline", async () => {
    const r = await check({ fault: "requires-initialize" });
    assert.equal(r.server.era, "legacy");
    assert.ok(r.summary.blocked >= 20);
    assert.ok(r.score < 20);
    assert.match(r.rules.find((x) => x.id === "no-handshake")!.message, /initialize handshake and Mcp-Session-Id/);
  });
  test("the draft error code gets a renumbering hint", async () => {
    const r = await check({ fault: "draft-error-code" });
    assert.match(r.rules.find((x) => x.id === "header-error-code")!.message, /-32001 was HeaderMismatch's number in the pre-release drafts/);
  });
});

describe("probes are safe", () => {
  test("no probe calls a real tool, reads a real resource or gets a real prompt", async () => {
    const server = createReferenceServer({});
    const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
    const recording: FetchHandler = async (req) => {
      if (req.method === "POST") {
        const body = (await req.clone().json()) as { method: string; params?: Record<string, unknown> };
        seen.push({ method: body.method, params: body.params ?? {} });
      }
      return server.fetch(req);
    };
    await runCheck(URL_, { fetch: inProcessFetch(recording), ...FAST });
    server.close();
    const named = seen.filter((s) => s.method === "tools/call" || s.method === "prompts/get" || s.method === "resources/read");
    assert.ok(named.length >= 5);
    for (const s of named) {
      const target = String(s.params["name"] ?? s.params["uri"]);
      assert.match(target, /^(statelint_probe_|statelint:\/\/probe\/)/, `${s.method} ${target}`);
    }
    const methods = new Set(seen.map((s) => s.method));
    for (const m of methods) {
      assert.ok(
        ["server/discover", "tools/list", "prompts/list", "resources/list", "resources/templates/list", "tools/call", "prompts/get", "resources/read", "subscriptions/listen", "initialize", "statelint/probe-unknown-method"].includes(m),
        `unexpected method ${m}`,
      );
    }
  });
});

describe("inconclusive checks", () => {
  test("an auth wall makes the check inconclusive, not a failure", async () => {
    const wall: FetchHandler = async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "WWW-Authenticate": 'Bearer resource_metadata="x"', "Content-Type": "application/json" } });
    const r = await runCheck(URL_, { fetch: inProcessFetch(wall), ...FAST });
    assert.match(r.inconclusive ?? "", /requires authentication/);
    assert.equal(r.score, 0);
    assert.equal(exitCodeFor(r, { strict: false }), 2);
  });
  test("an unreachable server is inconclusive", async () => {
    const down = (async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" } });
    }) as unknown as typeof fetch;
    const r = await runCheck(URL_, { fetch: down, ...FAST });
    assert.match(r.inconclusive ?? "", /Could not reach/);
    assert.equal(exitCodeFor(r, { strict: false }), 2);
  });
  test("--wait polls until the server answers, and gives up at the deadline", async () => {
    let calls = 0;
    const late = (async () => {
      calls++;
      if (calls < 3) throw new TypeError("fetch failed");
      return new Response(null, { status: 405 });
    }) as unknown as typeof fetch;
    assert.equal(await waitForServer(URL_, late, 5_000), true);
    assert.equal(calls, 3);
    const never = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const started = Date.now();
    assert.equal(await waitForServer(URL_, never, 300), false);
    assert.ok(Date.now() - started < 2_000);
  });
  test("a server that rejects 2026-07-28 as unsupported is diagnosed as such, not as needing a handshake", async () => {
    const old: FetchHandler = async (req) => {
      if (req.method !== "POST") return new Response(null, { status: 405 });
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18)" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    };
    const r = await runCheck(URL_, { fetch: inProcessFetch(old), ...FAST });
    const rule = r.rules.find((x) => x.id === "no-handshake")!;
    assert.equal(rule.status, "fail");
    assert.match(rule.message, /refused 2026-07-28 itself/);
    assert.doesNotMatch(rule.message, /initialize handshake/);
  });
  test("forwards user headers on every request", async () => {
    const server = createReferenceServer({});
    let withAuth = 0;
    let total = 0;
    const spy: FetchHandler = async (req) => {
      total++;
      if (req.headers.get("authorization") === "Bearer t0k3n") withAuth++;
      return server.fetch(req);
    };
    await runCheck(URL_, { fetch: inProcessFetch(spy), headers: { Authorization: "Bearer t0k3n" }, ...FAST });
    server.close();
    assert.equal(withAuth, total);
  });
});

describe("scoring, selection and exit codes", () => {
  test("MUST rules weigh 3 and SHOULD rules 1; warnings on MUST rules earn half", () => {
    assert.equal(computeScore([{ level: "must", status: "pass" }, { level: "should", status: "warn" }]), 75);
    assert.equal(computeScore([{ level: "must", status: "warn" }, { level: "should", status: "pass" }]), 63);
    assert.equal(computeScore([{ level: "must", status: "skip" }]), 0);
  });
  test("a failed or blocked MUST rule caps the score at 89", () => {
    const many = Array.from({ length: 40 }, () => ({ level: "must" as const, status: "pass" as const }));
    assert.equal(computeScore([...many, { level: "must", status: "fail" }]), NON_CONFORMANT_CAP);
    assert.equal(computeScore([...many, { level: "must", status: "blocked" }]), NON_CONFORMANT_CAP);
  });
  test("--only and --skip select rules, and unknown ids are refused", () => {
    assert.deepEqual(selectRules(["cache-hints"]).map((r) => r.id), ["cache-hints"]);
    assert.ok(!selectRules([], ["cache-hints"]).some((r) => r.id === "cache-hints"));
    assert.throws(() => selectRules(["nope"]), /unknown rule id/);
  });
  test("strict mode and --min-score change the exit code", async () => {
    const r = await check({ fault: "no-server-info" });
    assert.equal(exitCodeFor(r, { strict: false }), 0);
    assert.equal(exitCodeFor(r, { strict: true }), 1);
    assert.equal(exitCodeFor(r, { strict: false, minScore: 100 }), 1);
  });
  test("rule ids are unique and every rule cites the 2026-07-28 spec", () => {
    const ids = RULES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const r of RULES) assert.match(r.spec, /^https:\/\/modelcontextprotocol\.io\/specification\/2026-07-28\//, r.id);
  });
});

describe("reports", () => {
  test("the text report names the failure, the fix, the spec and the evidence", async () => {
    const r = await check({ fault: "name-header-unchecked" });
    const text = renderText(r, palette(false));
    assert.match(text, /✗ FAIL\s+name-header-match/);
    assert.match(text, /fix .*-32020/);
    assert.match(text, /spec https:\/\/modelcontextprotocol\.io\/specification\/2026-07-28\/basic\/transports\/streamable-http#server-validation/);
    assert.match(text, /seen name-mismatch-tools: POST tools\/call/);
    assert.match(text, /Score 89\/100/);
  });
  test("the Markdown summary has a table row per rule and a How to fix section", async () => {
    const r = await check({ fault: "no-cache-hints" });
    const md = renderMarkdown(r);
    assert.equal((md.match(/^\| (✅|❌|⚠️|➖|⛔) \|/gm) ?? []).length, RULES.length);
    assert.match(md, /### How to fix/);
    assert.match(md, /`cache-hints`/);
  });
  test("the JSON report is stable and self-describing", async () => {
    const r = await check();
    const j = JSON.parse(JSON.stringify(r)) as CheckReport;
    assert.equal(j.spec, "2026-07-28");
    assert.equal(j.tool, "statelint");
    assert.ok(j.probes.length >= 20);
    assert.ok(j.rules.every((x) => typeof x.id === "string" && typeof x.message === "string"));
  });
});
