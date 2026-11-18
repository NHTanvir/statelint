import { type FlagSpec } from "../util/args.js";
import { type CliIO } from "./shared.js";
export declare const SERVE_FLAGS: Record<string, FlagSpec>;
export declare const SERVE_HELP: string;
export interface ServeHandle {
    url: string;
    close(): Promise<void>;
}
export declare function startServe(argv: string[], io: CliIO): Promise<ServeHandle>;
export declare function serveCommand(argv: string[], io: CliIO): Promise<number>;
