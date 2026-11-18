/** Render a check report as terminal text or GitHub-flavoured Markdown. */
import { type Palette } from "../util/color.js";
import type { CheckReport } from "./runner.js";
export declare function eraLabel(era: CheckReport["server"]["era"]): string;
export declare function verdictLine(r: CheckReport): string;
export interface TextOptions {
    verbose?: boolean;
}
export declare function renderText(r: CheckReport, c: Palette, opts?: TextOptions): string;
export declare function renderMarkdown(r: CheckReport): string;
