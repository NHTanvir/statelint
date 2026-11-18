/** Serve a web-standard fetch handler over node:http (used by `statelint serve`). */
import { type Server } from "node:http";
import type { FetchHandler } from "./reference-server.js";
export interface ServeOptions {
    port?: number;
    host?: string;
    /** Path the MCP endpoint lives on. Requests to other paths get 404. */
    path?: string;
}
export declare function serveFetchHandler(handler: FetchHandler, options?: ServeOptions): Promise<{
    server: Server;
    url: string;
    close(): Promise<void>;
}>;
/** A fetch function that serves requests in-process: the URL is never dialed. */
export declare function inProcessFetch(handler: FetchHandler): typeof fetch;
