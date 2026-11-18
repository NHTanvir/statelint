export const WEIGHT = { must: 3, should: 1 };
/** The highest score a server with a failed or blocked MUST rule can get. */
export const NON_CONFORMANT_CAP = 89;
export function credit(level, status) {
    if (status === "pass")
        return 1;
    if (status === "warn")
        return level === "must" ? 0.5 : 0;
    return 0;
}
export function computeScore(results) {
    let possible = 0;
    let earned = 0;
    let mustBroken = false;
    for (const r of results) {
        if (r.status === "skip")
            continue;
        possible += WEIGHT[r.level];
        earned += WEIGHT[r.level] * credit(r.level, r.status);
        if (r.level === "must" && (r.status === "fail" || r.status === "blocked"))
            mustBroken = true;
    }
    if (possible === 0)
        return 0;
    const score = Math.round((100 * earned) / possible);
    return mustBroken ? Math.min(score, NON_CONFORMANT_CAP) : score;
}
