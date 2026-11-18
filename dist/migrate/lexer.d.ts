/**
 * A small JavaScript/TypeScript lexer: enough to find calls, imports and statements by
 * bracket matching, and to tell code from comments and strings. It is deliberately not a
 * parser; codemods built on it check their preconditions and refuse anything unusual.
 */
export type TokenType = "ident" | "string" | "template" | "number" | "regex" | "punct";
export interface Token {
    type: TokenType;
    value: string;
    start: number;
    end: number;
    /** 0-based line of `start`. */
    line: number;
}
export interface LexResult {
    tokens: Token[];
    comments: Array<{
        start: number;
        end: number;
        line: boolean;
    }>;
}
export declare class LexError extends Error {
    name: string;
}
export declare function lex(src: string): LexResult;
/** Map each opening bracket token index to its closing index (and back). Throws on imbalance. */
export declare function matchBrackets(tokens: Token[]): Map<number, number>;
/** The source with comments blanked out (newlines kept), so regex scans skip commented code. */
export declare function maskComments(src: string): string;
