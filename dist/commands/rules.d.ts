import { type FlagSpec } from "../util/args.js";
import { type CliIO } from "./shared.js";
export declare const RULES_FLAGS: Record<string, FlagSpec>;
export declare const RULES_HELP = "Usage: statelint rules [--migrate] [--verbose] [--json]\n\nList every conformance rule with its level (MUST rules fail, SHOULD rules warn), the spec\nsection, the SEP and the matching official conformance check. --verbose adds how each rule is\ntested. --migrate lists the migration rules and codemods instead.";
export declare function rulesCommand(argv: string[], io: CliIO): Promise<number>;
