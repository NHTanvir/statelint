/**
 * An incremental Server-Sent Events parser (WHATWG HTML "event stream interpretation"):
 * lines end in LF, CRLF or CR; `:` starts a comment; a blank line dispatches the event.
 */
export class SseParser {
    buffer = "";
    data = [];
    eventType = "";
    eventId;
    /** Comment lines seen (keep-alives). */
    comments = 0;
    /** `id:` fields seen. SSE event ids exist for resumability, which 2026-07-28 removed. */
    idFields = 0;
    push(chunk) {
        this.buffer += chunk;
        const out = [];
        for (;;) {
            const m = /\r\n|\r|\n/.exec(this.buffer);
            if (!m)
                break;
            // A lone CR at the very end may be the first half of CRLF: wait for more input.
            if (m[0] === "\r" && m.index === this.buffer.length - 1)
                break;
            const line = this.buffer.slice(0, m.index);
            this.buffer = this.buffer.slice(m.index + m[0].length);
            const ev = this.line(line);
            if (ev)
                out.push(ev);
        }
        return out;
    }
    /** Flush at end of stream. An event without a terminating blank line is discarded, per spec. */
    end() {
        if (this.buffer.length > 0) {
            const ev = this.line(this.buffer);
            this.buffer = "";
            if (ev)
                return [ev];
        }
        return [];
    }
    line(line) {
        if (line === "") {
            // WHATWG: an event with an empty data buffer is not dispatched.
            const hasData = this.data.length > 0;
            const ev = { event: this.eventType || "message", data: this.data.join("\n") };
            if (this.eventId !== undefined)
                ev.id = this.eventId;
            this.data = [];
            this.eventType = "";
            this.eventId = undefined;
            return hasData ? ev : undefined;
        }
        if (line.startsWith(":")) {
            this.comments++;
            return undefined;
        }
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        let value = idx === -1 ? "" : line.slice(idx + 1);
        if (value.startsWith(" "))
            value = value.slice(1);
        switch (field) {
            case "data":
                this.data.push(value);
                break;
            case "event":
                this.eventType = value;
                break;
            case "id":
                this.idFields++;
                if (!value.includes("\u0000"))
                    this.eventId = value;
                break;
            default:
                // `retry` and unknown fields are ignored.
                break;
        }
        return undefined;
    }
}
/** Serialize one SSE event (used by the reference server). */
export function formatSseEvent(data, opts = {}) {
    let out = "";
    if (opts.event)
        out += `event: ${opts.event}\n`;
    if (opts.id !== undefined)
        out += `id: ${opts.id}\n`;
    for (const line of data.split("\n"))
        out += `data: ${line}\n`;
    return `${out}\n`;
}
