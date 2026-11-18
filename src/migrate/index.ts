/** `statelint migrate`: findings, safe codemods, and an ordered migration plan. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC_VERSION } from "../protocol/constants.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { runCodemods, type CodemodOutcome } from "./codemods.js";
import { diffStats, unifiedDiff } from "./diff.js";
import { detectFindings, type Finding, type Severity } from "./rules.js";
import { analyzeProject, readProject, type ProjectInfo } from "./scan.js";

export interface MigrateOptions {
  /** Write rewritten files to disk. */
  write?: boolean;
}

export interface CodemodReport {
  codemod: string;
  file: string;
  status: CodemodOutcome["status"];
  reason?: string;
  notes: string[];
  added?: number;
  removed?: number;
  diff?: string;
}

export interface MigrationReport {
  tool: string;
  version: string;
  spec: string;
  path: string;
  project: {
    languages: string[];
    typescriptSdk?: { v1?: string; v2: Record<string, string> };
    pythonSdk?: string;
    goSdk?: string;
    frameworks: string[];
    files: number;
  };
  /** True when nothing MCP-related was found. */
  noMcp: boolean;
  findings: Array<Finding & { fixedByCodemod: boolean }>;
  codemods: CodemodReport[];
  /** Findings still open after the codemods (the same as `findings` minus the fixed ones). */
  remaining: Finding[];
  plan: string[];
  written: string[];
  /** `required` counts findings now; `requiredAfterRewrite` counts what is left once the codemods are applied. */
  summary: Record<Severity, number> & { autoFixable: number; requiredAfterRewrite: number };
}

const key = (f: Finding) => `${f.rule}|${f.file ?? ""}`;

function buildPlan(project: ProjectInfo, findings: Finding[], codemods: CodemodReport[], wrote: boolean): string[] {
  const has = (rule: string) => findings.some((f) => f.rule === rule);
  const rewritten = (id: string) => codemods.filter((c) => c.codemod === id && c.status === "rewritten").map((c) => c.file);
  const refusedOf = (id: string) => codemods.filter((c) => c.codemod === id && c.status === "refused");
  const plan: string[] = [];
  const apply = wrote ? "was applied" : "is ready: run `statelint migrate . --write` (review with --diff first)";

  if (has("sdk-v1")) {
    plan.push(
      "Upgrade to the v2 packages with the official codemod, at the package root: `npx @modelcontextprotocol/codemod@latest v1-to-v2 .`, then `npm install`. It renames imports and APIs only; the transport keeps speaking 2025-11-25 until the next step.",
      "Re-run `statelint migrate .` on the upgraded code: the entry-point rewrite needs the v2 imports.",
    );
  }
  if (has("transport-entry") || has("session-map") || has("initialize-routing")) {
    const done = rewritten("http-entry");
    const refused = refusedOf("http-entry");
    if (done.length > 0) {
      plan.push(`Switch the HTTP entry point to createMcpHandler + toNodeHandler. The rewrite for ${done.join(", ")} ${apply}.`);
      const deps = ["@modelcontextprotocol/server", "@modelcontextprotocol/node"].filter((d) => !(d in project.ts.v2));
      if (deps.length > 0) plan.push(`Install the entry-point packages: \`npm install ${deps.join(" ")}\`.`);
    } else if (!has("sdk-v1")) {
      plan.push(
        `Switch the HTTP entry point by hand${refused[0] ? ` (statelint did not rewrite ${refused[0].file}: ${refused[0].reason})` : ""}: build the server in a factory and serve it with \`const handler = createMcpHandler(() => buildServer());\` and \`app.all('/mcp', (req, res) => void toNodeHandler(handler)(req, res, req.body));\`. Delete the session map, isInitializeRequest branch, onsessioninitialized callback and the GET/DELETE routes.`,
      );
    }
  }
  if (has("dns-rebinding")) {
    plan.push("Keep DNS-rebinding protection: createMcpHandler validates no Host or Origin header, so mount createMcpExpressApp() or localhostHostValidation() + localhostOriginValidation() in front of it.");
  }
  if (has("session-state")) {
    plan.push("Replace per-session state with explicit handles: return an id from a creation tool and take it as a tool argument afterwards; carry multi-step input in MRTR requestState (createRequestStateCodec).");
  }
  if (has("server-to-client-request") || has("url-elicitation")) {
    plan.push("Turn elicitation, sampling and roots requests into Multi Round-Trip Requests: return inputRequired({ inputRequests: { … } }) and read ctx.mcpReq.inputResponses on the retry.");
  }
  if (has("list-changed-push") || has("resources-subscribe")) {
    plan.push("Publish change notifications with handler.notify.toolsChanged() / resourceUpdated(uri); subscriptions/listen replaces the GET stream and resources/subscribe.");
  }
  if (has("stdio-entry")) {
    const done = rewritten("stdio-entry");
    const refused = refusedOf("stdio-entry");
    plan.push(
      done.length > 0
        ? `Serve stdio with serveStdio(factory). The rewrite for ${done.join(", ")} ${apply}.`
        : `Serve stdio with serveStdio(() => buildServer()) from @modelcontextprotocol/server/stdio${refused[0] ? ` (statelint did not rewrite ${refused[0].file}: ${refused[0].reason})` : ""}.`,
    );
  }
  if (has("retired-error-code") || has("draft-error-code")) {
    const done = rewritten("error-codes");
    plan.push(done.length > 0 ? `Renumber error codes (-32002 → -32602; draft -32001/-32003/-32004 → -32020/-32021/-32022). The rewrite ${apply}.` : "Renumber error codes by hand: -32002 → -32602; draft -32001/-32003/-32004 → -32020/-32021/-32022.");
  }
  if (has("py-sdk-v1")) plan.push("Python: move to mcp>=2 (MCPServer); a v2 server answers 2026-07-28 and 2025-11-25 from one endpoint.");
  if (has("go-sdk-version") || has("go-stateless")) plan.push("Go: upgrade go-sdk to v1.7.0 or later and set StreamableHTTPOptions.Stateless = true.");
  if (plan.length > 0 || findings.length > 0) {
    plan.push("Start the server and verify it on the wire: `statelint check http://127.0.0.1:<port>/mcp`. 90 or more means every MUST rule passes.");
  }
  return plan;
}

/** Run the migration analysis on a project already in memory. */
export function migrateProject(project: ProjectInfo, path: string, options: MigrateOptions = {}): MigrationReport {
  const findings = detectFindings(project);
  const outcomes = runCodemods(project);

  // Rewritten text per file (the last rewrite wins; codemods chain per file).
  const finalText = new Map<string, string>();
  for (const o of outcomes) if (o.status === "rewritten" && o.newText !== undefined) finalText.set(o.file, o.newText);

  const rewrittenProject = analyzeProject(
    project.files.map((f) => ({ path: f.path, text: finalText.get(f.path) ?? f.text })),
    project.root,
  );
  const after = finalText.size > 0 ? detectFindings(rewrittenProject) : findings;
  const afterKeys = new Map<string, number>();
  for (const f of after) afterKeys.set(key(f), (afterKeys.get(key(f)) ?? 0) + 1);
  const beforeKeys = new Map<string, number>();
  for (const f of findings) beforeKeys.set(key(f), (beforeKeys.get(key(f)) ?? 0) + 1);

  // Fixed means: a codemod owns this rule, rewrote the file, and the finding is gone afterwards.
  const marked = findings.map((f) => ({
    ...f,
    fixedByCodemod: !!f.codemod && finalText.has(f.file ?? "\u0000") && (afterKeys.get(key(f)) ?? 0) < (beforeKeys.get(key(f)) ?? 0),
  }));

  const original = new Map(project.files.map((f) => [f.path, f.text] as const));
  const codemods: CodemodReport[] = outcomes.map((o) => {
    const report: CodemodReport = { codemod: o.codemod, file: o.file, status: o.status, notes: o.notes, ...(o.reason ? { reason: o.reason } : {}) };
    return report;
  });
  // One diff per file (covering every chained codemod), attached to the file's last rewrite.
  for (const [file, text] of finalText) {
    const before = original.get(file) ?? "";
    const last = [...codemods].reverse().find((c) => c.file === file && c.status === "rewritten");
    if (!last) continue;
    const stats = diffStats(before, text);
    last.added = stats.added;
    last.removed = stats.removed;
    last.diff = unifiedDiff(before, text, file);
  }

  const written: string[] = [];
  if (options.write) {
    for (const [file, text] of finalText) {
      writeFileSync(join(path, file), text, "utf8");
      written.push(file);
    }
  }

  const summary = {
    required: findings.filter((f) => f.severity === "required").length,
    recommended: findings.filter((f) => f.severity === "recommended").length,
    info: findings.filter((f) => f.severity === "info").length,
    autoFixable: marked.filter((f) => f.fixedByCodemod).length,
    requiredAfterRewrite: after.filter((f) => f.severity === "required").length,
  };
  const noMcp =
    findings.length === 0 &&
    project.ts.sdkV1 === undefined &&
    Object.keys(project.ts.v2).length === 0 &&
    project.python.mcp === undefined &&
    project.go.goSdk === undefined;

  return {
    tool: TOOL_NAME,
    version: VERSION,
    spec: SPEC_VERSION,
    path,
    project: {
      languages: project.languages,
      ...(project.ts.sdkV1 !== undefined || Object.keys(project.ts.v2).length > 0
        ? { typescriptSdk: { ...(project.ts.sdkV1 !== undefined ? { v1: project.ts.sdkV1 } : {}), v2: project.ts.v2 } }
        : {}),
      ...(project.python.mcp !== undefined ? { pythonSdk: project.python.mcp } : {}),
      ...(project.go.goSdk !== undefined ? { goSdk: project.go.goSdk } : {}),
      frameworks: project.ts.frameworks,
      files: project.files.length,
    },
    noMcp,
    findings: marked,
    codemods,
    remaining: after,
    plan: buildPlan(project, findings, codemods, !!options.write),
    written,
    summary,
  };
}

/** Read a project from disk and analyse it (writing rewrites when `write` is set). */
export function runMigrate(path: string, options: MigrateOptions = {}): MigrationReport {
  return migrateProject(readProject(path), path, options);
}

export { analyzeProject, readProject };
export type { Finding, Severity };
