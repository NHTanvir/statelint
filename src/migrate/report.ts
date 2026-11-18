/** Render a migration report as terminal text. */
import type { Palette } from "../util/color.js";
import type { MigrationReport } from "./index.js";
import type { Severity } from "./rules.js";

const SEV_LABEL: Record<Severity, string> = { required: "Required", recommended: "Recommended", info: "Info" };

export interface MigrateTextOptions {
  diff?: boolean;
  /** Cap per severity group; 0 = no cap. */
  limit?: number;
}

function colorDiff(diff: string, c: Palette): string {
  return diff
    .split("\n")
    .map((l) => (l.startsWith("+++") || l.startsWith("---") ? c.bold(l) : l.startsWith("@@") ? c.cyan(l) : l.startsWith("+") ? c.green(l) : l.startsWith("-") ? c.red(l) : l))
    .join("\n");
}

export function renderMigrationText(r: MigrationReport, c: Palette, opts: MigrateTextOptions = {}): string {
  const out: string[] = [];
  out.push(`${c.bold(`statelint ${r.version}`)} ${c.gray("·")} migrate to MCP ${r.spec} (stateless)`);
  const sdk: string[] = [];
  if (r.project.typescriptSdk?.v1) sdk.push(`@modelcontextprotocol/sdk ${r.project.typescriptSdk.v1} (v1)`);
  for (const [name, v] of Object.entries(r.project.typescriptSdk?.v2 ?? {})) sdk.push(`${name} ${v}`);
  if (r.project.pythonSdk) sdk.push(`python mcp ${r.project.pythonSdk}`);
  if (r.project.goSdk) sdk.push(`go-sdk ${r.project.goSdk}`);
  out.push(`${c.gray("project")} ${r.path} ${c.gray("·")} ${r.project.files} file(s) ${c.gray("·")} ${r.project.languages.join(", ") || "no source files"}`);
  if (sdk.length || r.project.frameworks.length) out.push(`${c.gray("uses")}    ${[...sdk, ...r.project.frameworks].join(c.gray(" · "))}`);
  out.push("");

  if (r.noMcp) {
    out.push(c.yellow("No MCP server code found here (no MCP SDK dependency, transport or session handling)."));
    return out.join("\n");
  }
  if (r.findings.length === 0) {
    out.push(c.green(`Nothing to migrate: no 2025-era session, handshake or transport code found.`));
    out.push(`Verify on the wire: ${c.bold("statelint check http://127.0.0.1:<port>/mcp")}`);
    return out.join("\n");
  }

  const limit = opts.limit ?? 12;
  for (const sev of ["required", "recommended", "info"] as const) {
    const group = r.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const paint = sev === "required" ? c.red : sev === "recommended" ? c.yellow : c.gray;
    out.push(c.bold(`${SEV_LABEL[sev]} (${group.length})`));
    for (const f of limit > 0 ? group.slice(0, limit) : group) {
      const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "(project)";
      const mark = f.fixedByCodemod ? c.green("✓ auto") : paint(sev === "required" ? "✗" : sev === "recommended" ? "!" : "·");
      out.push(`  ${mark} ${c.bold(f.rule)} ${c.gray(where)}`);
      out.push(`      ${f.message}`);
      if (!f.fixedByCodemod) out.push(`      ${c.cyan("fix")} ${f.fix}`);
    }
    if (limit > 0 && group.length > limit) out.push(c.gray(`  … and ${group.length - limit} more (use --json for all)`));
    out.push("");
  }

  const mods = r.codemods.filter((m) => m.status !== "not-applicable");
  if (mods.length > 0) {
    out.push(c.bold("Codemods"));
    for (const m of mods) {
      if (m.status === "rewritten") {
        const stats = m.added !== undefined ? c.gray(` (+${m.added} −${m.removed})`) : "";
        out.push(`  ${c.green("✓")} ${m.codemod} ${c.gray(m.file)}${stats}`);
        for (const n of m.notes) out.push(`      ${n}`);
      } else {
        out.push(`  ${c.yellow("–")} ${m.codemod} ${c.gray(m.file)} ${c.yellow("not rewritten:")} ${m.reason ?? ""}`);
      }
    }
    out.push("");
  }

  if (opts.diff) {
    const diffs = r.codemods.filter((m) => m.diff);
    for (const m of diffs) out.push(colorDiff(m.diff as string, c));
    if (diffs.length > 0) out.push("");
  }

  out.push(c.bold("Plan"));
  r.plan.forEach((step, i) => out.push(`  ${i + 1}. ${step}`));
  out.push("");

  const s = r.summary;
  const tail =
    r.written.length > 0
      ? c.green(`Wrote ${r.written.length} file(s): ${r.written.join(", ")}. ${s.requiredAfterRewrite} required change(s) remain.`)
      : s.autoFixable > 0
        ? `${s.autoFixable} of ${r.findings.length} finding(s) can be fixed automatically: ${c.bold("statelint migrate <path> --diff")} to review, ${c.bold("--write")} to apply.`
        : `${s.required} required, ${s.recommended} recommended, ${s.info} info.`;
  out.push(tail);
  return out.join("\n");
}
