/** `statelint check <url>`: the 2026-07-28 conformance check. */
import { appendFileSync, writeFileSync } from "node:fs";
import { renderMarkdown, renderText, verdictLine } from "../check/report.js";
import { runCheck } from "../check/runner.js";
import { flagBool, flagInt, flagList, flagString, parseArgs, parseHeaders, UsageError } from "../util/args.js";
import { EXIT, paletteFor } from "./shared.js";
export const CHECK_FLAGS = {
    json: {},
    header: { value: true, repeat: true, alias: "H" },
    timeout: { value: true },
    "close-grace": { value: true },
    wait: { value: true },
    only: { value: true, repeat: true },
    skip: { value: true, repeat: true },
    strict: {},
    "min-score": { value: true },
    output: { value: true, alias: "o" },
    summary: { value: true },
    verbose: { alias: "v" },
    quiet: { alias: "q" },
    color: {},
};
export const CHECK_HELP = `Usage: statelint check <url> [options]

Check a running MCP server against the stateless 2026-07-28 specification: no initialize
handshake, no Mcp-Session-Id, MCP-Protocol-Version / Mcp-Method / Mcp-Name required and in
agreement with the body (-32020 HeaderMismatch), server/discover, cache hints, JSON and SSE
responses. Probes never call a real tool or read a real resource.

Options:
  -H, --header "Name: value"   Send a header on every request (repeatable), e.g. Authorization
      --json                   Print the report as JSON (for CI)
  -o, --output <file>          Also write the report: .json, .md, or anything else as text
      --summary <file>         Append a Markdown summary (use $GITHUB_STEP_SUMMARY)
      --only <rule,...>        Run only these rules (repeatable or comma-separated)
      --skip <rule,...>        Leave these rules out
      --strict                 Exit 1 on SHOULD-level warnings too
      --min-score <n>          Exit 1 when the score is below n (0-100)
      --wait <duration>        Wait for the server to come up first, e.g. 30s (for CI)
      --timeout <ms>           Per-request time limit (default 10000)
      --close-grace <ms>       How long an SSE stream may stay open after its response (default 1500)
  -v, --verbose                Show every rule's message and evidence
  -q, --quiet                  Print only the verdict line
      --no-color               Plain output

Exit codes: 0 conformant, 1 not conformant (or --strict / --min-score not met), 2 could not check.`;
function splitList(values) {
    return values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}
export function exitCodeFor(report, opts) {
    if (report.inconclusive)
        return EXIT.usage;
    if (!report.conformant)
        return EXIT.findings;
    if (opts.strict && report.summary.warn > 0)
        return EXIT.findings;
    if (opts.minScore !== undefined && report.score < opts.minScore)
        return EXIT.findings;
    return EXIT.ok;
}
export async function checkCommand(argv, io) {
    const args = parseArgs(argv, CHECK_FLAGS);
    if (args.positionals.length !== 1)
        throw new UsageError("check needs exactly one URL, for example: statelint check http://127.0.0.1:3000/mcp");
    const url = args.positionals[0];
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new UsageError(`not a URL: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        throw new UsageError(`only http and https URLs can be checked, got ${parsed.protocol}`);
    const minScoreRaw = flagString(args, "min-score");
    const minScore = minScoreRaw === undefined ? undefined : Number(minScoreRaw);
    if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 100))
        throw new UsageError("--min-score must be a number from 0 to 100");
    let report;
    try {
        report = await runCheck(url, {
            headers: parseHeaders(flagList(args, "header")),
            timeoutMs: flagInt(args, "timeout", 10_000, 1),
            closeGraceMs: flagInt(args, "close-grace", 1_500, 0),
            waitMs: flagInt(args, "wait", 0, 0),
            only: splitList(flagList(args, "only")),
            skip: splitList(flagList(args, "skip")),
            ...(io.fetch ? { fetch: io.fetch } : {}),
        });
    }
    catch (err) {
        if (err instanceof Error && /unknown rule id/.test(err.message))
            throw new UsageError(err.message);
        throw err;
    }
    const c = paletteFor(io, args.flags.get("color"));
    if (flagBool(args, "json"))
        io.out(JSON.stringify(report, null, 2));
    else if (flagBool(args, "quiet"))
        io.out(`${report.inconclusive ? "–" : report.score}/100 ${verdictLine(report)}`);
    else
        io.out(renderText(report, c, { verbose: flagBool(args, "verbose") }));
    const output = flagString(args, "output");
    if (output) {
        const body = output.endsWith(".json") ? JSON.stringify(report, null, 2) : output.endsWith(".md") ? renderMarkdown(report) : renderText(report, paletteFor(io, false));
        writeFileSync(output, `${body}\n`, "utf8");
    }
    const summary = flagString(args, "summary");
    if (summary)
        appendFileSync(summary, `${renderMarkdown(report)}\n`, "utf8");
    return exitCodeFor(report, { strict: flagBool(args, "strict"), ...(minScore !== undefined ? { minScore } : {}) });
}
