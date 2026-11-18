/** What every command needs from its environment; tests pass a fake. */
import { colorWanted, palette } from "../util/color.js";
export function processIO() {
    return {
        out: (t) => process.stdout.write(t.endsWith("\n") ? t : `${t}\n`),
        err: (t) => process.stderr.write(t.endsWith("\n") ? t : `${t}\n`),
        colorCapable: colorWanted(process.stdout),
    };
}
export function paletteFor(io, colorFlag) {
    return palette(colorFlag === false ? false : colorFlag === true ? true : io.colorCapable);
}
export const EXIT = { ok: 0, findings: 1, usage: 2 };
