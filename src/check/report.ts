/** Render a check report as terminal text or GitHub-flavoured Markdown. */
import { padEnd, type Palette } from "../util/color.js";
import { CATEGORIES, type Status } from "./rules.js";
import type { CheckReport, RuleResult } from "./runner.js";

const SYMBOL: Record<Status, string> = { pass: "✓", fail: "✗", warn: "!", skip: "–", blocked: "⊘" };
const LABEL: Record<Status, string> = { pass: "pass", fail: "FAIL", warn: "warn", skip: "skip", blocked: "blocked" };

function paint(c: Palette, status: Status, s: string): string {
  switch (status) {
    case "pass":
      return c.green(s);
    case "fail":
      return c.red(s);
    case "warn":
      return c.yellow(s);
    case "blocked":
      return c.magenta(s);
    default:
      return c.gray(s);
  }
}

export function eraLabel(era: CheckReport["server"]["era"]): string {
  switch (era) {
    case "modern-only":
      return "2026-07-28 only";
    case "dual-era":
      return "dual-era (2026-07-28 and legacy initialize)";
    case "legacy":
      return "legacy only (initialize handshake)";
    default:
      return "unknown";
  }
}

export function verdictLine(r: CheckReport): string {
  if (r.inconclusive) return `Inconclusive: ${r.inconclusive}`;
  const failed = r.rules.filter((x) => x.level === "must" && x.status === "fail").map((x) => x.id);
  const blocked = r.rules.filter((x) => x.level === "must" && x.status === "blocked").map((x) => x.id);
  if (r.conformant) {
    return r.summary.warn > 0
      ? `Conformant: every MUST rule passed (${r.summary.warn} SHOULD-level warning${r.summary.warn === 1 ? "" : "s"}).`
      : "Conformant: every rule passed.";
  }
  const parts: string[] = [];
  if (failed.length) parts.push(`${failed.length} MUST rule${failed.length === 1 ? "" : "s"} failed (${failed.join(", ")})`);
  if (blocked.length) parts.push(`${blocked.length} could not be checked`);
  return `Not conformant: ${parts.join("; ")}.`;
}

export interface TextOptions {
  verbose?: boolean;
}

export function renderText(r: CheckReport, c: Palette, opts: TextOptions = {}): string {
  const out: string[] = [];
  out.push(`${c.bold(`statelint ${r.version}`)} ${c.gray("·")} MCP ${r.spec} conformance check`);
  out.push(`${c.gray("target")}  ${r.target}`);
  const who = [r.server.name && `${r.server.name}${r.server.version ? ` ${r.server.version}` : ""}`, eraLabel(r.server.era), r.server.capabilities.join(", ") || "no tools, prompts or resources"]
    .filter(Boolean)
    .join(c.gray(" · "));
  out.push(`${c.gray("server")}  ${who}`);
  out.push("");

  const width = Math.max(...r.rules.map((x) => x.id.length)) + 2;
  for (const cat of CATEGORIES) {
    const rules = r.rules.filter((x) => x.category === cat);
    if (rules.length === 0) continue;
    out.push(c.bold(cat));
    for (const rule of rules) out.push(...ruleLines(rule, c, width, opts));
    out.push("");
  }

  const s = r.summary;
  const counts = [
    `${s.pass} passed`,
    s.fail ? c.red(`${s.fail} failed`) : `${s.fail} failed`,
    s.warn ? c.yellow(`${s.warn} warning${s.warn === 1 ? "" : "s"}`) : "0 warnings",
    `${s.skip} skipped`,
    ...(s.blocked ? [c.magenta(`${s.blocked} blocked`)] : []),
  ].join(c.gray(" · "));
  const score = r.inconclusive ? c.gray("–/100") : r.score >= 90 ? c.green(`${r.score}/100`) : r.score >= 60 ? c.yellow(`${r.score}/100`) : c.red(`${r.score}/100`);
  out.push(`${c.bold("Score")} ${c.bold(score)}  ${counts}  ${c.gray(`(${r.durationMs} ms)`)}`);
  const v = verdictLine(r);
  out.push(r.conformant ? c.green(v) : r.inconclusive ? c.yellow(v) : c.red(v));
  return out.join("\n");
}

function ruleLines(rule: RuleResult, c: Palette, width: number, opts: TextOptions): string[] {
  const head = `  ${paint(c, rule.status, `${SYMBOL[rule.status]} ${padEnd(LABEL[rule.status], 7)}`)} ${padEnd(rule.id, width)}`;
  const level = c.gray(rule.level === "must" ? "MUST  " : "SHOULD");
  if (rule.status === "pass" && !opts.verbose) return [`${head}${level} ${c.gray(rule.title)}`];
  const lines = [`${head}${level} ${rule.status === "pass" || rule.status === "skip" ? c.gray(rule.message) : rule.message}`];
  const pad = " ".repeat(12);
  if (rule.status === "fail" || rule.status === "warn" || opts.verbose) {
    if (rule.fix) lines.push(`${pad}${c.cyan("fix ")} ${rule.fix}`);
    if (rule.status !== "pass") lines.push(`${pad}${c.cyan("spec")} ${rule.spec}`);
    for (const e of (rule.evidence ?? []).slice(0, opts.verbose ? 10 : 3)) lines.push(`${pad}${c.gray(`seen ${e}`)}`);
  }
  return lines;
}

const EMOJI: Record<Status, string> = { pass: "✅", fail: "❌", warn: "⚠️", skip: "➖", blocked: "⛔" };

function md(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderMarkdown(r: CheckReport): string {
  const out: string[] = [];
  out.push(`## Statelint: MCP ${r.spec} conformance ${r.inconclusive ? "(inconclusive)" : `${r.score}/100`}`);
  out.push("");
  out.push(`**Target:** \`${r.target}\` · **Server:** ${md(r.server.name ?? "unknown")}${r.server.version ? ` ${md(r.server.version)}` : ""} · ${eraLabel(r.server.era)}`);
  out.push("");
  out.push(`**${r.conformant ? "✅" : r.inconclusive ? "⚠️" : "❌"} ${md(verdictLine(r))}**`);
  out.push("");
  out.push("| | Rule | Level | Result |");
  out.push("| --- | --- | --- | --- |");
  for (const rule of r.rules) {
    out.push(`| ${EMOJI[rule.status]} | \`${rule.id}\` | ${rule.level === "must" ? "MUST" : "SHOULD"} | ${md(rule.status === "pass" ? rule.title : rule.message)} |`);
  }
  const todo = r.rules.filter((x) => (x.status === "fail" || x.status === "warn") && x.fix);
  if (todo.length > 0) {
    out.push("");
    out.push("### How to fix");
    out.push("");
    for (const rule of todo) {
      out.push(`- **\`${rule.id}\`**: ${md(rule.fix ?? "")} ([spec](${rule.spec}))`);
    }
  }
  out.push("");
  out.push(`<sub>Statelint ${r.version} · ${r.summary.pass} passed, ${r.summary.fail} failed, ${r.summary.warn} warnings, ${r.summary.skip} skipped${r.summary.blocked ? `, ${r.summary.blocked} blocked` : ""} · [rules](https://github.com/NHTanvir/statelint#rules)</sub>`);
  return out.join("\n");
}
