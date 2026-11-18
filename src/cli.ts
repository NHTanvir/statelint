#!/usr/bin/env node
import { processIO } from "./commands/shared.js";
import { runCli } from "./run.js";

runCli(process.argv.slice(2), processIO()).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`statelint: ${(err as Error).stack ?? String(err)}\n`);
    process.exitCode = 2;
  },
);
