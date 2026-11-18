import { type ProbeResponse } from "./http.js";
import { type CheckContext } from "./probes.js";
export type Level = "must" | "should";
export type Status = "pass" | "fail" | "warn" | "skip" | "blocked";
export declare const CATEGORIES: readonly ["Stateless core", "Header/body agreement (SEP-2243)", "Versions and errors", "Results and caching", "Responses: JSON and SSE", "Security"];
export type Category = (typeof CATEGORIES)[number];
export interface Verdict {
    verdict: "pass" | "violation" | "partial" | "skip" | "blocked";
    message: string;
    fix?: string;
    evidence?: string[];
}
export interface RuleDef {
    id: string;
    title: string;
    category: Category;
    level: Level;
    spec: string;
    sep?: number;
    /** Matching check ids in the official @modelcontextprotocol/conformance suite. */
    official?: string[];
    /** How Statelint tests it, in one sentence (docs and `statelint rules --verbose`). */
    how: string;
    evaluate(ctx: CheckContext): Verdict;
}
/** "POST server/discover · MCP-Protocol-Version: 2025-11-25 · Mcp-Method: server/discover". */
export declare function requestSummary(p: ProbeResponse): string;
export declare function evidenceLine(p: ProbeResponse): string;
export declare const RULES: readonly RuleDef[];
export declare function ruleById(id: string): RuleDef | undefined;
export declare function sepLink(n: number | undefined): string | undefined;
