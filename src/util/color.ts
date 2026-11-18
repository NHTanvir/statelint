/** ANSI colour that switches itself off for NO_COLOR, --no-color and non-TTY output. */

export interface Palette {
  enabled: boolean;
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  blue(s: string): string;
  magenta(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
}

function wrap(enabled: boolean, open: number, close: number) {
  return (s: string) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);
}

export function palette(enabled: boolean): Palette {
  return {
    enabled,
    bold: wrap(enabled, 1, 22),
    dim: wrap(enabled, 2, 22),
    red: wrap(enabled, 31, 39),
    green: wrap(enabled, 32, 39),
    yellow: wrap(enabled, 33, 39),
    blue: wrap(enabled, 34, 39),
    magenta: wrap(enabled, 35, 39),
    cyan: wrap(enabled, 36, 39),
    gray: wrap(enabled, 90, 39),
  };
}

export function colorWanted(stream: { isTTY?: boolean }, forceOff = false): boolean {
  if (forceOff) return false;
  if (process.env["NO_COLOR"] !== undefined && process.env["NO_COLOR"] !== "") return false;
  if (process.env["FORCE_COLOR"] && process.env["FORCE_COLOR"] !== "0") return true;
  return Boolean(stream.isTTY);
}

/** Visible width of a string that may hold ANSI codes. */
export function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

export function padEnd(s: string, width: number): string {
  const pad = width - visibleLength(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}
