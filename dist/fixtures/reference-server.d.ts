import type { FaultId } from "./faults.js";
export type FetchHandler = (request: Request) => Promise<Response>;
export interface ReferenceServerOptions {
    /** Break exactly one rule. */
    fault?: FaultId;
    /** Answer requests with SSE response streams instead of single JSON objects. */
    sse?: boolean;
    /** Keep-alive interval for long-lived streams, in milliseconds. */
    keepAliveMs?: number;
}
export interface ReferenceServer {
    fetch: FetchHandler;
    /** End every open stream (listen streams get a graceful result first). */
    close(): void;
    readonly name: string;
}
export declare const SERVER_INFO: {
    readonly name: "statelint-reference";
    readonly version: "0.1.0";
};
export declare const SUPPORTED_VERSIONS: readonly ["2026-07-28"];
export declare function createReferenceServer(options?: ReferenceServerOptions): ReferenceServer;
