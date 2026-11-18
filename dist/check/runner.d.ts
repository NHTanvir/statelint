import { type ProbeResponse } from "./http.js";
import { RULES, evidenceLine, type Category, type Level, type Status } from "./rules.js";
export interface CheckOptions {
    /** Extra headers for every request, for example Authorization. */
    headers?: Record<string, string>;
    /** Per-request time limit, ms. */
    timeoutMs?: number;
    /** How long an SSE stream may stay open after its final response, ms. */
    closeGraceMs?: number;
    /** How long to wait for the first event of a subscriptions/listen stream, ms. */
    firstEventMs?: number;
    /** Fetch implementation; defaults to the global fetch. Tests and the demo pass an in-process one. */
    fetch?: typeof fetch;
    /** Run only these rule ids. */
    only?: string[];
    /** Leave these rule ids out. */
    skip?: string[];
    /** Wait up to this long for the server to accept connections before probing, ms (for CI). */
    waitMs?: number;
    onProbe?: (p: ProbeResponse) => void;
}
export interface RuleResult {
    id: string;
    title: string;
    category: Category;
    level: Level;
    status: Status;
    message: string;
    fix?: string;
    spec: string;
    sep?: string;
    official?: string[];
    evidence?: string[];
}
export type ServerEra = "modern-only" | "dual-era" | "legacy" | "unknown";
export interface CheckReport {
    tool: string;
    version: string;
    spec: string;
    target: string;
    startedAt: string;
    durationMs: number;
    score: number;
    /** No MUST rule failed or was blocked. */
    conformant: boolean;
    /** Set when the check could not reach a verdict (unreachable, or authentication needed). */
    inconclusive?: string;
    summary: Record<Status, number> & {
        total: number;
    };
    server: {
        name?: string;
        version?: string;
        supportedVersions?: string[];
        capabilities: string[];
        era: ServerEra;
    };
    rules: RuleResult[];
    probes: Array<{
        name: string;
        request: string;
        response: string;
        status: number;
        durationMs: number;
    }>;
}
export declare function selectRules(only?: string[], skip?: string[]): typeof RULES;
/** Poll until the endpoint answers anything over HTTP, or the time is up. */
export declare function waitForServer(url: string, fetchImpl: typeof fetch, waitMs: number): Promise<boolean>;
export declare function runCheck(url: string, options?: CheckOptions): Promise<CheckReport>;
export { evidenceLine };
