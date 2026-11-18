/** What every command needs from its environment; tests pass a fake. */
import { type Palette } from "../util/color.js";
export interface CliIO {
    out(text: string): void;
    err(text: string): void;
    /** Whether stdout can show colour (before --no-color is applied). */
    colorCapable: boolean;
    /** Injected fetch (tests and the demo use an in-process one). */
    fetch?: typeof fetch;
}
export declare function processIO(): CliIO;
export declare function paletteFor(io: CliIO, colorFlag: boolean | undefined): Palette;
export declare const EXIT: {
    readonly ok: 0;
    readonly findings: 1;
    readonly usage: 2;
};
