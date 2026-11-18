/**
 * Deliberate faults for the bundled reference server. Each one breaks exactly one
 * conformance rule, so `statelint demo` and the tests can show what each failure looks like.
 */
export declare const FAULT_IDS: readonly ["requires-initialize", "no-discover", "mints-session-id", "rejects-unknown-session", "get-opens-stream", "delete-accepted", "initialize-silent", "version-header-optional", "version-header-unchecked", "method-header-optional", "method-header-unchecked", "method-header-case-insensitive", "name-header-optional", "name-header-unchecked", "name-header-no-base64", "draft-error-code", "x-mcp-header-on-number", "x-mcp-header-secret", "unsupported-version-no-list", "meta-optional", "unknown-method-200", "error-id-null", "legacy-not-found-code", "no-result-type", "no-cache-hints", "no-server-info", "unstable-tools-order", "wrong-content-type", "sse-duplicate-response", "sse-server-request", "sse-unrequested-log", "sse-stays-open", "sse-buffered", "listen-no-ack", "accepts-any-origin"];
export type FaultId = (typeof FAULT_IDS)[number];
export interface FaultInfo {
    id: FaultId;
    /** The single rule this fault makes fail (or warn, for SHOULD rules). */
    rule: string;
    /** Whether the fault sits on the JSON-response server or the SSE-response server. */
    base: "json" | "sse";
    /** What the broken server does, in one line. */
    summary: string;
}
export declare const FAULTS: readonly FaultInfo[];
export declare function faultInfo(id: string): FaultInfo | undefined;
export declare function isFaultId(id: string): id is FaultId;
