/**
 * A small JavaScript/TypeScript lexer: enough to find calls, imports and statements by
 * bracket matching, and to tell code from comments and strings. It is deliberately not a
 * parser; codemods built on it check their preconditions and refuse anything unusual.
 */
export class LexError extends Error {
    name = "LexError";
}
const REGEX_AFTER_KEYWORD = new Set([
    "return",
    "typeof",
    "instanceof",
    "in",
    "of",
    "new",
    "delete",
    "void",
    "throw",
    "case",
    "do",
    "else",
    "yield",
    "await",
]);
const MULTI_PUNCT = ["...", "===", "!==", "**=", "<<=", ">>=", "=>", "?.", "??", "&&", "||", "==", "!=", "<=", ">=", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^="];
const isIdentStart = (c) => /[A-Za-z_$À-￿]/.test(c);
const isIdentPart = (c) => /[A-Za-z0-9_$À-￿]/.test(c);
export function lex(src) {
    const tokens = [];
    const comments = [];
    let i = 0;
    let line = 0;
    const n = src.length;
    const push = (type, start, end, startLine) => tokens.push({ type, value: src.slice(start, end), start, end, line: startLine });
    const regexAllowed = () => {
        const prev = tokens[tokens.length - 1];
        if (!prev)
            return true;
        if (prev.type === "punct")
            return !(prev.value === ")" || prev.value === "]" || prev.value === "}" || prev.value === "++" || prev.value === "--");
        if (prev.type === "ident")
            return REGEX_AFTER_KEYWORD.has(prev.value);
        return false;
    };
    /** Skip a quoted string starting at `i` (the quote). Returns the index after the closing quote. */
    const skipString = (from, quote) => {
        let j = from + 1;
        while (j < n) {
            const c = src[j];
            if (c === "\\") {
                j += 2;
                continue;
            }
            if (c === quote)
                return j + 1;
            if (c === "\n")
                throw new LexError(`unterminated string on line ${line + 1}`);
            j++;
        }
        throw new LexError("unterminated string at end of file");
    };
    /** Skip a template literal starting at `from` (the backtick), including nested ${…}. */
    const skipTemplate = (from) => {
        let j = from + 1;
        while (j < n) {
            const c = src[j];
            if (c === "\\") {
                j += 2;
                continue;
            }
            if (c === "`")
                return j + 1;
            if (c === "$" && src[j + 1] === "{") {
                j = skipTemplateExpression(j + 2);
                continue;
            }
            j++;
        }
        throw new LexError("unterminated template literal");
    };
    /** Skip code inside ${ … } up to its matching }, honouring nested strings and templates. */
    const skipTemplateExpression = (from) => {
        let depth = 1;
        let j = from;
        while (j < n) {
            const c = src[j];
            if (c === "'" || c === '"') {
                j = skipString(j, c);
                continue;
            }
            if (c === "`") {
                j = skipTemplate(j);
                continue;
            }
            if (c === "/" && src[j + 1] === "/") {
                while (j < n && src[j] !== "\n")
                    j++;
                continue;
            }
            if (c === "/" && src[j + 1] === "*") {
                const close = src.indexOf("*/", j + 2);
                j = close === -1 ? n : close + 2;
                continue;
            }
            if (c === "{")
                depth++;
            else if (c === "}") {
                depth--;
                if (depth === 0)
                    return j + 1;
            }
            j++;
        }
        throw new LexError("unterminated template expression");
    };
    const countLines = (from, to) => {
        for (let k = from; k < to; k++)
            if (src.charCodeAt(k) === 10)
                line++;
    };
    while (i < n) {
        const c = src[i];
        if (c === "\n") {
            line++;
            i++;
            continue;
        }
        if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === "﻿") {
            i++;
            continue;
        }
        // Hashbang on the first line.
        if (i === 0 && c === "#" && src[1] === "!") {
            while (i < n && src[i] !== "\n")
                i++;
            continue;
        }
        if (c === "/" && src[i + 1] === "/") {
            const start = i;
            while (i < n && src[i] !== "\n")
                i++;
            comments.push({ start, end: i, line: true });
            continue;
        }
        if (c === "/" && src[i + 1] === "*") {
            const start = i;
            const close = src.indexOf("*/", i + 2);
            if (close === -1)
                throw new LexError("unterminated block comment");
            i = close + 2;
            countLines(start, i);
            comments.push({ start, end: i, line: false });
            continue;
        }
        const startLine = line;
        if (c === "'" || c === '"') {
            const end = skipString(i, c);
            push("string", i, end, startLine);
            i = end;
            continue;
        }
        if (c === "`") {
            const end = skipTemplate(i);
            push("template", i, end, startLine);
            countLines(i, end);
            i = end;
            continue;
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
            let j = i + 1;
            while (j < n && /[0-9A-Za-z_.]/.test(src[j])) {
                // Stop before a method call on an integer literal like 1..toString(); rare, harmless.
                j++;
            }
            push("number", i, j, startLine);
            i = j;
            continue;
        }
        if (isIdentStart(c) || (c === "#" && isIdentStart(src[i + 1] ?? ""))) {
            let j = i + 1;
            while (j < n && isIdentPart(src[j]))
                j++;
            push("ident", i, j, startLine);
            i = j;
            continue;
        }
        if (c === "/" && regexAllowed()) {
            let j = i + 1;
            let inClass = false;
            while (j < n) {
                const d = src[j];
                if (d === "\\") {
                    j += 2;
                    continue;
                }
                if (d === "\n")
                    throw new LexError(`unterminated regular expression on line ${line + 1}`);
                if (d === "[")
                    inClass = true;
                else if (d === "]")
                    inClass = false;
                else if (d === "/" && !inClass)
                    break;
                j++;
            }
            j++;
            while (j < n && /[a-z]/i.test(src[j]))
                j++;
            push("regex", i, j, startLine);
            i = j;
            continue;
        }
        const multi = MULTI_PUNCT.find((p) => src.startsWith(p, i));
        // `?.` followed by a digit is a ternary, not optional chaining.
        if (multi && !(multi === "?." && /[0-9]/.test(src[i + 2] ?? ""))) {
            push("punct", i, i + multi.length, startLine);
            i += multi.length;
            continue;
        }
        push("punct", i, i + 1, startLine);
        i++;
    }
    return { tokens, comments };
}
/** Map each opening bracket token index to its closing index (and back). Throws on imbalance. */
export function matchBrackets(tokens) {
    const pairs = new Map();
    const stack = [];
    const open = { ")": "(", "]": "[", "}": "{" };
    tokens.forEach((t, idx) => {
        if (t.type !== "punct")
            return;
        if (t.value === "(" || t.value === "[" || t.value === "{")
            stack.push(idx);
        else if (t.value === ")" || t.value === "]" || t.value === "}") {
            const o = stack.pop();
            if (o === undefined || tokens[o]?.value !== open[t.value])
                throw new LexError(`unbalanced "${t.value}" on line ${t.line + 1}`);
            pairs.set(o, idx);
            pairs.set(idx, o);
        }
    });
    if (stack.length > 0)
        throw new LexError(`unclosed "${tokens[stack[stack.length - 1]]?.value}"`);
    return pairs;
}
/** The source with comments blanked out (newlines kept), so regex scans skip commented code. */
export function maskComments(src) {
    try {
        const { comments } = lex(src);
        let out = "";
        let last = 0;
        for (const c of comments) {
            out += src.slice(last, c.start) + src.slice(c.start, c.end).replace(/[^\n]/g, " ");
            last = c.end;
        }
        return out + src.slice(last);
    }
    catch {
        return src;
    }
}
