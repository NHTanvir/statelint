// Regenerate docs/rules.md from the rule definitions: `npm run build && node scripts/rules-doc.mjs`.
import { writeFileSync } from "node:fs";
import { CATEGORIES, RULES, SEP_URL, MIGRATION_RULES, CODEMODS } from "../dist/index.js";

const out = [];
out.push("# Statelint rules: stateless MCP 2026-07-28 conformance and migration");
out.push("");
out.push(
  `Statelint checks **${RULES.length} conformance rules** against a running MCP server and reports **${MIGRATION_RULES.length} kinds of migration finding** in source code. ` +
    "Every conformance rule cites the section of the [2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28) it comes from, the SEP that introduced it, " +
    "and the matching check id in the official [`@modelcontextprotocol/conformance`](https://github.com/modelcontextprotocol/conformance) suite where one exists.",
);
out.push("");
out.push("This page is generated from the rule definitions in [`src/check/rules.ts`](../src/check/rules.ts) by `scripts/rules-doc.mjs`, so it always matches the code. `statelint rules --verbose` prints the same list.");
out.push("");
out.push("**Levels.** A MUST rule that is violated **fails**; a SHOULD rule that is violated **warns**. A rule whose prerequisite failed (for example, every rule needs one request to succeed without a handshake) is **blocked**, and a rule for a capability the server does not offer is **skipped**.");
out.push("");
out.push("**Score.** MUST rules are worth 3 points and SHOULD rules 1. A passing rule earns its points, a MUST rule that only partly passes earns half, and anything else earns nothing; skipped rules do not count. A failed or blocked MUST rule caps the score at 89, so **90 or more always means conformant**.");
out.push("");
out.push("## Conformance rules (`statelint check`)");
for (const cat of CATEGORIES) {
  const rules = RULES.filter((r) => r.category === cat);
  out.push("");
  out.push(`### ${cat}`);
  out.push("");
  out.push("| Rule | Level | What it requires | How Statelint tests it | Source |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const r of rules) {
    const src = [`[spec](${r.spec})`, ...(r.sep ? [`[SEP-${r.sep}](${SEP_URL(r.sep)})`] : []), ...(r.official ?? []).map((o) => `\`${o}\``)].join(" · ");
    out.push(`| \`${r.id}\` | ${r.level === "must" ? "MUST" : "SHOULD"} | ${r.title} | ${r.how.replace(/\|/g, "\\|")} | ${src} |`);
  }
}
out.push("");
out.push("## Migration findings (`statelint migrate`)");
out.push("");
out.push("| Finding | Severity | What it flags |");
out.push("| --- | --- | --- |");
for (const r of MIGRATION_RULES) out.push(`| \`${r.id}\` | ${r.severity} | ${r.title} |`);
out.push("");
out.push("## Codemods (`statelint migrate --write`)");
out.push("");
out.push("| Codemod | What it rewrites |");
out.push("| --- | --- |");
for (const m of CODEMODS) out.push(`| \`${m.id}\` | ${m.title} |`);
out.push("");
out.push("Each codemod proves its preconditions on the token stream first and refuses, with the reason, when it cannot: for example when the route handler does more than host the transport, the server instance is shared between requests, or tools still read `ctx.sessionId`.");
out.push("");
writeFileSync(new URL("../docs/rules.md", import.meta.url), out.join("\n"));
console.log(`docs/rules.md: ${RULES.length} rules, ${MIGRATION_RULES.length} findings, ${CODEMODS.length} codemods`);
