import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lex, LexError, maskComments, matchBrackets } from "../src/migrate/lexer.js";
import { findDeclaration, findMemberCalls, parse, parseImports, splitArgs, rangeText, statementSpan, statementEnd } from "../src/migrate/source.js";
import { diffStats, unifiedDiff } from "../src/migrate/diff.js";

describe("lexer", () => {
  test("keeps brackets inside strings, templates and regexes out of the bracket count", () => {
    const src = "const a = '(['; const b = `${ { x: ')' }.x }`; const r = /[)]/g; f(a, b, r);";
    const { tokens } = lex(src);
    assert.doesNotThrow(() => matchBrackets(tokens));
    assert.ok(tokens.some((t) => t.type === "regex" && t.value === "/[)]/g"));
  });
  test("tells division from a regex", () => {
    const { tokens } = lex("const x = a / b / c; const y = (1) / 2;");
    assert.ok(!tokens.some((t) => t.type === "regex"));
  });
  test("tracks line numbers through block comments and templates", () => {
    const { tokens } = lex("/* a\nb */\nconst x = `1\n2`;\nfoo();");
    assert.equal(tokens.find((t) => t.value === "foo")?.line, 4);
  });
  test("throws on an unterminated string", () => {
    assert.throws(() => lex("const s = 'oops\n"), LexError);
  });
  test("maskComments blanks comments but keeps offsets and strings", () => {
    const src = "a(); // 'mcp-session-id'\nb('mcp-session-id'); /* x */";
    const masked = maskComments(src);
    assert.equal(masked.length, src.length);
    assert.equal(masked.match(/mcp-session-id/g)?.length, 1);
  });
});

describe("source helpers", () => {
  const src = [
    "import express from 'express';",
    "import { a, type B, c as d } from \"pkg\";",
    "const app = express();",
    "app.post('/mcp', auth, async (req, res) => { await go(req, res); });",
    "function helper(x) { return x + 1; }",
    "",
  ].join("\n");
  const p = parse(src)!;

  test("parses imports with default, named, type-only and aliased specifiers", () => {
    const imports = parseImports(p);
    assert.equal(imports.length, 2);
    assert.equal(imports[0]!.defaultName, "express");
    assert.deepEqual(
      imports[1]!.named.map((s) => [s.imported, s.local, s.typeOnly]),
      [
        ["a", "a", false],
        ["B", "B", true],
        ["c", "d", false],
      ],
    );
  });
  test("finds member calls and splits their arguments", () => {
    const [call] = findMemberCalls(p, new Set(["post"]));
    assert.equal(call!.obj, "app");
    assert.deepEqual(call!.args.map((a) => rangeText(p, a)).slice(0, 2), ["'/mcp'", "auth"]);
    assert.equal(splitArgs(p, call!.openIdx).length, 3);
  });
  test("finds const and function declarations", () => {
    assert.equal(findDeclaration(p, "app")?.kind, "const");
    assert.equal(findDeclaration(p, "helper")?.kind, "function");
  });
  test("statementSpan covers whole lines including the semicolon", () => {
    const [call] = findMemberCalls(p, new Set(["post"]));
    const span = statementSpan(p, call!.objIdx, statementEnd(p, call!.closeIdx));
    assert.equal(src.slice(span.start, span.end), "app.post('/mcp', auth, async (req, res) => { await go(req, res); });\n");
  });
});

describe("unified diff", () => {
  test("is empty for equal texts", () => assert.equal(unifiedDiff("a\nb\n", "a\nb\n", "f"), ""));
  test("counts added and removed lines", () => {
    assert.deepEqual(diffStats("a\nb\nc\n", "a\nx\nc\nd\n"), { added: 2, removed: 1 });
  });
  test("rebuilds both sides from the hunks", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const after = before.replace("line 3\n", "line three\n").replace("line 25\n", "").replace("line 29\n", "line 29\nline 30\n");
    const diff = unifiedDiff(before, after, "f.txt");
    assert.match(diff, /^--- a\/f\.txt\n\+\+\+ b\/f\.txt\n@@ /);
    // Every hunk's - and space lines come from `before`, + and space lines from `after`.
    const minus = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));
    const plus = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
    assert.deepEqual(minus, ["line 3", "line 25"]);
    assert.deepEqual(plus, ["line three", "line 30"]);
    // Changes within 2 x 3 context lines share a hunk, as in diff -u.
    assert.equal((diff.match(/^@@/gm) ?? []).length, 2);
  });
});
