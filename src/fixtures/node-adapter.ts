/** Serve a web-standard fetch handler over node:http (used by `statelint serve`). */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { FetchHandler } from "./reference-server.js";

function readBody(req: IncomingMessage): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const all = Buffer.concat(chunks);
      resolve(all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer);
    });
    req.on("error", reject);
  });
}

async function bridge(handler: FetchHandler, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  const host = req.headers.host ?? "127.0.0.1";
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  const request = new Request(`http://${host}${req.url ?? "/"}`, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    signal: controller.signal,
  });

  const response = await handler(request);
  const outHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    outHeaders[key] = value;
  });
  res.writeHead(response.status, outHeaders);
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  res.on("close", () => {
    reader.cancel().catch(() => undefined);
  });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    // The client went away; nothing left to do.
  }
  res.end();
}

export interface ServeOptions {
  port?: number;
  host?: string;
  /** Path the MCP endpoint lives on. Requests to other paths get 404. */
  path?: string;
}

export async function serveFetchHandler(
  handler: FetchHandler,
  options: ServeOptions = {},
): Promise<{ server: Server; url: string; close(): Promise<void> }> {
  const path = options.path ?? "/mcp";
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== path) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Not found. The MCP endpoint is ${path}\n`);
      return;
    }
    bridge(handler, req, res).catch((err) => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String((err as Error).message ?? err));
    });
  });
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const shownHost = host.includes(":") ? `[${host}]` : host;
  return {
    server,
    url: `http://${shownHost}:${address.port}${path}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** A fetch function that serves requests in-process: the URL is never dialed. */
export function inProcessFetch(handler: FetchHandler): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
}
