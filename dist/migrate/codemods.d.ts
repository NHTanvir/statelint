import type { ProjectInfo, VirtualFile } from "./scan.js";
export type CodemodStatus = "rewritten" | "refused" | "not-applicable";
export interface CodemodOutcome {
    codemod: string;
    file: string;
    status: CodemodStatus;
    /** Why it was refused (or what it did). */
    reason?: string;
    notes: string[];
    newText?: string;
}
export interface CodemodInfo {
    id: string;
    title: string;
}
export declare const CODEMODS: readonly CodemodInfo[];
/** The http-entry codemod (Express / Node-style route handlers). */
export declare function httpEntry(file: VirtualFile, project: ProjectInfo): CodemodOutcome;
/** Replace `server.connect(new StdioServerTransport())` with `serveStdio(() => factory())`. */
export declare function stdioEntry(file: VirtualFile, project: ProjectInfo): CodemodOutcome;
/** Renumber retired and draft error codes where the line clearly constructs or names an error. */
export declare function errorCodes(file: VirtualFile): CodemodOutcome;
/** Run every codemod over every file, chaining their output per file. */
export declare function runCodemods(project: ProjectInfo): CodemodOutcome[];
