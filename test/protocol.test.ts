import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeHeaderValue, encodeHeaderValue, findXMcpHeaders, sensitiveXMcpHeaders, validateXMcpHeaders } from "../src/protocol/headers.js";
import { SseParser, formatSseEvent } from "../src/protocol/sse.js";
import { errorOf, isNotification, isRequest, isResponse, resultOf } from "../src/protocol/jsonrpc.js";

describe("Base64 sentinel (streamable-http › Value Encoding)", () => {
  // The spec's own encoding table.
  const table: Array<[string, string]> = [
    ["us-west1", "us-west1"],
    ["Hello, 世界", "=?base64?SGVsbG8sIOS4lueVjA==?="],
    [" padded ", "=?base64?IHBhZGRlZCA=?="],
    ["line1\nline2", "=?base64?bGluZTEKbGluZTI=?="],
    ["=?base64?literal?=", "=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?="],
  ];
  for (const [value, encoded] of table) {
    test(`encodes ${JSON.stringify(value)}`, () => assert.equal(encodeHeaderValue(value), encoded));
    test(`round-trips ${JSON.stringify(value)}`, () => assert.equal(decodeHeaderValue(encodeHeaderValue(value)).value, value));
  }
  test("plain values decode to themselves, unmarked", () => {
    assert.deepEqual(decodeHeaderValue("get_weather"), { value: "get_weather", encoded: false });
  });
  test("a sentinel is reported as encoded", () => {
    assert.equal(decodeHeaderValue("=?base64?SGVsbG8=?=").encoded, true);
  });
});

describe("x-mcp-header validation (server/tools › x-mcp-header)", () => {
  const schema = (props: Record<string, unknown>) => ({ type: "object", properties: props });

  test("accepts string, integer and boolean parameters", () => {
    const s = schema({
      region: { type: "string", "x-mcp-header": "Region" },
      shard: { type: "integer", "x-mcp-header": "Shard" },
      dry: { type: "boolean", "x-mcp-header": "Dry-Run" },
    });
    assert.deepEqual(validateXMcpHeaders(s), []);
    assert.equal(findXMcpHeaders(s).length, 3);
  });
  test("rejects a number parameter", () => {
    const p = validateXMcpHeaders(schema({ level: { type: "number", "x-mcp-header": "Level" } }));
    assert.equal(p.length, 1);
    assert.match(p[0]!.reason, /number/);
  });
  test("rejects an empty value", () => {
    assert.match(validateXMcpHeaders(schema({ a: { type: "string", "x-mcp-header": "" } }))[0]!.reason, /empty/);
  });
  test("rejects a value that is not an RFC 9110 token", () => {
    assert.match(validateXMcpHeaders(schema({ a: { type: "string", "x-mcp-header": "My Header" } }))[0]!.reason, /token/);
  });
  test("rejects control characters", () => {
    assert.match(validateXMcpHeaders(schema({ a: { type: "string", "x-mcp-header": "A\r\nB" } }))[0]!.reason, /control/);
  });
  test("rejects duplicates, case-insensitively", () => {
    const p = validateXMcpHeaders(schema({ a: { type: "string", "x-mcp-header": "Region" }, b: { type: "string", "x-mcp-header": "REGION" } }));
    assert.equal(p.length, 1);
    assert.match(p[0]!.reason, /duplicates/);
  });
  test("accepts nested properties reached through `properties` only", () => {
    const s = schema({ target: { type: "object", properties: { region: { type: "string", "x-mcp-header": "Region" } } } });
    assert.deepEqual(validateXMcpHeaders(s), []);
    assert.equal(findXMcpHeaders(s)[0]!.path, "target.region");
  });
  test("rejects annotations under items, anyOf or $defs (not statically reachable)", () => {
    for (const s of [
      schema({ list: { type: "array", items: { type: "string", "x-mcp-header": "Item" } } }),
      schema({ v: { anyOf: [{ type: "string", "x-mcp-header": "V" }] } }),
      { type: "object", $defs: { r: { type: "string", "x-mcp-header": "R" } } },
    ]) {
      assert.ok(validateXMcpHeaders(s).some((p) => /reachable/.test(p.reason)), JSON.stringify(s));
    }
  });
  test("accepts an enum of strings without an explicit type", () => {
    assert.deepEqual(validateXMcpHeaders(schema({ mode: { enum: ["a", "b"], "x-mcp-header": "Mode" } })), []);
  });
  test("flags credential-looking parameters as sensitive", () => {
    const s = schema({ apiKey: { type: "string", "x-mcp-header": "Api-Key" }, region: { type: "string", "x-mcp-header": "Region" } });
    assert.deepEqual(sensitiveXMcpHeaders(s).map((a) => a.path), ["apiKey"]);
  });
});

describe("SSE parser", () => {
  test("parses events split across chunks with CRLF and comments", () => {
    const p = new SseParser();
    const events = [...p.push(": keep-alive\r\nevent: message\r\nda"), ...p.push('ta: {"a":1}\r\n\r\ndata: x\n'), ...p.push("data: y\n\n")];
    assert.deepEqual(
      events.map((e) => [e.event, e.data]),
      [
        ["message", '{"a":1}'],
        ["message", "x\ny"],
      ],
    );
    assert.equal(p.comments, 1);
  });
  test("counts id fields (resumability leftovers)", () => {
    const p = new SseParser();
    const events = p.push("id: 7\ndata: hi\n\n");
    assert.equal(events[0]!.id, "7");
    assert.equal(p.idFields, 1);
  });
  test("does not dispatch an event without data", () => {
    assert.deepEqual(new SseParser().push("event: ping\n\n"), []);
  });
  test("a lone CR at a chunk boundary waits for the LF", () => {
    const p = new SseParser();
    assert.deepEqual(p.push("data: a\r"), []);
    assert.equal(p.push("\n\r\n")[0]!.data, "a");
  });
  test("formatSseEvent round-trips through the parser", () => {
    const ev = new SseParser().push(formatSseEvent('{"x":"a\\nb"}', { event: "message" }))[0];
    assert.equal(ev!.data, '{"x":"a\\nb"}');
  });
});

describe("JSON-RPC guards", () => {
  test("tell requests, notifications and responses apart", () => {
    assert.ok(isRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    assert.ok(isNotification({ jsonrpc: "2.0", method: "notifications/progress" }));
    assert.ok(isResponse({ jsonrpc: "2.0", id: 1, result: {} }));
    assert.ok(!isRequest({ jsonrpc: "2.0", method: "x" }));
  });
  test("errorOf and resultOf", () => {
    assert.equal(errorOf({ jsonrpc: "2.0", id: 1, error: { code: -32020, message: "m" } })?.code, -32020);
    assert.deepEqual(resultOf({ jsonrpc: "2.0", id: 1, result: { a: 1 } }), { a: 1 });
    assert.equal(errorOf({ jsonrpc: "2.0", id: 1, result: {} }), undefined);
  });
});
