/** `statelint rules`: list the conformance rules (or, with --migrate, the migration rules). */
import { CATEGORIES, RULES } from "../check/rules.js";
import { CODEMODS } from "../migrate/codemods.js";
import { MIGRATION_RULES } from "../migrate/rules.js";
import { SEP_URL } from "../protocol/constants.js";
import { flagBool, parseArgs } from "../util/args.js";
import { padEnd } from "../util/color.js";
import { EXIT, paletteFor } from "./shared.js";
export const RULES_FLAGS = { json: {}, migrate: {}, verbose: { alias: "v" }, color: {} };
export const RULES_HELP = `Usage: statelint rules [--migrate] [--verbose] [--json]

List every conformance rule with its level (MUST rules fail, SHOULD rules warn), the spec
section, the SEP and the matching official conformance check. --verbose adds how each rule is
tested. --migrate lists the migration rules and codemods instead.`;
export async function rulesCommand(argv, io) {
    const args = parseArgs(argv, RULES_FLAGS);
    const c = paletteFor(io, args.flags.get("color"));
    if (flagBool(args, "migrate")) {
        if (flagBool(args, "json")) {
            io.out(JSON.stringify({ rules: MIGRATION_RULES, codemods: CODEMODS }, null, 2));
            return EXIT.ok;
        }
        const width = Math.max(...MIGRATION_RULES.map((r) => r.id.length));
        io.out(c.bold(`${MIGRATION_RULES.length} migration rules`));
        for (const r of MIGRATION_RULES)
            io.out(`  ${padEnd(r.id, width)}  ${padEnd(r.severity, 11)} ${r.title}`);
        io.out("");
        io.out(c.bold("Codemods"));
        for (const m of CODEMODS)
            io.out(`  ${padEnd(m.id, 12)} ${m.title}`);
        return EXIT.ok;
    }
    if (flagBool(args, "json")) {
        io.out(JSON.stringify(RULES.map((r) => ({ id: r.id, title: r.title, category: r.category, level: r.level, how: r.how, spec: r.spec, ...(r.sep ? { sep: SEP_URL(r.sep) } : {}), ...(r.official ? { official: r.official } : {}) })), null, 2));
        return EXIT.ok;
    }
    const width = Math.max(...RULES.map((r) => r.id.length));
    io.out(c.bold(`${RULES.length} conformance rules for MCP 2026-07-28`) + c.gray(" (MUST rules fail, SHOULD rules warn)"));
    for (const cat of CATEGORIES) {
        io.out("");
        io.out(c.bold(cat));
        for (const r of RULES.filter((x) => x.category === cat)) {
            io.out(`  ${padEnd(r.id, width)}  ${padEnd(r.level === "must" ? "MUST" : "SHOULD", 6)}  ${r.title}${r.sep ? c.gray(` (SEP-${r.sep})`) : ""}`);
            if (flagBool(args, "verbose"))
                io.out(`  ${" ".repeat(width)}  ${" ".repeat(6)}  ${c.gray(r.how)}`);
        }
    }
    return EXIT.ok;
}
