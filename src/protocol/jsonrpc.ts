/** JSON-RPC 2.0 shapes and guards, as MCP uses them. */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type RequestId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: RequestId;
  method: string;
  params?: JsonObject;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: JsonObject;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: RequestId | null;
  result?: JsonObject;
  error?: JsonRpcErrorObject;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A response carries `result` or `error` and no `method`. */
export function isResponse(v: unknown): v is JsonRpcResponse {
  return isObject(v) && !("method" in v) && ("result" in v || "error" in v);
}

/** A request has a method and an id. */
export function isRequest(v: unknown): v is JsonRpcRequest {
  return isObject(v) && typeof v["method"] === "string" && "id" in v && v["id"] !== null;
}

/** A notification has a method and no id. */
export function isNotification(v: unknown): v is JsonRpcNotification {
  return isObject(v) && typeof v["method"] === "string" && !("id" in v);
}

export function errorOf(v: unknown): JsonRpcErrorObject | undefined {
  if (!isResponse(v) || !isObject(v.error)) return undefined;
  const e = v.error as unknown as { code?: unknown; message?: unknown; data?: JsonValue };
  if (typeof e.code !== "number") return undefined;
  return { code: e.code, message: typeof e.message === "string" ? e.message : "", data: e.data };
}

export function resultOf(v: unknown): JsonObject | undefined {
  return isResponse(v) && isObject(v.result) ? v.result : undefined;
}

/** Parse JSON without throwing. */
export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
