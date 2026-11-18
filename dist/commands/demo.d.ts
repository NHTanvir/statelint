import { type CheckReport } from "../check/runner.js";
import { type MigrationReport } from "../migrate/index.js";
import { type FlagSpec } from "../util/args.js";
import { type CliIO } from "./shared.js";
export declare const DEMO_FLAGS: Record<string, FlagSpec>;
export declare const DEMO_HELP = "Usage: statelint demo [options]\n\nRun Statelint offline against its bundled servers: a compliant stateless MCP 2026-07-28 server\n(JSON and SSE), one deliberately broken server per rule, and a stateful 2025-11-25 example\nproject for the migration assistant. Nothing touches the network.\n\nOptions:\n      --fault <id>     Show the full report for one broken server\n      --no-migrate     Skip the migration part\n      --json           Machine-readable results\n      --no-color       Plain output";
export declare const DEMO_URL = "http://statelint.demo/mcp";
/** The bundled example, found by walking up from this module (works from dist/ and build/src/). */
export declare function exampleProjectPath(): string;
export interface FaultResult {
    fault: string;
    rule: string;
    summary: string;
    score: number;
    status: string;
    /** The fault broke exactly its rule and nothing else. */
    isolated: boolean;
    message: string;
}
export interface DemoResult {
    reference: {
        json: CheckReport;
        sse: CheckReport;
    };
    faults: FaultResult[];
    migrate?: MigrationReport;
    ok: boolean;
}
export declare function runDemo(opts?: {
    migrate?: boolean;
}): Promise<DemoResult>;
export declare function demoCommand(argv: string[], io: CliIO): Promise<number>;
