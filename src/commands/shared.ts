/** What every command needs from its environment; tests pass a fake. */
import { colorWanted, palette, type Palette } from "../util/color.js";

export interface CliIO {
  out(text: string): void;
  err(text: string): void;
  /** Whether stdout can show colour (before --no-color is applied). */
  colorCapable: boolean;
  /** Injected fetch (tests and the demo use an in-process one). */
  fetch?: typeof fetch;
}

export function processIO(): CliIO {
  return {
    out: (t) => process.stdout.write(t.endsWith("\n") ? t : `${t}\n`),
    err: (t) => process.stderr.write(t.endsWith("\n") ? t : `${t}\n`),
    colorCapable: colorWanted(process.stdout),
  };
}

export function paletteFor(io: CliIO, colorFlag: boolean | undefined): Palette {
  return palette(colorFlag === false ? false : colorFlag === true ? true : io.colorCapable);
}

export const EXIT = { ok: 0, findings: 1, usage: 2 } as const;
