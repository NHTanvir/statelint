/**
 * Statelint as a library: the 2026-07-28 conformance check, the migration assistant, the
 * reference server and the protocol helpers.
 */
export { runCheck, selectRules, type CheckOptions, type CheckReport, type RuleResult, type ServerEra } from "./check/runner.js";
export { RULES, CATEGORIES, type RuleDef, type Level, type Status, type Category } from "./check/rules.js";
export { renderText, renderMarkdown, verdictLine } from "./check/report.js";
export { computeScore, WEIGHT, NON_CONFORMANT_CAP } from "./check/score.js";
export { sendProbe, type ProbeRequest, type ProbeResponse } from "./check/http.js";
export { runMigrate, migrateProject, analyzeProject, readProject, type MigrationReport, type MigrateOptions } from "./migrate/index.js";
export { MIGRATION_RULES, detectFindings, type Finding, type Severity } from "./migrate/rules.js";
export { CODEMODS, runCodemods, httpEntry, stdioEntry, errorCodes, type CodemodOutcome } from "./migrate/codemods.js";
export { unifiedDiff, diffStats } from "./migrate/diff.js";
export { renderMigrationText } from "./migrate/report.js";
export { createReferenceServer, SERVER_INFO, SUPPORTED_VERSIONS, type ReferenceServer, type ReferenceServerOptions, type FetchHandler } from "./fixtures/reference-server.js";
export { FAULTS, FAULT_IDS, type FaultId, type FaultInfo } from "./fixtures/faults.js";
export { serveFetchHandler, inProcessFetch } from "./fixtures/node-adapter.js";
export * from "./protocol/constants.js";
export { encodeHeaderValue, decodeHeaderValue, validateXMcpHeaders, findXMcpHeaders, sensitiveXMcpHeaders } from "./protocol/headers.js";
export { SseParser } from "./protocol/sse.js";
export { runCli } from "./run.js";
export { VERSION } from "./version.js";
