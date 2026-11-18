import { type CodemodOutcome } from "./codemods.js";
import { type Finding, type Severity } from "./rules.js";
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
        typescriptSdk?: {
            v1?: string;
            v2: Record<string, string>;
        };
        pythonSdk?: string;
        goSdk?: string;
        frameworks: string[];
        files: number;
    };
    /** True when nothing MCP-related was found. */
    noMcp: boolean;
    findings: Array<Finding & {
        fixedByCodemod: boolean;
    }>;
    codemods: CodemodReport[];
    /** Findings still open after the codemods (the same as `findings` minus the fixed ones). */
    remaining: Finding[];
    plan: string[];
    written: string[];
    /** `required` counts findings now; `requiredAfterRewrite` counts what is left once the codemods are applied. */
    summary: Record<Severity, number> & {
        autoFixable: number;
        requiredAfterRewrite: number;
    };
}
/** Run the migration analysis on a project already in memory. */
export declare function migrateProject(project: ProjectInfo, path: string, options?: MigrateOptions): MigrationReport;
/** Read a project from disk and analyse it (writing rewrites when `write` is set). */
export declare function runMigrate(path: string, options?: MigrateOptions): MigrationReport;
export { analyzeProject, readProject };
export type { Finding, Severity };
