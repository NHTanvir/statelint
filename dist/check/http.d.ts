/**
 * The probe client: send one HTTP request and record exactly what came back, reading a JSON
 * body or an SSE stream with strict time limits (a long-lived stream never hangs the check).
 */
import { type JsonObject, type JsonRpcResponse } from "../protocol/jsonrpc.js";
export type SseMode = "full" | "first-event" | "headers-only";
export interface ProbeRequest {
    /** Stable probe name; also the suffix of the JSON-RPC id. */
    name: string;
    httpMethod: "POST" | "GET" | "DELETE";
    headers: Record<string, string>;
    body?: JsonObject;
    /** How much of an SSE response to read. Defaults to "full". */
    sse?: SseMode;
}
export interface SseInfo {
    /** Data events received. */
    events: number;
    /** `id:` fields seen (resumability leftovers). */
    idFields: number;
    /** Events whose data was not JSON. */
    parseErrors: number;
    /** JSON-RPC responses on the stream that answer this request. */
    matchingResponses: number;
    /** True when the stream ended by itself; false when Statelint had to stop reading. */
    ended: boolean;
    /** Whether the stream ended within the grace period after the final response. */
    closedAfterResponse?: boolean;
}
export interface ProbeResponse {
    name: string;
    request: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: JsonObject;
    };
    /** Network failure or timeout before any response; status is 0 then. */
    networkError?: string;
    timedOut: boolean;
    status: number;
    /** Response headers, lower-cased names. */
    headers: Record<string, string>;
    /** Media type of Content-Type, lower-cased, without parameters. */
    mediaType: string;
    transport: "json" | "sse" | "empty" | "other" | "none";
    /** Body text (JSON transport) or the raw stream text read, truncated. */
    bodyText: string;
    /** Every JSON value parsed from the body or from SSE data events. */
    messages: unknown[];
    /** The JSON-RPC response that answers this request, when one arrived. */
    response?: JsonRpcResponse;
    sse?: SseInfo;
    durationMs: number;
}
export interface SendOptions {
    fetch: typeof fetch;
    timeoutMs: number;
    /** How long to wait for an SSE stream to end after its final response. */
    closeGraceMs: number;
    /** How long to wait for the first event in "first-event" mode. */
    firstEventMs: number;
}
export declare function sendProbe(url: string, probe: ProbeRequest, opts: SendOptions): Promise<ProbeResponse>;
/** A one-line description of what a probe got back, for messages and evidence. */
export declare function describeResponse(p: ProbeResponse): string;
export declare function truncate(s: string, n: number): string;
