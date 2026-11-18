/**
 * The 0-100 conformance score.
 *
 * MUST rules are worth 3 points and SHOULD rules 1. A rule earns all of its points when it
 * passes and half when a MUST rule only partly passes (a warning); it earns nothing when it
 * fails, when a SHOULD rule warns, or when it is blocked. Skipped rules do not count.
 *
 * A failed or blocked MUST rule caps the score at 89, so 90 and above always means
 * "conformant" and the number can gate CI on its own (`--min-score 90`).
 */
import type { Level, Status } from "./rules.js";

export const WEIGHT: Readonly<Record<Level, number>> = { must: 3, should: 1 };

/** The highest score a server with a failed or blocked MUST rule can get. */
export const NON_CONFORMANT_CAP = 89;

export function credit(level: Level, status: Status): number {
  if (status === "pass") return 1;
  if (status === "warn") return level === "must" ? 0.5 : 0;
  return 0;
}

export function computeScore(results: ReadonlyArray<{ level: Level; status: Status }>): number {
  let possible = 0;
  let earned = 0;
  let mustBroken = false;
  for (const r of results) {
    if (r.status === "skip") continue;
    possible += WEIGHT[r.level];
    earned += WEIGHT[r.level] * credit(r.level, r.status);
    if (r.level === "must" && (r.status === "fail" || r.status === "blocked")) mustBroken = true;
  }
  if (possible === 0) return 0;
  const score = Math.round((100 * earned) / possible);
  return mustBroken ? Math.min(score, NON_CONFORMANT_CAP) : score;
}
