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
export declare const WEIGHT: Readonly<Record<Level, number>>;
/** The highest score a server with a failed or blocked MUST rule can get. */
export declare const NON_CONFORMANT_CAP = 89;
export declare function credit(level: Level, status: Status): number;
export declare function computeScore(results: ReadonlyArray<{
    level: Level;
    status: Status;
}>): number;
