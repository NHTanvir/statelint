import { type FlagSpec } from "../util/args.js";
import { type CliIO } from "./shared.js";
export declare const RULES_FLAGS: Record<string, FlagSpec>;
export declare const RULES_HELP = "Usage: statelint rules [--migrate] [--json]\n\nList every conformance rule with its level (MUST rules fail, SHOULD rules warn), the spec\nsection, the SEP and the matching official conformance check. --migrate lists the migration\nrules and codemods instead.";
export declare function rulesCommand(argv: string[], io: CliIO): Promise<number>;
