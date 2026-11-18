/** JSON-RPC 2.0 shapes and guards, as MCP uses them. */
export function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** A response carries `result` or `error` and no `method`. */
export function isResponse(v) {
    return isObject(v) && !("method" in v) && ("result" in v || "error" in v);
}
/** A request has a method and an id. */
export function isRequest(v) {
    return isObject(v) && typeof v["method"] === "string" && "id" in v && v["id"] !== null;
}
/** A notification has a method and no id. */
export function isNotification(v) {
    return isObject(v) && typeof v["method"] === "string" && !("id" in v);
}
export function errorOf(v) {
    if (!isResponse(v) || !isObject(v.error))
        return undefined;
    const e = v.error;
    if (typeof e.code !== "number")
        return undefined;
    return { code: e.code, message: typeof e.message === "string" ? e.message : "", data: e.data };
}
export function resultOf(v) {
    return isResponse(v) && isObject(v.result) ? v.result : undefined;
}
/** Parse JSON without throwing. */
export function tryParseJson(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
