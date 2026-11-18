export interface VirtualFile {
    /** Path relative to the project root, with forward slashes. */
    path: string;
    text: string;
}
export type Language = "typescript" | "javascript" | "python" | "go" | "rust" | "csharp" | "java" | "kotlin";
export interface ProjectInfo {
    root: string;
    files: VirtualFile[];
    languages: Language[];
    /** TypeScript/JavaScript SDK facts from package.json files. */
    ts: {
        /** Version range of the v1 package `@modelcontextprotocol/sdk`, if depended on. */
        sdkV1?: string;
        /** v2 packages depended on, name -> version range. */
        v2: Record<string, string>;
        frameworks: string[];
        manifests: string[];
    };
    python: {
        mcp?: string;
        manifests: string[];
    };
    go: {
        goSdk?: string;
        manifests: string[];
    };
    /** Files skipped because they were too large or unreadable. */
    skipped: string[];
}
export declare function extensionOf(path: string): string;
export declare function languageOf(path: string): Language | undefined;
export declare function isJsLike(path: string): boolean;
/** Walk a directory and return source files and manifests, relative to `root`. */
export declare function readProject(root: string): ProjectInfo;
/** Build project facts from files already in memory (tests, the demo). */
export declare function analyzeProject(files: VirtualFile[], root?: string): ProjectInfo;
