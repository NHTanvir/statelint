import { type JsonObject } from "../protocol/jsonrpc.js";
import type { ProbeRequest, ProbeResponse } from "./http.js";
export declare const PROBE: {
    readonly discover: "discover";
    readonly toolsList1: "tools-list-1";
    readonly toolsList2: "tools-list-2";
    readonly promptsList: "prompts-list";
    readonly resourcesList: "resources-list";
    readonly templatesList: "resources-templates-list";
    readonly sessionId: "session-id";
    readonly get: "get";
    readonly delete: "delete";
    readonly noVersionHeader: "no-version-header";
    readonly versionMismatch: "version-mismatch";
    readonly unsupportedVersion: "unsupported-version";
    readonly noMethodHeader: "no-method-header";
    readonly methodMismatch: "method-mismatch";
    readonly methodCase: "method-case";
    readonly metaMissingCapabilities: "meta-missing-capabilities";
    readonly unknownMethod: "unknown-method";
    readonly noNameHeader: "no-name-header";
    readonly nameControl: "name-control";
    readonly nameMismatchTools: "name-mismatch-tools";
    readonly nameMismatchPrompts: "name-mismatch-prompts";
    readonly nameMismatchResources: "name-mismatch-resources";
    readonly nameBase64: "name-base64";
    readonly resourceMissing: "resource-missing";
    readonly initialize: "initialize";
    readonly initializeCleanup: "initialize-cleanup";
    readonly origin: "origin";
    readonly listen: "listen";
    readonly progress: "progress";
};
/** Probes whose rejection must use -32020 (header validation). */
export declare const HEADER_PROBES: readonly ["no-version-header", "version-mismatch", "no-method-header", "method-mismatch", "method-case", "no-name-header", "name-mismatch-tools", "name-mismatch-prompts", "name-mismatch-resources"];
/** Probes that speak the legacy protocol on purpose; they are excluded from modern-only rules. */
export declare const LEGACY_PROBES: readonly string[];
export declare const PROBE_ORIGIN = "https://statelint-probe.invalid";
export declare const PROBE_SESSION_ID = "statelint-probe-not-a-session";
export declare const UNSUPPORTED_VERSION = "1999-01-01";
export declare const UNKNOWN_METHOD = "statelint/probe-unknown-method";
export declare const PROBE_NAMES: {
    readonly noHeader: "statelint_probe_no_header";
    readonly control: "statelint_probe_control";
    readonly headerValue: "statelint_probe_header_value";
    readonly bodyValue: "statelint_probe_body_value";
    readonly unicode: "statelint_probe_ünïcode_✓";
};
export declare const PROBE_URIS: {
    readonly noHeader: "statelint://probe/no-header";
    readonly control: "statelint://probe/control";
    readonly headerValue: "statelint://probe/header-value";
    readonly bodyValue: "statelint://probe/body-value";
    readonly unicode: "statelint://probe/ünïcode-✓";
    readonly missing: "statelint://probe/does-not-exist";
};
export type NamedMethod = "tools/call" | "prompts/get" | "resources/read";
export interface Capabilities {
    source: "discover" | "inferred" | "none";
    tools: boolean;
    prompts: boolean;
    resources: boolean;
    toolsListChanged: boolean;
    promptsListChanged: boolean;
    resourcesListChanged: boolean;
    resourcesSubscribe: boolean;
}
export interface Baseline {
    ok: boolean;
    /** The method that first succeeded without any handshake. */
    method?: string;
    probe?: string;
    authRequired?: boolean;
    unreachable?: boolean;
}
export interface CheckContext {
    url: string;
    probes: Record<string, ProbeResponse>;
    order: string[];
    baseline: Baseline;
    discover?: JsonObject;
    capabilities: Capabilities;
    tools: JsonObject[];
    /** The named method used for the Mcp-Name probes. */
    named?: NamedMethod;
    closeGraceMs: number;
}
export interface PlanOptions {
    url: string;
    userHeaders: Record<string, string>;
    send: (probe: ProbeRequest) => Promise<ProbeResponse>;
    closeGraceMs: number;
    /** Called after each probe, for progress output. */
    onProbe?: (p: ProbeResponse) => void;
}
export declare function envelope(version?: string, opts?: {
    capabilities?: boolean;
    extra?: JsonObject;
}): JsonObject;
/** Merge headers case-insensitively; later sources win; `undefined` removes a header. */
export declare function mergeHeaders(...sources: Array<Record<string, string | undefined>>): Record<string, string>;
export declare function runProbes(opts: PlanOptions): Promise<CheckContext>;
