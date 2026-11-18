/**
 * An incremental Server-Sent Events parser (WHATWG HTML "event stream interpretation"):
 * lines end in LF, CRLF or CR; `:` starts a comment; a blank line dispatches the event.
 */
export interface SseEvent {
    event: string;
    data: string;
    /** The last `id:` field seen for this event, if any. */
    id?: string;
}
export declare class SseParser {
    private buffer;
    private data;
    private eventType;
    private eventId;
    /** Comment lines seen (keep-alives). */
    comments: number;
    /** `id:` fields seen. SSE event ids exist for resumability, which 2026-07-28 removed. */
    idFields: number;
    push(chunk: string): SseEvent[];
    /** Flush at end of stream. An event without a terminating blank line is discarded, per spec. */
    end(): SseEvent[];
    private line;
}
/** Serialize one SSE event (used by the reference server). */
export declare function formatSseEvent(data: string, opts?: {
    event?: string;
    id?: string;
}): string;
