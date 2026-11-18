/** Command dispatch for the statelint CLI (the bin file only calls this). */
import { CHECK_HELP, checkCommand } from "./commands/check.js";
import { DEMO_HELP, demoCommand } from "./commands/demo.js";
import { MIGRATE_HELP, migrateCommand } from "./commands/migrate.js";
import { RULES_HELP, rulesCommand } from "./commands/rules.js";
import { SERVE_HELP, serveCommand } from "./commands/serve.js";
import { EXIT, type CliIO } from "./commands/shared.js";
import { UsageError } from "./util/args.js";
import { VERSION } from "./version.js";

export const HELP = `statelint ${VERSION}: conformance linter and migration assistant for stateless MCP (2026-07-28)

Usage:
  statelint check <url>       Check a running server against the 2026-07-28 spec (score 0-100)
  statelint migrate [path]    Find what must change to go stateless; --diff / --write to rewrite
  statelint demo              Run everything offline against bundled servers
  statelint serve             Run the bundled reference server (--fault to break one rule)
  statelint rules             List the conformance rules (--migrate for migration rules)

Run \`statelint <command> --help\` for options.
Docs: https://github.com/NHTanvir/statelint`;

const COMMANDS: Record<string, { run: (argv: string[], io: CliIO) => Promise<number>; help: string }> = {
  check: { run: checkCommand, help: CHECK_HELP },
  migrate: { run: migrateCommand, help: MIGRATE_HELP },
  demo: { run: demoCommand, help: DEMO_HELP },
  serve: { run: serveCommand, help: SERVE_HELP },
  rules: { run: rulesCommand, help: RULES_HELP },
};

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
    const topic = cmd === "help" ? rest[0] : undefined;
    io.out(topic && COMMANDS[topic] ? (COMMANDS[topic]?.help as string) : HELP);
    return EXIT.ok;
  }
  if (cmd === "--version" || cmd === "-V" || cmd === "version") {
    io.out(VERSION);
    return EXIT.ok;
  }
  const command = COMMANDS[cmd];
  if (!command) {
    io.err(`statelint: unknown command "${cmd}"\n\n${HELP}`);
    return EXIT.usage;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    io.out(command.help);
    return EXIT.ok;
  }
  try {
    return await command.run(rest, io);
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(`statelint ${cmd}: ${err.message}`);
      return EXIT.usage;
    }
    io.err(`statelint ${cmd}: ${(err as Error).stack ?? String(err)}`);
    return EXIT.usage;
  }
}
