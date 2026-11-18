/**
 * A small argument parser: `--flag value`, `--flag=value`, boolean flags,
 * repeated flags, and `--no-<flag>`. No dependency, predictable errors.
 */
export class UsageError extends Error {
    name = "UsageError";
}
export function parseArgs(argv, spec) {
    const aliases = new Map();
    for (const [name, s] of Object.entries(spec))
        if (s.alias)
            aliases.set(s.alias, name);
    const flags = new Map();
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--") {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        if (!arg.startsWith("-") || arg === "-") {
            positionals.push(arg);
            continue;
        }
        let name;
        let inline;
        if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
            inline = eq === -1 ? undefined : arg.slice(eq + 1);
        }
        else {
            const short = arg.slice(1);
            const full = aliases.get(short);
            if (!full)
                throw new UsageError(`unknown option -${short}`);
            name = full;
        }
        if (name.startsWith("no-") && spec[name.slice(3)] && !spec[name.slice(3)]?.value) {
            flags.set(name.slice(3), false);
            continue;
        }
        const s = spec[name];
        if (!s)
            throw new UsageError(`unknown option --${name}`);
        if (!s.value) {
            if (inline !== undefined)
                throw new UsageError(`--${name} does not take a value`);
            flags.set(name, true);
            continue;
        }
        let value = inline;
        if (value === undefined) {
            const next = argv[i + 1];
            if (next === undefined || (next.startsWith("--") && next.length > 2)) {
                throw new UsageError(`--${name} needs a value`);
            }
            value = next;
            i++;
        }
        const prev = flags.get(name);
        if (s.repeat && Array.isArray(prev))
            prev.push(value);
        else
            flags.set(name, [value]);
    }
    return { positionals, flags };
}
export function flagString(args, name) {
    const v = args.flags.get(name);
    return Array.isArray(v) ? v[v.length - 1] : undefined;
}
export function flagList(args, name) {
    const v = args.flags.get(name);
    return Array.isArray(v) ? v : [];
}
export function flagBool(args, name, fallback = false) {
    const v = args.flags.get(name);
    return typeof v === "boolean" ? v : fallback;
}
export function flagInt(args, name, fallback, min = 0) {
    const raw = flagString(args, name);
    if (raw === undefined)
        return fallback;
    const n = parseDuration(raw);
    if (n === undefined || n < min)
        throw new UsageError(`--${name} must be a number of at least ${min}, got "${raw}"`);
    return n;
}
/** "1500", "1500ms", "2s", "1m" -> milliseconds. Plain integers stay as they are. */
export function parseDuration(raw) {
    const m = /^(\d+)(ms|s|m)?$/.exec(raw.trim());
    if (!m)
        return undefined;
    const n = Number(m[1]);
    switch (m[2]) {
        case "s":
            return n * 1000;
        case "m":
            return n * 60_000;
        default:
            return n;
    }
}
/** Parse repeated `--header "Name: value"` flags. */
export function parseHeaders(values) {
    const out = {};
    for (const v of values) {
        const idx = v.indexOf(":");
        if (idx <= 0)
            throw new UsageError(`--header must look like "Name: value", got "${v}"`);
        const name = v.slice(0, idx).trim();
        const value = v.slice(idx + 1).trim();
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name))
            throw new UsageError(`invalid header name "${name}"`);
        out[name] = value;
    }
    return out;
}
