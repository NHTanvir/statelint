/** Render a migration report as terminal text. */
import type { Palette } from "../util/color.js";
import type { MigrationReport } from "./index.js";
export interface MigrateTextOptions {
    diff?: boolean;
    /** Cap per severity group; 0 = no cap. */
    limit?: number;
}
export declare function renderMigrationText(r: MigrationReport, c: Palette, opts?: MigrateTextOptions): string;
