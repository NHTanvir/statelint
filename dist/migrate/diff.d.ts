/** Line-based unified diff (Myers' O(ND) algorithm), for `statelint migrate --diff`. */
export declare function diffStats(oldText: string, newText: string): {
    added: number;
    removed: number;
};
/** A unified diff with `context` lines around each change, or "" when the texts are equal. */
export declare function unifiedDiff(oldText: string, newText: string, path: string, context?: number): string;
