/**
 * Streamable HTTP header rules from 2026-07-28 (SEP-2243): the Base64 sentinel for
 * `Mcp-Name` / `Mcp-Param-{Name}` values, and the constraints on `x-mcp-header`.
 */
import { type JsonObject } from "./jsonrpc.js";
/**
 * A value is "plain" when it can travel as-is: visible ASCII with inner spaces or tabs,
 * no leading or trailing whitespace, and not itself shaped like the sentinel.
 */
export declare function isPlainHeaderValue(value: string): boolean;
/** Encode a value the way a conforming client must (streamable-http › Value Encoding). */
export declare function encodeHeaderValue(value: string): string;
export interface DecodedHeader {
    value: string;
    /** True when the value used the `=?base64?…?=` sentinel. */
    encoded: boolean;
}
/** Decode a header value; plain values pass through unchanged. */
export declare function decodeHeaderValue(raw: string): DecodedHeader;
/** RFC 9110 field values: visible ASCII, space and tab only. */
export declare function hasInvalidHeaderChars(raw: string): boolean;
export declare function isHeaderToken(name: string): boolean;
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
/** Find every `x-mcp-header` in a schema and whether it is statically reachable. */
export declare function findXMcpHeaders(inputSchema: unknown): XMcpHeaderAnnotation[];
/**
 * Check one tool's `x-mcp-header` annotations against tools › x-mcp-header. A tool with any
 * problem is excluded from `tools/list` by conforming Streamable HTTP clients.
 */
export declare function validateXMcpHeaders(inputSchema: unknown): XMcpHeaderProblem[];
/** Annotated parameters whose names suggest secrets or PII (spec SHOULD NOT; Akamai's warning). */
export declare function sensitiveXMcpHeaders(inputSchema: unknown): XMcpHeaderAnnotation[];
