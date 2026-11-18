/**
 * Streamable HTTP header rules from 2026-07-28 (SEP-2243): the Base64 sentinel for
 * `Mcp-Name` / `Mcp-Param-{Name}` values, and the constraints on `x-mcp-header`.
 */
import { isObject, type JsonObject } from "./jsonrpc.js";

const SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

/** RFC 9110 field-name token: 1*tchar. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * A value is "plain" when it can travel as-is: visible ASCII with inner spaces or tabs,
 * no leading or trailing whitespace, and not itself shaped like the sentinel.
 */
export function isPlainHeaderValue(value: string): boolean {
  if (value.length === 0) return true;
  if (!/^[\x20-\x7E\t]*$/.test(value)) return false;
  if (value !== value.trim()) return false;
  return !(value.startsWith("=?base64?") && value.endsWith("?="));
}

/** Encode a value the way a conforming client must (streamable-http › Value Encoding). */
export function encodeHeaderValue(value: string): string {
  if (isPlainHeaderValue(value)) return value;
  return `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export interface DecodedHeader {
  value: string;
  /** True when the value used the `=?base64?…?=` sentinel. */
  encoded: boolean;
}

/** Decode a header value; plain values pass through unchanged. */
export function decodeHeaderValue(raw: string): DecodedHeader {
  const m = SENTINEL.exec(raw);
  if (!m) return { value: raw, encoded: false };
  return { value: Buffer.from(m[1] ?? "", "base64").toString("utf8"), encoded: true };
}

/** RFC 9110 field values: visible ASCII, space and tab only. */
export function hasInvalidHeaderChars(raw: string): boolean {
  return !/^[\x20-\x7E\t]*$/.test(raw);
}

export function isHeaderToken(name: string): boolean {
  return TOKEN.test(name);
}

export interface XMcpHeaderAnnotation {
  /** JSON pointer to the annotated schema, e.g. `/properties/region`. */
  pointer: string;
  /** Property path of the argument, e.g. `region` or `target.region`. Empty when unreachable. */
  path: string;
  value: unknown;
  reachable: boolean;
  schema: JsonObject;
}

export interface XMcpHeaderProblem {
  pointer: string;
  path: string;
  header: string;
  reason: string;
}

const MAX_SCHEMA_NODES = 5000;

/** Find every `x-mcp-header` in a schema and whether it is statically reachable. */
export function findXMcpHeaders(inputSchema: unknown): XMcpHeaderAnnotation[] {
  const found: XMcpHeaderAnnotation[] = [];
  let visited = 0;

  const walk = (node: unknown, pointer: string, propertyPath: string[] | undefined): void => {
    if (++visited > MAX_SCHEMA_NODES) return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${pointer}/${i}`, undefined));
      return;
    }
    if (!isObject(node)) return;

    if ("x-mcp-header" in node) {
      found.push({
        pointer,
        path: propertyPath?.join(".") ?? "",
        value: node["x-mcp-header"],
        // Reachable only through a chain of `properties` keys that starts at the root
        // and names at least one property.
        reachable: propertyPath !== undefined && propertyPath.length > 0,
        schema: node,
      });
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "x-mcp-header") continue;
      const childPointer = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (key === "properties" && isObject(child)) {
        for (const [prop, propSchema] of Object.entries(child)) {
          const propPointer = `${childPointer}/${prop.replace(/~/g, "~0").replace(/\//g, "~1")}`;
          walk(propSchema, propPointer, propertyPath ? [...propertyPath, prop] : undefined);
        }
      } else {
        // items, anyOf/oneOf/allOf/not, if/then/else, $defs, $ref targets… all break reachability.
        walk(child, childPointer, undefined);
      }
    }
  };

  walk(inputSchema, "", []);
  return found;
}

/** The primitive JSON type an annotated schema allows, or a reason it cannot carry a header. */
function primitiveType(schema: JsonObject): { ok: true; type: string } | { ok: false; reason: string } {
  const t = schema["type"];
  const types = Array.isArray(t) ? t.filter((x) => x !== "null") : t === undefined ? [] : [t];
  if (types.length === 1 && typeof types[0] === "string") {
    const only = types[0];
    if (only === "string" || only === "integer" || only === "boolean") return { ok: true, type: only };
    if (only === "number") return { ok: false, reason: 'type "number" is not permitted; use "integer"' };
    return { ok: false, reason: `type "${only}" is not a primitive (string, integer or boolean)` };
  }
  if (types.length > 1) return { ok: false, reason: `allows several types (${types.join(", ")})` };
  // No `type`: accept an enum/const whose values are all one permitted primitive.
  const values = Array.isArray(schema["enum"]) ? schema["enum"] : "const" in schema ? [schema["const"]] : undefined;
  if (values && values.length > 0) {
    const kinds = new Set(
      values.map((v) =>
        typeof v === "string" ? "string" : typeof v === "boolean" ? "boolean" : Number.isInteger(v) ? "integer" : "other",
      ),
    );
    if (kinds.size === 1 && !kinds.has("other")) return { ok: true, type: [...kinds][0] as string };
  }
  return { ok: false, reason: "has no primitive `type` (string, integer or boolean)" };
}

/**
 * Check one tool's `x-mcp-header` annotations against tools › x-mcp-header. A tool with any
 * problem is excluded from `tools/list` by conforming Streamable HTTP clients.
 */
export function validateXMcpHeaders(inputSchema: unknown): XMcpHeaderProblem[] {
  const problems: XMcpHeaderProblem[] = [];
  const seen = new Map<string, string>();
  for (const a of findXMcpHeaders(inputSchema)) {
    const header = typeof a.value === "string" ? a.value : JSON.stringify(a.value) ?? String(a.value);
    const push = (reason: string) => problems.push({ pointer: a.pointer || "/", path: a.path, header, reason });

    if (typeof a.value !== "string") {
      push("value is not a string");
      continue;
    }
    if (a.value.length === 0) {
      push("value is empty");
      continue;
    }
    if (/[\x00-\x1F\x7F]/.test(a.value)) push("contains control characters");
    else if (!isHeaderToken(a.value)) push("is not an HTTP field-name token (RFC 9110 1*tchar)");
    if (!a.reachable) {
      push("is not statically reachable: only a chain of `properties` keys may lead to it");
    }
    const t = primitiveType(a.schema);
    if (!t.ok) push(t.reason);

    const key = a.value.toLowerCase();
    const prior = seen.get(key);
    if (prior !== undefined) push(`duplicates the header name used at ${prior} (names are compared case-insensitively)`);
    else seen.set(key, a.pointer || "/");
  }
  return problems;
}

const SENSITIVE = /(pass(word|wd|phrase)?|secret|token|api[_-]?key|apikey|auth|credential|private[_-]?key|session|cookie|ssn|social[_-]?security|credit[_-]?card|card[_-]?number|cvv|email|phone)/i;

/** Annotated parameters whose names suggest secrets or PII (spec SHOULD NOT; Akamai's warning). */
export function sensitiveXMcpHeaders(inputSchema: unknown): XMcpHeaderAnnotation[] {
  return findXMcpHeaders(inputSchema).filter((a) => {
    const last = a.path.split(".").pop() ?? "";
    return SENSITIVE.test(last) || (typeof a.value === "string" && SENSITIVE.test(a.value));
  });
}
