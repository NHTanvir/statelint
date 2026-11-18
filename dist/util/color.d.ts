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
export declare function palette(enabled: boolean): Palette;
export declare function colorWanted(stream: {
    isTTY?: boolean;
}, forceOff?: boolean): boolean;
/** Visible width of a string that may hold ANSI codes. */
export declare function visibleLength(s: string): number;
export declare function padEnd(s: string, width: number): string;
