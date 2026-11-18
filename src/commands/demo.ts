/**
 * `statelint demo`: everything offline. The checker runs against in-process servers (no
 * sockets, no network): the compliant reference server in JSON and SSE mode, then one broken
 * server per fault. Then the migration assistant runs on the bundled stateful example.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderText } from "../check/report.js";
import { runCheck, type CheckReport } from "../check/runner.js";
import { FAULTS, isFaultId, type FaultInfo } from "../fixtures/faults.js";
import { inProcessFetch } from "../fixtures/node-adapter.js";
import { createReferenceServer } from "../fixtures/reference-server.js";
import { runMigrate, type MigrationReport } from "../migrate/index.js";
import { renderMigrationText } from "../migrate/report.js";
import { flagBool, flagString, parseArgs, UsageError, type FlagSpec } from "../util/args.js";
import { padEnd, type Palette } from "../util/color.js";
import { EXIT, paletteFor, type CliIO } from "./shared.js";

export const DEMO_FLAGS: Record<string, FlagSpec> = {
  json: {},
  fault: { value: true },
  "no-migrate": {},
  color: {},
};

export const DEMO_HELP = `Usage: statelint demo [options]

Run Statelint offline against its bundled servers: a compliant stateless MCP 2026-07-28 server
(JSON and SSE), one deliberately broken server per rule, and a stateful 2025-11-25 example
project for the migration assistant. Nothing touches the network.

Options:
      --fault <id>     Show the full report for one broken server
      --no-migrate     Skip the migration part
      --json           Machine-readable results
      --no-color       Plain output`;

export const DEMO_URL = "http://statelint.demo/mcp";
const SPOTLIGHT = "method-header-unchecked";

/** The bundled example, found by walking up from this module (works from dist/ and build/src/). */
export function exampleProjectPath(): string {
  let dir = new URL("./", import.meta.url);
  for (let i = 0; i < 5; i++) {
    const candidate = new URL("examples/stateful-notes-server/", dir);
    if (existsSync(fileURLToPath(candidate))) return fileURLToPath(candidate);
    dir = new URL("../", dir);
  }
  return fileURLToPath(new URL("../../examples/stateful-notes-server/", import.meta.url));
}

async function checkFixture(opts: { fault?: FaultInfo["id"]; sse?: boolean }): Promise<CheckReport> {
  const server = createReferenceServer({ ...(opts.fault ? { fault: opts.fault } : {}), sse: !!opts.sse, keepAliveMs: 100 });
  try {
    return await runCheck(DEMO_URL, { fetch: inProcessFetch(server.fetch), closeGraceMs: 250, firstEventMs: 500, timeoutMs: 3000 });
  } finally {
    server.close();
  }
}

export interface FaultResult {
  fault: string;
  rule: string;
  summary: string;
  score: number;
  status: string;
  /** The fault broke exactly its rule and nothing else. */
  isolated: boolean;
  message: string;
}

export interface DemoResult {
  reference: { json: CheckReport; sse: CheckReport };
  faults: FaultResult[];
  migrate?: MigrationReport;
  ok: boolean;
}

export async function runDemo(opts: { migrate?: boolean } = {}): Promise<DemoResult> {
  const json = await checkFixture({});
  const sse = await checkFixture({ sse: true });
  const faults: FaultResult[] = [];
  for (const f of FAULTS) {
    const r = await checkFixture({ fault: f.id, sse: f.base === "sse" });
    const broken = r.rules.filter((x) => x.status === "fail" || x.status === "warn");
    const target = r.rules.find((x) => x.id === f.rule);
    faults.push({
      fault: f.id,
      rule: f.rule,
      summary: f.summary,
      score: r.score,
      status: target?.status ?? "missing",
      isolated: broken.length === 1 && broken[0]?.id === f.rule,
      message: target?.message ?? "",
    });
  }
  let migrate: MigrationReport | undefined;
  if (opts.migrate !== false && existsSync(exampleProjectPath())) migrate = runMigrate(exampleProjectPath());
  const ok = json.score === 100 && sse.score === 100 && faults.every((f) => f.isolated);
  return { reference: { json, sse }, faults, ...(migrate ? { migrate } : {}), ok };
}

function line(c: Palette, r: CheckReport, label: string): string {
  const s = r.summary;
  const score = r.score === 100 ? c.green(`${r.score}/100`) : c.red(`${r.score}/100`);
  return `   ${r.conformant ? c.green("✓") : c.red("✗")} ${score} ${label} ${c.gray(`· ${s.pass} passed · ${s.skip} skipped · ${r.durationMs} ms`)}`;
}

export async function demoCommand(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv, DEMO_FLAGS);
  const c = paletteFor(io, args.flags.get("color") as boolean | undefined);
  const single = flagString(args, "fault");
  if (single !== undefined) {
    if (!isFaultId(single)) throw new UsageError(`unknown fault "${single}"; run \`statelint serve --help\` for the list`);
    const info = FAULTS.find((f) => f.id === single) as FaultInfo;
    const r = await checkFixture({ fault: info.id, sse: info.base === "sse" });
    if (flagBool(args, "json")) io.out(JSON.stringify(r, null, 2));
    else {
      io.out(c.bold(`Broken server: ${info.id}`) + c.gray(` (${info.summary})`));
      io.out("");
      io.out(renderText(r, c));
    }
    return EXIT.ok;
  }

  const demo = await runDemo({ migrate: !flagBool(args, "no-migrate") });
  if (flagBool(args, "json")) {
    io.out(JSON.stringify({ ok: demo.ok, reference: { json: demo.reference.json.score, sse: demo.reference.sse.score }, faults: demo.faults, migrate: demo.migrate }, null, 2));
    return demo.ok ? EXIT.ok : EXIT.findings;
  }

  io.out(`${c.bold("statelint demo")} ${c.gray("· offline: in-process servers, no sockets, no network")}`);
  io.out("");
  io.out(c.bold("1. A compliant stateless MCP 2026-07-28 server"));
  io.out(line(c, demo.reference.json, "answering with JSON"));
  io.out(line(c, demo.reference.sse, "answering with SSE streams"));
  io.out("");
  io.out(c.bold(`2. ${demo.faults.length} deliberately broken servers, one fault each`));
  const width = Math.max(...demo.faults.map((f) => f.fault.length));
  for (const f of demo.faults) {
    const mark = f.isolated ? (f.status === "fail" ? c.red("✗ FAIL") : c.yellow("! warn")) : c.magenta("? not isolated");
    io.out(`   ${mark} ${padEnd(`${f.score}/100`, 7)} ${padEnd(f.fault, width)}  ${c.gray("→")} ${f.rule}`);
  }
  io.out("");
  const spotlight = await checkFixture({ fault: SPOTLIGHT });
  const rule = spotlight.rules.find((x) => x.status === "fail");
  if (rule) {
    io.out(c.bold(`3. One of them in full: the header/body desync (${SPOTLIGHT})`));
    io.out(`   ${c.red("✗")} ${c.bold(rule.id)} ${rule.message}`);
    if (rule.fix) io.out(`     ${c.cyan("fix")}  ${rule.fix}`);
    io.out(`     ${c.cyan("spec")} ${rule.spec}`);
    for (const e of rule.evidence ?? []) io.out(`     ${c.gray(`seen ${e}`)}`);
    io.out(c.gray(`   Full report: statelint demo --fault ${SPOTLIGHT}`));
    io.out("");
  }
  if (demo.migrate) {
    io.out(c.bold("4. Migrating a stateful 2025-11-25 server (examples/stateful-notes-server)"));
    io.out("");
    io.out(renderMigrationText({ ...demo.migrate, path: "examples/stateful-notes-server" }, c, { diff: true }));
    io.out("");
  }
  io.out(c.bold("Try it on your own server"));
  io.out("   npx github:NHTanvir/statelint check http://127.0.0.1:3000/mcp");
  io.out("   npx github:NHTanvir/statelint migrate .");
  io.out("");
  io.out(
    demo.ok
      ? c.green(`Demo OK: both reference servers scored 100/100 and each of the ${demo.faults.length} faults broke exactly its own rule.`)
      : c.red("Demo FAILED: a fixture did not behave as expected (see above)."),
  );
  return demo.ok ? EXIT.ok : EXIT.findings;
}
