/**
 * The probe plan. Every probe carries the full per-request `_meta` envelope (that is what
 * makes a request "modern" to a dual-era server) and changes only the one thing it tests.
 *
 * Probes are safe by construction: discovery and list methods, plus deliberately invalid
 * requests that name tools, prompts and resources that do not exist. No real tool is ever
 * called and no real resource is read.
 */
import { LEGACY_VERSIONS, META, SPEC_VERSION } from "../protocol/constants.js";
import { encodeHeaderValue } from "../protocol/headers.js";
import { isObject, resultOf, type JsonObject } from "../protocol/jsonrpc.js";
import { VERSION } from "../version.js";
import type { ProbeRequest, ProbeResponse } from "./http.js";

export const PROBE = {
  discover: "discover",
  toolsList1: "tools-list-1",
  toolsList2: "tools-list-2",
  promptsList: "prompts-list",
  resourcesList: "resources-list",
  templatesList: "resources-templates-list",
  sessionId: "session-id",
  get: "get",
  delete: "delete",
  noVersionHeader: "no-version-header",
  versionMismatch: "version-mismatch",
  unsupportedVersion: "unsupported-version",
  noMethodHeader: "no-method-header",
  methodMismatch: "method-mismatch",
  methodCase: "method-case",
  metaMissingCapabilities: "meta-missing-capabilities",
  unknownMethod: "unknown-method",
  noNameHeader: "no-name-header",
  nameControl: "name-control",
  nameMismatchTools: "name-mismatch-tools",
  nameMismatchPrompts: "name-mismatch-prompts",
  nameMismatchResources: "name-mismatch-resources",
  nameBase64: "name-base64",
  resourceMissing: "resource-missing",
  initialize: "initialize",
  initializeCleanup: "initialize-cleanup",
  origin: "origin",
  listen: "listen",
  progress: "progress",
} as const;

/** Probes whose rejection must use -32020 (header validation). */
export const HEADER_PROBES = [
  PROBE.noVersionHeader,
  PROBE.versionMismatch,
  PROBE.noMethodHeader,
  PROBE.methodMismatch,
  PROBE.methodCase,
  PROBE.noNameHeader,
  PROBE.nameMismatchTools,
  PROBE.nameMismatchPrompts,
  PROBE.nameMismatchResources,
] as const;

/** Probes that speak the legacy protocol on purpose; they are excluded from modern-only rules. */
export const LEGACY_PROBES: readonly string[] = [PROBE.initialize, PROBE.initializeCleanup];

export const PROBE_ORIGIN = "https://statelint-probe.invalid";
export const PROBE_SESSION_ID = "statelint-probe-not-a-session";
export const UNSUPPORTED_VERSION = "1999-01-01";
export const UNKNOWN_METHOD = "statelint/probe-unknown-method";
export const PROBE_NAMES = {
  noHeader: "statelint_probe_no_header",
  control: "statelint_probe_control",
  headerValue: "statelint_probe_header_value",
  bodyValue: "statelint_probe_body_value",
  unicode: "statelint_probe_ünïcode_✓",
} as const;
export const PROBE_URIS = {
  noHeader: "statelint://probe/no-header",
  control: "statelint://probe/control",
  headerValue: "statelint://probe/header-value",
  bodyValue: "statelint://probe/body-value",
  unicode: "statelint://probe/ünïcode-✓",
  missing: "statelint://probe/does-not-exist",
} as const;

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

const CLIENT_INFO = { name: "statelint", version: VERSION };

export function envelope(version: string = SPEC_VERSION, opts: { capabilities?: boolean; extra?: JsonObject } = {}): JsonObject {
  const meta: JsonObject = { [META.protocolVersion]: version, [META.clientInfo]: { ...CLIENT_INFO } };
  if (opts.capabilities !== false) meta[META.clientCapabilities] = {};
  return { ...meta, ...(opts.extra ?? {}) };
}

/** Merge headers case-insensitively; later sources win; `undefined` removes a header. */
export function mergeHeaders(...sources: Array<Record<string, string | undefined>>): Record<string, string> {
  const map = new Map<string, [string, string | undefined]>();
  for (const src of sources) for (const [k, v] of Object.entries(src)) map.set(k.toLowerCase(), [k, v]);
  const out: Record<string, string> = {};
  for (const [name, value] of map.values()) if (value !== undefined) out[name] = value;
  return out;
}

/** `meta: null` sends no envelope at all (a legacy request). */
function rpcBody(name: string, method: string, params: JsonObject, meta: JsonObject | null = envelope()): JsonObject {
  return {
    jsonrpc: "2.0",
    id: `statelint-${name}`,
    method,
    params: meta === null ? params : { ...params, _meta: meta },
  };
}

function succeeded(p: ProbeResponse | undefined): boolean {
  return !!p && p.status >= 200 && p.status < 300 && resultOf(p.response) !== undefined;
}

function capabilitiesFrom(result: JsonObject | undefined): Capabilities {
  const caps = isObject(result?.["capabilities"]) ? (result?.["capabilities"] as JsonObject) : undefined;
  const sub = (key: string) => (isObject(caps?.[key]) ? (caps?.[key] as JsonObject) : undefined);
  return {
    source: caps ? "discover" : "none",
    tools: !!sub("tools"),
    prompts: !!sub("prompts"),
    resources: !!sub("resources"),
    toolsListChanged: sub("tools")?.["listChanged"] === true,
    promptsListChanged: sub("prompts")?.["listChanged"] === true,
    resourcesListChanged: sub("resources")?.["listChanged"] === true,
    resourcesSubscribe: sub("resources")?.["subscribe"] === true,
  };
}

export async function runProbes(opts: PlanOptions): Promise<CheckContext> {
  const ctx: CheckContext = {
    url: opts.url,
    probes: {},
    order: [],
    baseline: { ok: false },
    capabilities: capabilitiesFrom(undefined),
    tools: [],
    closeGraceMs: opts.closeGraceMs,
  };

  const post = (method: string, extra: Record<string, string | undefined> = {}) =>
    mergeHeaders(
      opts.userHeaders,
      {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": SPEC_VERSION,
        "Mcp-Method": method,
      },
      extra,
    );

  const run = async (probe: ProbeRequest): Promise<ProbeResponse> => {
    const res = await opts.send(probe);
    ctx.probes[probe.name] = res;
    ctx.order.push(probe.name);
    opts.onProbe?.(res);
    return res;
  };

  const simple = (name: string, method: string, params: JsonObject = {}, extra: Record<string, string | undefined> = {}) =>
    run({ name, httpMethod: "POST", headers: post(method, extra), body: rpcBody(name, method, params) });

  // 1. Baseline: the first modern request, with no handshake and no session.
  const discover = await simple(PROBE.discover, "server/discover");
  if (succeeded(discover)) {
    ctx.baseline = { ok: true, method: "server/discover", probe: PROBE.discover };
    ctx.discover = resultOf(discover.response);
    ctx.capabilities = capabilitiesFrom(ctx.discover);
  } else if (!discover.networkError) {
    // No usable discover: infer capabilities from the list methods that answer.
    const inferred = capabilitiesFrom(undefined);
    const lists: Array<[string, string, keyof Capabilities]> = [
      [PROBE.toolsList1, "tools/list", "tools"],
      [PROBE.promptsList, "prompts/list", "prompts"],
      [PROBE.resourcesList, "resources/list", "resources"],
    ];
    for (const [name, method, key] of lists) {
      const p = await simple(name, method);
      if (succeeded(p)) {
        (inferred[key] as boolean) = true;
        if (!ctx.baseline.ok) ctx.baseline = { ok: true, method, probe: name };
      }
    }
    if (ctx.baseline.ok) ctx.capabilities = { ...inferred, source: "inferred" };
  }

  if (!ctx.baseline.ok) {
    const seen = ctx.order.map((n) => ctx.probes[n] as ProbeResponse);
    ctx.baseline.unreachable = seen.length > 0 && seen.every((p) => !!p.networkError);
    ctx.baseline.authRequired = seen.some((p) => p.status === 401 || p.status === 403);
  }
  if (ctx.baseline.unreachable) return ctx;

  const caps = ctx.capabilities;
  const baseMethod = ctx.baseline.method ?? "server/discover";

  // 2. The read-only lists the server advertises (two tools/list calls, for ordering).
  if (ctx.baseline.ok) {
    if (caps.tools) {
      if (!ctx.probes[PROBE.toolsList1]) await simple(PROBE.toolsList1, "tools/list");
      await simple(PROBE.toolsList2, "tools/list");
      const tools = resultOf(ctx.probes[PROBE.toolsList1]?.response)?.["tools"];
      ctx.tools = Array.isArray(tools) ? tools.filter(isObject) : [];
    }
    if (caps.prompts && !ctx.probes[PROBE.promptsList]) await simple(PROBE.promptsList, "prompts/list");
    if (caps.resources) {
      if (!ctx.probes[PROBE.resourcesList]) await simple(PROBE.resourcesList, "resources/list");
      await simple(PROBE.templatesList, "resources/templates/list");
    }

    // 3. Leftover session handling: an old client's Mcp-Session-Id must be ignored.
    await simple(PROBE.sessionId, baseMethod, {}, { "Mcp-Session-Id": PROBE_SESSION_ID });
  }

  // 4. GET and DELETE on the endpoint (the removed stream and session termination).
  const bare = mergeHeaders(opts.userHeaders, { "MCP-Protocol-Version": SPEC_VERSION });
  await run({ name: PROBE.get, httpMethod: "GET", headers: mergeHeaders(bare, { Accept: "text/event-stream" }), sse: "headers-only" });
  await run({ name: PROBE.delete, httpMethod: "DELETE", headers: bare });

  if (ctx.baseline.ok) {
    // 5. MCP-Protocol-Version: missing, contradicting the body, and unsupported.
    await simple(PROBE.noVersionHeader, baseMethod, {}, { "MCP-Protocol-Version": undefined });
    const legacy = LEGACY_VERSIONS[0];
    await simple(PROBE.versionMismatch, baseMethod, {}, { "MCP-Protocol-Version": legacy });
    await run({
      name: PROBE.unsupportedVersion,
      httpMethod: "POST",
      headers: post(baseMethod, { "MCP-Protocol-Version": UNSUPPORTED_VERSION }),
      body: rpcBody(PROBE.unsupportedVersion, baseMethod, {}, envelope(UNSUPPORTED_VERSION)),
    });

    // 6. Mcp-Method: missing, contradicting the body, and differing only in case.
    await simple(PROBE.noMethodHeader, baseMethod, {}, { "Mcp-Method": undefined });
    const other = baseMethod === "server/discover" ? "tools/list" : "server/discover";
    await simple(PROBE.methodMismatch, baseMethod, {}, { "Mcp-Method": other });
    await simple(PROBE.methodCase, baseMethod, {}, { "Mcp-Method": baseMethod.toUpperCase() });

    // 7. The _meta envelope without the required clientCapabilities.
    await run({
      name: PROBE.metaMissingCapabilities,
      httpMethod: "POST",
      headers: post(baseMethod),
      body: rpcBody(PROBE.metaMissingCapabilities, baseMethod, {}, envelope(SPEC_VERSION, { capabilities: false })),
    });

    // 8. A method no server implements.
    await simple(PROBE.unknownMethod, UNKNOWN_METHOD);

    // 9. Mcp-Name, on a named method the server advertises, always naming things that do not exist.
    const namedKinds: Array<[NamedMethod, boolean, string]> = [
      ["tools/call", caps.tools, PROBE.nameMismatchTools],
      ["prompts/get", caps.prompts, PROBE.nameMismatchPrompts],
      ["resources/read", caps.resources, PROBE.nameMismatchResources],
    ];
    const target = (method: NamedMethod, kind: keyof typeof PROBE_NAMES): JsonObject =>
      method === "resources/read"
        ? { uri: PROBE_URIS[kind] }
        : method === "tools/call"
          ? { name: PROBE_NAMES[kind], arguments: {} }
          : { name: PROBE_NAMES[kind] };
    const value = (method: NamedMethod, kind: keyof typeof PROBE_NAMES): string =>
      method === "resources/read" ? PROBE_URIS[kind] : PROBE_NAMES[kind];

    ctx.named = namedKinds.find(([, on]) => on)?.[0];
    if (ctx.named) {
      const named = ctx.named;
      await simple(PROBE.noNameHeader, named, target(named, "noHeader"));
      await simple(PROBE.nameControl, named, target(named, "control"), { "Mcp-Name": value(named, "control") });
      for (const [method, on, probeName] of namedKinds) {
        if (!on) continue;
        await simple(probeName, method, target(method, "bodyValue"), { "Mcp-Name": value(method, "headerValue") });
      }
      await simple(PROBE.nameBase64, named, target(named, "unicode"), { "Mcp-Name": encodeHeaderValue(value(named, "unicode")) });
    }

    // 10. A resource that does not exist (error code check).
    if (caps.resources) {
      await simple(PROBE.resourceMissing, "resources/read", { uri: PROBE_URIS.missing }, { "Mcp-Name": PROBE_URIS.missing });
    }
  }

  // 11. A 2025-11-25 client's opening request.
  const init = await run({
    name: PROBE.initialize,
    httpMethod: "POST",
    headers: mergeHeaders(opts.userHeaders, { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }),
    body: rpcBody(
      PROBE.initialize,
      "initialize",
      { protocolVersion: LEGACY_VERSIONS[0], capabilities: {}, clientInfo: { ...CLIENT_INFO } },
      null,
    ),
  });
  const minted = init.headers["mcp-session-id"];
  if (minted) {
    // A dual-era or legacy server opened a session for us: close it again.
    await run({
      name: PROBE.initializeCleanup,
      httpMethod: "DELETE",
      headers: mergeHeaders(opts.userHeaders, { "Mcp-Session-Id": minted, "MCP-Protocol-Version": LEGACY_VERSIONS[0] }),
    });
  }

  // 12. A cross-origin request (DNS-rebinding protection).
  await simple(PROBE.origin, baseMethod, {}, { Origin: PROBE_ORIGIN });

  if (ctx.baseline.ok) {
    // 13. subscriptions/listen, the replacement for the GET stream.
    const filter: JsonObject = {};
    if (caps.toolsListChanged) filter["toolsListChanged"] = true;
    if (caps.promptsListChanged) filter["promptsListChanged"] = true;
    if (caps.resourcesListChanged) filter["resourcesListChanged"] = true;
    if (caps.resourcesSubscribe) {
      const resources = resultOf(ctx.probes[PROBE.resourcesList]?.response)?.["resources"];
      const first = Array.isArray(resources) ? resources.find(isObject)?.["uri"] : undefined;
      if (typeof first === "string") filter["resourceSubscriptions"] = [first];
    }
    if (Object.keys(filter).length > 0) {
      await run({
        name: PROBE.listen,
        httpMethod: "POST",
        headers: post("subscriptions/listen"),
        body: rpcBody(PROBE.listen, "subscriptions/listen", { notifications: filter }),
        sse: "first-event",
      });
    }

    // 14. A list request that asks for progress, which invites an SSE response.
    if (caps.tools) {
      await run({
        name: PROBE.progress,
        httpMethod: "POST",
        headers: post("tools/list"),
        body: rpcBody(PROBE.progress, "tools/list", {}, envelope(SPEC_VERSION, { extra: { progressToken: "statelint-progress" } })),
      });
    }
  }

  return ctx;
}
