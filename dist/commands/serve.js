/** `statelint serve`: run the bundled reference server (optionally broken) over real HTTP. */
import { FAULTS, isFaultId } from "../fixtures/faults.js";
import { serveFetchHandler } from "../fixtures/node-adapter.js";
import { createReferenceServer } from "../fixtures/reference-server.js";
import { flagBool, flagInt, flagString, parseArgs, UsageError } from "../util/args.js";
import { EXIT } from "./shared.js";
export const SERVE_FLAGS = {
    port: { value: true, alias: "p" },
    host: { value: true },
    path: { value: true },
    fault: { value: true },
    sse: {},
    quiet: { alias: "q" },
};
export const SERVE_HELP = `Usage: statelint serve [options]

Run Statelint's reference server: a stateless MCP 2026-07-28 server (three demo tools, one
resource, one prompt) that passes every rule, or breaks exactly one with --fault.

Options:
  -p, --port <n>      Port (default 3000; 0 picks a free one)
      --host <addr>   Interface to bind (default 127.0.0.1)
      --path <path>   Endpoint path (default /mcp)
      --sse           Answer with SSE streams instead of JSON
      --fault <id>    Break one rule on purpose; see the list below
  -q, --quiet         Print only the URL

Faults:
${FAULTS.map((f) => `  ${f.id.padEnd(32)} ${f.rule}: ${f.summary}`).join("\n")}`;
export async function startServe(argv, io) {
    const args = parseArgs(argv, SERVE_FLAGS);
    const fault = flagString(args, "fault");
    if (fault !== undefined && !isFaultId(fault))
        throw new UsageError(`unknown fault "${fault}"; run \`statelint serve --help\` for the list`);
    const info = fault ? FAULTS.find((f) => f.id === fault) : undefined;
    const sse = flagBool(args, "sse") || info?.base === "sse";
    const server = createReferenceServer({ ...(fault ? { fault } : {}), sse });
    const path = flagString(args, "path") ?? "/mcp";
    if (!path.startsWith("/"))
        throw new UsageError("--path must start with /");
    const handle = await serveFetchHandler(server.fetch, {
        port: flagInt(args, "port", 3000, 0),
        host: flagString(args, "host") ?? "127.0.0.1",
        path,
    });
    if (flagBool(args, "quiet"))
        io.out(handle.url);
    else {
        io.out(`Statelint reference server (${server.name}) listening on ${handle.url}`);
        if (info)
            io.out(`Fault: ${info.id} breaks ${info.rule}: ${info.summary}`);
        io.out(`Check it: statelint check ${handle.url}`);
    }
    return {
        url: handle.url,
        close: async () => {
            server.close();
            await handle.close();
        },
    };
}
export async function serveCommand(argv, io) {
    const handle = await startServe(argv, io);
    await new Promise((resolve) => {
        const stop = () => resolve();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    });
    await handle.close();
    return EXIT.ok;
}
