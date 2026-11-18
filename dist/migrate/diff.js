/** Line-based unified diff (Myers' O(ND) algorithm), for `statelint migrate --diff`. */
function splitLines(text) {
    if (text === "")
        return [];
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "")
        lines.pop();
    return lines;
}
function myers(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const offset = max + 1;
    let v = new Int32Array(2 * max + 3);
    const trace = [];
    outer: for (let d = 0; d <= max; d++) {
        trace.push(v.slice());
        const next = v.slice();
        for (let k = -d; k <= d; k += 2) {
            let x;
            if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]))
                x = v[offset + k + 1];
            else
                x = v[offset + k - 1] + 1;
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x++;
                y++;
            }
            next[offset + k] = x;
            if (x >= n && y >= m) {
                v = next;
                trace.push(v.slice());
                break outer;
            }
        }
        v = next;
    }
    // Backtrack from (n, m) to (0, 0).
    const ops = [];
    let x = n;
    let y = m;
    for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
        const vd = trace[d];
        const k = x - y;
        let prevK;
        if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]))
            prevK = k + 1;
        else
            prevK = k - 1;
        const prevX = vd[offset + prevK];
        const prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            ops.push({ type: "eq", line: a[x - 1] });
            x--;
            y--;
        }
        if (d === 0)
            break;
        if (x === prevX)
            ops.push({ type: "ins", line: b[prevY] });
        else
            ops.push({ type: "del", line: a[prevX] });
        x = prevX;
        y = prevY;
    }
    while (x > 0 && y > 0) {
        ops.push({ type: "eq", line: a[x - 1] });
        x--;
        y--;
    }
    return ops.reverse();
}
export function diffStats(oldText, newText) {
    let added = 0;
    let removed = 0;
    for (const op of myers(splitLines(oldText), splitLines(newText))) {
        if (op.type === "ins")
            added++;
        else if (op.type === "del")
            removed++;
    }
    return { added, removed };
}
/** A unified diff with `context` lines around each change, or "" when the texts are equal. */
export function unifiedDiff(oldText, newText, path, context = 3) {
    const a = splitLines(oldText);
    const b = splitLines(newText);
    const ops = myers(a, b);
    if (!ops.some((o) => o.type !== "eq"))
        return "";
    // Line numbers for each op.
    const rows = ops.map((op) => ({ ...op, aLine: 0, bLine: 0 }));
    let ai = 1;
    let bi = 1;
    for (const r of rows) {
        r.aLine = ai;
        r.bLine = bi;
        if (r.type !== "ins")
            ai++;
        if (r.type !== "del")
            bi++;
    }
    const out = [`--- a/${path}`, `+++ b/${path}`];
    let i = 0;
    while (i < rows.length) {
        if (rows[i]?.type === "eq") {
            i++;
            continue;
        }
        let start = Math.max(0, i - context);
        let end = i;
        // Extend the hunk while changes are within 2*context lines of each other.
        for (;;) {
            while (end < rows.length && rows[end]?.type !== "eq")
                end++;
            let gap = end;
            while (gap < rows.length && rows[gap]?.type === "eq")
                gap++;
            if (gap < rows.length && gap - end <= 2 * context)
                end = gap;
            else
                break;
        }
        end = Math.min(rows.length, end + context);
        const hunk = rows.slice(start, end);
        const aStart = hunk.find((r) => r.type !== "ins")?.aLine ?? (hunk[0]?.aLine ?? 1);
        const bStart = hunk.find((r) => r.type !== "del")?.bLine ?? (hunk[0]?.bLine ?? 1);
        const aCount = hunk.filter((r) => r.type !== "ins").length;
        const bCount = hunk.filter((r) => r.type !== "del").length;
        out.push(`@@ -${aCount === 0 ? aStart - 1 : aStart},${aCount} +${bCount === 0 ? bStart - 1 : bStart},${bCount} @@`);
        for (const r of hunk)
            out.push(`${r.type === "eq" ? " " : r.type === "del" ? "-" : "+"}${r.line}`);
        i = end;
        start = end;
    }
    return `${out.join("\n")}\n`;
}
