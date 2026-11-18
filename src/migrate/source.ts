/** Structural helpers over lexer tokens: calls, arguments, statements, imports, identifier uses, edits. */
import { lex, matchBrackets, type Token } from "./lexer.js";

export interface Parsed {
  text: string;
  tokens: Token[];
  pairs: Map<number, number>;
}

/** Lex and bracket-match a source file; undefined when it cannot be tokenized safely. */
export function parse(text: string): Parsed | undefined {
  try {
    const { tokens } = lex(text);
    return { text, tokens, pairs: matchBrackets(tokens) };
  } catch {
    return undefined;
  }
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function isPunct(t: Token | undefined, value: string): boolean {
  return !!t && t.type === "punct" && t.value === value;
}

export function isIdent(t: Token | undefined, value?: string): boolean {
  return !!t && t.type === "ident" && (value === undefined || t.value === value);
}

/** The string value of a string token ('…' or "…"), or of a template without substitutions. */
export function stringValue(t: Token | undefined): string | undefined {
  if (!t) return undefined;
  if (t.type === "string") return t.value.slice(1, -1);
  if (t.type === "template" && !t.value.includes("${")) return t.value.slice(1, -1);
  return undefined;
}

export interface ArgRange {
  /** First and last token index of the argument (inclusive). */
  from: number;
  to: number;
}

/** Split the tokens between an opening bracket and its partner on top-level commas. */
export function splitArgs(p: Parsed, openIdx: number): ArgRange[] {
  const closeIdx = p.pairs.get(openIdx);
  if (closeIdx === undefined || closeIdx === openIdx + 1) return [];
  const out: ArgRange[] = [];
  let from = openIdx + 1;
  for (let i = openIdx + 1; i < closeIdx; i++) {
    const t = p.tokens[i] as Token;
    const partner = p.pairs.get(i);
    if (partner !== undefined && partner > i) {
      i = partner;
      continue;
    }
    if (isPunct(t, ",")) {
      if (i > from) out.push({ from, to: i - 1 });
      from = i + 1;
    }
  }
  if (closeIdx > from) out.push({ from, to: closeIdx - 1 });
  return out;
}

export function rangeText(p: Parsed, r: ArgRange): string {
  return p.text.slice((p.tokens[r.from] as Token).start, (p.tokens[r.to] as Token).end);
}

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
export function findMemberCalls(p: Parsed, methods: ReadonlySet<string>): CallSite[] {
  const out: CallSite[] = [];
  const t = p.tokens;
  for (let i = 0; i + 3 < t.length; i++) {
    if (!isIdent(t[i]) || !isPunct(t[i + 1], ".") || !isIdent(t[i + 2]) || !isPunct(t[i + 3], "(")) continue;
    if (isPunct(t[i - 1], ".") || isPunct(t[i - 1], "?.")) continue;
    const method = (t[i + 2] as Token).value;
    if (!methods.has(method)) continue;
    const closeIdx = p.pairs.get(i + 3);
    if (closeIdx === undefined) continue;
    out.push({ objIdx: i, obj: (t[i] as Token).value, method, openIdx: i + 3, closeIdx, args: splitArgs(p, i + 3) });
  }
  return out;
}

/** True when token `idx` starts a statement (start of file, after `;`, `{`, `}`, or on a fresh line). */
export function startsStatement(p: Parsed, idx: number): boolean {
  const prev = p.tokens[idx - 1];
  const cur = p.tokens[idx] as Token;
  if (!prev) return true;
  if (isPunct(prev, ";") || isPunct(prev, "{") || isPunct(prev, "}")) return true;
  if (prev.line < cur.line) {
    // A new line ends the previous statement unless the previous token continues an expression.
    return !(prev.type === "punct" && /^(?:[=+\-*/%&|^!~?:,.([{]|=>|\?\.|\.\.\.|&&|\|\||\?\?|===|!==|==|!=|<=|>=)$/.test(prev.value));
  }
  return false;
}

/** The index of the last token of the statement that starts at `startIdx` and contains `lastIdx`. */
export function statementEnd(p: Parsed, lastIdx: number): number {
  const next = p.tokens[lastIdx + 1];
  return isPunct(next, ";") ? lastIdx + 1 : lastIdx;
}

/**
 * Character span of a whole statement, ready to delete: from the start of its first line
 * (plus any comment-only lines directly above it) to the end of its last line.
 */
export function statementSpan(p: Parsed, firstIdx: number, lastIdx: number): { start: number; end: number } {
  const text = p.text;
  const first = p.tokens[firstIdx] as Token;
  const last = p.tokens[lastIdx] as Token;
  let start = first.start;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  if (text.slice(lineStart, start).trim() === "") start = lineStart;
  // Absorb `//` comment lines directly above (no blank line in between).
  for (;;) {
    if (start === 0) break;
    const prevEnd = start - 1;
    const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1;
    const prevLine = text.slice(prevStart, prevEnd);
    if (/^\s*\/\//.test(prevLine)) start = prevStart;
    else break;
  }
  let end = last.end;
  const lineEnd = text.indexOf("\n", end);
  if (text.slice(end, lineEnd === -1 ? text.length : lineEnd).trim() === "") end = lineEnd === -1 ? text.length : lineEnd + 1;
  return { start, end };
}

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
export function parseImports(p: Parsed): ImportDecl[] {
  const out: ImportDecl[] = [];
  const t = p.tokens;
  for (let i = 0; i < t.length; i++) {
    if (!isIdent(t[i], "import") || !startsStatement(p, i)) continue;
    if (isPunct(t[i + 1], "(") || isPunct(t[i + 1], ".")) continue; // dynamic import() or import.meta
    let j = i + 1;
    const decl: ImportDecl = { firstIdx: i, lastIdx: i, source: "", typeOnly: false, named: [] };
    if (isIdent(t[j], "type") && !isIdent(t[j + 1], "from") && !isPunct(t[j + 1], ",")) {
      decl.typeOnly = true;
      j++;
    }
    const bare = stringValue(t[j]);
    if (bare !== undefined) {
      decl.source = bare;
      decl.lastIdx = statementEnd(p, j);
      out.push(decl);
      continue;
    }
    if (isIdent(t[j]) && !isIdent(t[j], "from")) {
      decl.defaultName = (t[j] as Token).value;
      j++;
      if (isPunct(t[j], ",")) j++;
    }
    if (isPunct(t[j], "*") && isIdent(t[j + 1], "as") && isIdent(t[j + 2])) {
      decl.namespace = (t[j + 2] as Token).value;
      j += 3;
    }
    if (isPunct(t[j], "{")) {
      const close = p.pairs.get(j);
      if (close === undefined) continue;
      decl.braceOpen = j;
      decl.braceClose = close;
      for (const r of splitArgs(p, j)) {
        let k = r.from;
        let typeOnly = false;
        if (isIdent(t[k], "type") && k < r.to) {
          typeOnly = true;
          k++;
        }
        const imported = (t[k] as Token).value;
        const local = isIdent(t[k + 1], "as") ? ((t[k + 2] as Token)?.value ?? imported) : imported;
        decl.named.push({ imported, local, typeOnly, from: r.from, to: r.to });
      }
      j = close + 1;
    }
    if (!isIdent(t[j], "from")) continue;
    const src = stringValue(t[j + 1]);
    if (src === undefined) continue;
    decl.source = src;
    decl.lastIdx = statementEnd(p, j + 1);
    out.push(decl);
  }
  return out;
}

/** Token indexes where `name` is used as a free identifier (not a property access or key). */
export function identUses(p: Parsed, name: string): number[] {
  const out: number[] = [];
  p.tokens.forEach((tok, i) => {
    if (tok.type !== "ident" || tok.value !== name) return;
    const prev = p.tokens[i - 1];
    if (isPunct(prev, ".") || isPunct(prev, "?.")) return;
    // `{ name: value }` object keys are not uses; shorthand `{ name }` is.
    const next = p.tokens[i + 1];
    if (isPunct(next, ":") && (isPunct(prev, "{") || isPunct(prev, ",")) && !isPunct(p.tokens[i - 2], "?")) {
      // Could still be a ternary branch, but in object literals this is a key.
      return;
    }
    out.push(i);
  });
  return out;
}

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
export function findDeclaration(p: Parsed, name: string, range?: { from: number; to: number }): Declaration | undefined {
  const t = p.tokens;
  const lo = range?.from ?? 0;
  const hi = range?.to ?? t.length - 1;
  for (let i = lo; i <= hi; i++) {
    const tok = t[i] as Token;
    if (tok.type !== "ident") continue;
    if ((tok.value === "const" || tok.value === "let" || tok.value === "var") && isIdent(t[i + 1], name)) {
      if (!startsStatement(p, i) && !isIdent(t[i - 1], "export")) continue;
      const first = isIdent(t[i - 1], "export") ? i - 1 : i;
      let eq = -1;
      let k = i + 2;
      for (; k <= hi; k++) {
        const partner = p.pairs.get(k);
        if (partner !== undefined && partner > k) k = partner;
        const cur = t[k] as Token;
        if (isPunct(cur, "=") && eq === -1) eq = k;
        if (isPunct(cur, ";")) break;
        const nxt = t[k + 1];
        if (eq !== -1 && k > eq && nxt && nxt.line > cur.line && startsStatement(p, k + 1)) break;
      }
      return { firstIdx: first, lastIdx: Math.min(k, hi), nameIdx: i + 1, kind: tok.value, ...(eq !== -1 ? { initIdx: eq + 1 } : {}) };
    }
    if (tok.value === "function" && isIdent(t[i + 1], name) && isPunct(t[i + 2], "(")) {
      const first = isIdent(t[i - 1], "async") ? (isIdent(t[i - 2], "export") ? i - 2 : i - 1) : isIdent(t[i - 1], "export") ? i - 1 : i;
      const paramsClose = p.pairs.get(i + 2);
      if (paramsClose === undefined) continue;
      let k = paramsClose + 1;
      while (k <= hi && !isPunct(t[k], "{")) k++;
      const bodyClose = p.pairs.get(k);
      if (bodyClose === undefined) continue;
      return { firstIdx: first, lastIdx: bodyClose, nameIdx: i + 1, kind: "function" };
    }
  }
  return undefined;
}

export interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Apply non-overlapping edits. Throws if two edits overlap. */
export function applyEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++) {
    const later = sorted[i - 1] as Edit;
    const earlier = sorted[i] as Edit;
    if (earlier.end > later.start) throw new Error("overlapping edits");
  }
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Collapse runs of 3+ newlines (left behind by removed statements) into one blank line. */
export function tidyBlankLines(text: string): string {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n");
}
