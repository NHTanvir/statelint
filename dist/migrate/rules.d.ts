import { type ProjectInfo } from "./scan.js";
export type Severity = "required" | "recommended" | "info";
export interface Finding {
    rule: string;
    severity: Severity;
    /** Project-relative path; absent for project-level findings. */
    file?: string;
    line?: number;
    message: string;
    fix: string;
    /** Where the requirement comes from. */
    source: string;
    /** Id of the codemod that can rewrite this, when one applies. */
    codemod?: string;
}
export declare const TS_GUIDE = "https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28";
export declare const TS_UPGRADE = "https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2";
export declare const TS_HTTP = "https://ts.sdk.modelcontextprotocol.io/v2/serving/http";
export declare const PY_GUIDE = "https://py.sdk.modelcontextprotocol.io/v2/migration/";
export declare const GO_RELEASE = "https://github.com/modelcontextprotocol/go-sdk/releases";
export interface RuleInfo {
    id: string;
    severity: Severity;
    title: string;
}
/** Every migration rule, for `statelint rules --migrate` and the docs. */
export declare const MIGRATION_RULES: readonly RuleInfo[];
/** Is a Python version spec for `mcp` already on v2? */
export declare function pythonSpecIsV2(spec: string): boolean | undefined;
/** Compare Go module versions like v1.6.1 < v1.7.0. Pre-releases sort before their release. */
export declare function goVersionBelow(version: string, target: string): boolean;
export declare function detectFindings(project: ProjectInfo): Finding[];
