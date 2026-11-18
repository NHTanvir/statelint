/** `statelint migrate [path]`: what must change to go stateless, with safe codemods. */
import { existsSync, statSync, writeFileSync } from "node:fs";
import { runMigrate } from "../migrate/index.js";
import { renderMigrationText } from "../migrate/report.js";
import { flagBool, flagString, parseArgs, UsageError, type FlagSpec } from "../util/args.js";
import { EXIT, paletteFor, type CliIO } from "./shared.js";

export const MIGRATE_FLAGS: Record<string, FlagSpec> = {
  json: {},
  diff: { alias: "d" },
  write: { alias: "w" },
  all: {},
  output: { value: true, alias: "o" },
  color: {},
};

export const MIGRATE_HELP = `Usage: statelint migrate [path] [options]

Scan an MCP server project (default: the current directory) for what must change to serve the
stateless 2026-07-28 revision: the 2025-era Streamable HTTP transport and its sessions, the
initialize branch, GET/DELETE routes, resumability, per-session state, server-to-client requests,
retired error codes. For the official TypeScript SDK it rewrites what it can prove safe
(createMcpHandler + toNodeHandler, serveStdio, error codes) and prints precise manual steps for
the rest. Python and Go projects get SDK and transport checks.

Options:
  -d, --diff            Show the unified diff of every rewrite
  -w, --write           Apply the rewrites to the files (review --diff first)
      --json            Print the report as JSON
  -o, --output <file>   Also write the JSON report to a file
      --all             Do not cap the findings shown per group
      --no-color        Plain output

Exit codes: 0 nothing required left, 1 required changes remain, 2 usage error.`;

export async function migrateCommand(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv, MIGRATE_FLAGS);
  if (args.positionals.length > 1) throw new UsageError("migrate takes at most one path");
  const path = args.positionals[0] ?? ".";
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new UsageError(`not a directory: ${path}`);

  const write = flagBool(args, "write");
  const report = runMigrate(path, { write });
  const c = paletteFor(io, args.flags.get("color") as boolean | undefined);
  if (flagBool(args, "json")) io.out(JSON.stringify(report, null, 2));
  else io.out(renderMigrationText(report, c, { diff: flagBool(args, "diff"), limit: flagBool(args, "all") ? 0 : 12 }));

  const output = flagString(args, "output");
  if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const open = write ? report.summary.requiredAfterRewrite : report.summary.required;
  return open > 0 ? EXIT.findings : EXIT.ok;
}
