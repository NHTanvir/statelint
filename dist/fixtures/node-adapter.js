/** Serve a web-standard fetch handler over node:http (used by `statelint serve`). */
import { createServer } from "node:http";
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const all = Buffer.concat(chunks);
            resolve(all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength));
        });
        req.on("error", reject);
    });
}
async function bridge(handler, req, res) {
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined)
            continue;
        for (const v of Array.isArray(value) ? value : [value])
            headers.append(key, v);
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
    const outHeaders = {};
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
            if (done)
                break;
            res.write(value);
        }
    }
    catch {
        // The client went away; nothing left to do.
    }
    res.end();
}
export async function serveFetchHandler(handler, options = {}) {
    const path = options.path ?? "/mcp";
    const server = createServer((req, res) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (pathname !== path) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end(`Not found. The MCP endpoint is ${path}\n`);
            return;
        }
        bridge(handler, req, res).catch((err) => {
            if (!res.headersSent)
                res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(String(err.message ?? err));
        });
    });
    const host = options.host ?? "127.0.0.1";
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, host, () => resolve());
    });
    const address = server.address();
    const shownHost = host.includes(":") ? `[${host}]` : host;
    return {
        server,
        url: `http://${shownHost}:${address.port}${path}`,
        close: () => new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(() => resolve());
        }),
    };
}
/** A fetch function that serves requests in-process: the URL is never dialed. */
export function inProcessFetch(handler) {
    return (async (input, init) => handler(new Request(input, init)));
}
