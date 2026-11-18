/** JSON-RPC 2.0 shapes and guards, as MCP uses them. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = {
    [key: string]: JsonValue;
};
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
export declare function isObject(v: unknown): v is JsonObject;
/** A response carries `result` or `error` and no `method`. */
export declare function isResponse(v: unknown): v is JsonRpcResponse;
/** A request has a method and an id. */
export declare function isRequest(v: unknown): v is JsonRpcRequest;
/** A notification has a method and no id. */
export declare function isNotification(v: unknown): v is JsonRpcNotification;
export declare function errorOf(v: unknown): JsonRpcErrorObject | undefined;
export declare function resultOf(v: unknown): JsonObject | undefined;
/** Parse JSON without throwing. */
export declare function tryParseJson(text: string): {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: string;
};
