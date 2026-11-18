/**
 * A small argument parser: `--flag value`, `--flag=value`, boolean flags,
 * repeated flags, and `--no-<flag>`. No dependency, predictable errors.
 */
export interface FlagSpec {
    /** Takes a value. Without this the flag is a boolean. */
    value?: boolean;
    /** May be given more than once; values are collected in order. */
    repeat?: boolean;
    /** Single-letter alias, without the dash. */
    alias?: string;
}
export interface ParsedArgs {
    positionals: string[];
    flags: Map<string, string[] | boolean>;
}
export declare class UsageError extends Error {
    name: string;
}
export declare function parseArgs(argv: string[], spec: Record<string, FlagSpec>): ParsedArgs;
export declare function flagString(args: ParsedArgs, name: string): string | undefined;
export declare function flagList(args: ParsedArgs, name: string): string[];
export declare function flagBool(args: ParsedArgs, name: string, fallback?: boolean): boolean;
export declare function flagInt(args: ParsedArgs, name: string, fallback: number, min?: number): number;
/** "1500", "1500ms", "2s", "1m" -> milliseconds. Plain integers stay as they are. */
export declare function parseDuration(raw: string): number | undefined;
/** Parse repeated `--header "Name: value"` flags. */
export declare function parseHeaders(values: string[]): Record<string, string>;
