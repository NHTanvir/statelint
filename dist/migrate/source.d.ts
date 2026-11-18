/** Structural helpers over lexer tokens: calls, arguments, statements, imports, identifier uses, edits. */
import { type Token } from "./lexer.js";
export interface Parsed {
    text: string;
    tokens: Token[];
    pairs: Map<number, number>;
}
/** Lex and bracket-match a source file; undefined when it cannot be tokenized safely. */
export declare function parse(text: string): Parsed | undefined;
export declare function lineOf(text: string, offset: number): number;
export declare function isPunct(t: Token | undefined, value: string): boolean;
export declare function isIdent(t: Token | undefined, value?: string): boolean;
/** The string value of a string token ('…' or "…"), or of a template without substitutions. */
export declare function stringValue(t: Token | undefined): string | undefined;
export interface ArgRange {
    /** First and last token index of the argument (inclusive). */
    from: number;
    to: number;
}
/** Split the tokens between an opening bracket and its partner on top-level commas. */
export declare function splitArgs(p: Parsed, openIdx: number): ArgRange[];
export declare function rangeText(p: Parsed, r: ArgRange): string;
export interface CallSite {
    /** Token index of the object identifier (`app` in `app.post(…)`). */
    objIdx: number;
    obj: string;
    method: string;
    openIdx: number;
    closeIdx: number;
    args: ArgRange[];
}
/** Find `<ident>.<method>(…)` calls. */
export declare function findMemberCalls(p: Parsed, methods: ReadonlySet<string>): CallSite[];
/** True when token `idx` starts a statement (start of file, after `;`, `{`, `}`, or on a fresh line). */
export declare function startsStatement(p: Parsed, idx: number): boolean;
/** The index of the last token of the statement that starts at `startIdx` and contains `lastIdx`. */
export declare function statementEnd(p: Parsed, lastIdx: number): number;
/**
 * Character span of a whole statement, ready to delete: from the start of its first line
 * (plus any comment-only lines directly above it) to the end of its last line.
 */
export declare function statementSpan(p: Parsed, firstIdx: number, lastIdx: number): {
    start: number;
    end: number;
};
export interface ImportSpecifier {
    imported: string;
    local: string;
    typeOnly: boolean;
    /** Token index range of the specifier inside the braces. */
    from: number;
    to: number;
}
export interface ImportDecl {
    firstIdx: number;
    lastIdx: number;
    source: string;
    defaultName?: string;
    namespace?: string;
    typeOnly: boolean;
    named: ImportSpecifier[];
    braceOpen?: number;
    braceClose?: number;
}
/** Parse top-level `import … from '…'` declarations (and bare `import '…'`). */
export declare function parseImports(p: Parsed): ImportDecl[];
/** Token indexes where `name` is used as a free identifier (not a property access or key). */
export declare function identUses(p: Parsed, name: string): number[];
export interface Declaration {
    firstIdx: number;
    lastIdx: number;
    /** Token index of the declared name. */
    nameIdx: number;
    kind: "const" | "let" | "var" | "function";
    /** For `const x = …`: index of the first token of the initializer. */
    initIdx?: number;
}
/** Find a declaration of `name`: `const|let|var name … = …;` or `[async] function name(…) {…}`. */
export declare function findDeclaration(p: Parsed, name: string, range?: {
    from: number;
    to: number;
}): Declaration | undefined;
export interface Edit {
    start: number;
    end: number;
    text: string;
}
/** Apply non-overlapping edits. Throws if two edits overlap. */
export declare function applyEdits(text: string, edits: Edit[]): string;
/** Collapse runs of 3+ newlines (left behind by removed statements) into one blank line. */
export declare function tidyBlankLines(text: string): string;
