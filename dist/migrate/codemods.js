/**
 * Codemods that move a TypeScript SDK server to the stateless 2026-07-28 entry points.
 * Each one proves its preconditions on the token stream and refuses, with a reason, when it
 * cannot. A refusal is a normal outcome: the report then prints the manual steps instead.
 */
import { maskComments } from "./lexer.js";
import { isJsLike } from "./scan.js";
import { applyEdits, findDeclaration, findMemberCalls, identUses, isIdent, isPunct, parse, parseImports, rangeText, splitArgs, startsStatement, statementEnd, statementSpan, stringValue, tidyBlankLines, } from "./source.js";
export const CODEMODS = [
    { id: "http-entry", title: "Rewrite an Express Streamable HTTP route to createMcpHandler + toNodeHandler" },
    { id: "stdio-entry", title: "Replace server.connect(new StdioServerTransport()) with serveStdio(factory)" },
    { id: "error-codes", title: "Renumber retired and draft error codes (-32002 → -32602, -32001/-32003/-32004 → -32020/-32021/-32022)" },
];
const refused = (codemod, file, reason) => ({ codemod, file, status: "refused", reason, notes: [] });
const skip = (codemod, file) => ({ codemod, file, status: "not-applicable", notes: [] });
const V2_NODE = "@modelcontextprotocol/node";
const V2_SERVER = "@modelcontextprotocol/server";
const V2_STDIO = "@modelcontextprotocol/server/stdio";
function indentOf(text, offset) {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}
function tokText(p, from, to) {
    return p.text.slice(p.tokens[from].start, p.tokens[to].end);
}
function within(idx, spans) {
    return spans.some((s) => idx >= s.from && idx <= s.to);
}
/** The block body `{…}` of a function value starting at token `from` (arrow or function expression). */
function functionBody(p, from, to) {
    const t = p.tokens;
    let i = from;
    if (isIdent(t[i], "async"))
        i++;
    if (isIdent(t[i], "function")) {
        i++;
        if (isIdent(t[i]))
            i++;
    }
    let params = [];
    if (isPunct(t[i], "(")) {
        const close = p.pairs.get(i);
        if (close === undefined)
            return undefined;
        params = splitArgs(p, i).map((r) => t[r.from].value);
        i = close + 1;
        // TypeScript return type annotation `): Promise<void> =>`
        if (isPunct(t[i], ":")) {
            while (i <= to && !isPunct(t[i], "=>") && !isPunct(t[i], "{"))
                i++;
        }
    }
    else if (isIdent(t[i])) {
        params = [t[i].value];
        i++;
    }
    else
        return undefined;
    if (isPunct(t[i], "=>"))
        i++;
    if (!isPunct(t[i], "{"))
        return undefined;
    const close = p.pairs.get(i);
    if (close === undefined || close > to)
        return undefined;
    return { params, open: i, close };
}
/** Split the statements of a block `{ … }` (token indexes, inclusive). */
function blockStatements(p, open) {
    const close = p.pairs.get(open);
    const t = p.tokens;
    const out = [];
    let i = open + 1;
    const skipBlockOrStatement = (k) => {
        if (isPunct(t[k], "{"))
            return p.pairs.get(k);
        return simpleEnd(k);
    };
    const simpleEnd = (k) => {
        let j = k;
        for (; j < close; j++) {
            const partner = p.pairs.get(j);
            if (partner !== undefined && partner > j) {
                j = partner;
                if (j + 1 < close && t[j + 1].line > t[j].line && startsStatement(p, j + 1))
                    return j;
                continue;
            }
            if (isPunct(t[j], ";"))
                return j;
            if (j + 1 < close && t[j + 1].line > t[j].line && startsStatement(p, j + 1))
                return j;
        }
        return close - 1;
    };
    while (i < close) {
        const start = i;
        const tok = t[i];
        if (isPunct(tok, ";")) {
            i++;
            continue;
        }
        let end;
        if (isIdent(tok, "if")) {
            end = p.pairs.get(i + 1) + 1;
            end = skipBlockOrStatement(end);
            while (isIdent(t[end + 1], "else")) {
                let k = end + 2;
                if (isIdent(t[k], "if"))
                    k = p.pairs.get(k + 1) + 1;
                end = skipBlockOrStatement(k);
            }
        }
        else if (isIdent(tok, "try")) {
            end = p.pairs.get(i + 1);
            if (isIdent(t[end + 1], "catch")) {
                let k = end + 2;
                if (isPunct(t[k], "("))
                    k = p.pairs.get(k) + 1;
                end = p.pairs.get(k);
            }
            if (isIdent(t[end + 1], "finally"))
                end = p.pairs.get(end + 2);
        }
        else if (isPunct(tok, "{")) {
            end = p.pairs.get(i);
        }
        else {
            end = simpleEnd(i);
        }
        out.push({ from: start, to: end });
        i = end + 1;
    }
    return out;
}
/**
 * Prove a handler body is only transport/session hosting boilerplate. Anything else would be
 * silently dropped by the rewrite, so it is reported and the codemod refuses.
 */
function checkBoilerplate(p, open, b) {
    const t = p.tokens;
    const refs = (s) => {
        for (let k = s.from; k <= s.to; k++) {
            const tok = t[k];
            if (tok.type === "ident" && b.names.has(tok.value) && !isPunct(t[k - 1], "."))
                return true;
            if (tok.type === "string" && /mcp-session-id/i.test(tok.value))
                return true;
        }
        return false;
    };
    for (const s of blockStatements(p, open)) {
        const first = t[s.from];
        const line = first.line + 1;
        const show = () => tokText(p, s.from, Math.min(s.to, s.from + 12)).replace(/\s+/g, " ").slice(0, 70);
        if (isIdent(first, "if")) {
            const condClose = p.pairs.get(s.from + 1);
            const cond = { from: s.from + 1, to: condClose };
            const condText = tokText(p, cond.from, cond.to);
            if (!refs(cond) && !new RegExp(`\\b${b.res}\\.headersSent\\b`).test(condText)) {
                b.problems.push(`line ${line}: \`${show()}\` is not session/transport handling`);
                continue;
            }
            // Check every branch block.
            for (let k = condClose + 1; k <= s.to; k++) {
                if (isPunct(t[k], "{")) {
                    checkBoilerplate(p, k, b);
                    k = p.pairs.get(k);
                }
                else if (isIdent(t[k], "else") || isIdent(t[k], "if")) {
                    if (isIdent(t[k], "if"))
                        k = p.pairs.get(k + 1);
                }
                else {
                    // Single-statement branch: accept return / res.* only.
                    if (!(isIdent(t[k], "return") || isIdent(t[k], b.res)))
                        b.problems.push(`line ${t[k].line + 1}: unexpected statement in an if branch`);
                    while (k < s.to && !isPunct(t[k], ";"))
                        k++;
                }
            }
            continue;
        }
        if (isIdent(first, "try")) {
            for (let k = s.from + 1; k <= s.to; k++) {
                if (isPunct(t[k], "{")) {
                    checkBoilerplate(p, k, b);
                    k = p.pairs.get(k);
                }
                else if (isPunct(t[k], "(")) {
                    k = p.pairs.get(k);
                }
            }
            continue;
        }
        if (isIdent(first, "const") || isIdent(first, "let") || isIdent(first, "var")) {
            const name = t[s.from + 1];
            if (refs(s)) {
                if (name.type === "ident")
                    b.names.add(name.value);
                continue;
            }
            b.problems.push(`line ${line}: \`${show()}\` declares something unrelated to the transport`);
            continue;
        }
        if (isIdent(first, "return"))
            continue;
        if (isIdent(first, "await") && refs(s))
            continue;
        if (isIdent(first, "delete") && refs(s))
            continue;
        if (first.type === "ident" && (b.names.has(first.value) || first.value === b.res || first.value === "console"))
            continue;
        b.problems.push(`line ${line}: \`${show()}\` is not session/transport handling`);
    }
}
function importOf(imports, local) {
    return imports.find((d) => d.named.some((s) => s.local === local) || d.defaultName === local || d.namespace === local);
}
/**
 * Edits that remove the named specifiers from imports (or whole import statements when they
 * become empty), and add new ones.
 */
function importEdits(p, imports, remove, add) {
    const edits = [];
    const pending = [...add];
    for (const d of imports) {
        const keep = d.named.filter((s) => !remove.has(s.local));
        const extra = pending.filter((a) => a.source === d.source && !d.typeOnly && d.braceOpen !== undefined);
        for (const e of extra)
            pending.splice(pending.indexOf(e), 1);
        const changed = keep.length !== d.named.length || extra.length > 0;
        if (!changed)
            continue;
        const names = [...keep.map((s) => tokText(p, s.from, s.to)), ...extra.filter((e) => !keep.some((k) => k.local === e.name)).map((e) => e.name)];
        const span = statementSpan(p, d.firstIdx, d.lastIdx);
        if (names.length === 0 && !d.defaultName && !d.namespace) {
            edits.push({ start: span.start, end: span.end, text: "" });
            continue;
        }
        const open = p.tokens[d.braceOpen];
        const close = p.tokens[d.braceClose];
        if (names.length === 0) {
            // `import x, { a } from` → `import x from`
            const comma = p.tokens[d.braceOpen - 1];
            edits.push({ start: isPunct(comma, ",") ? comma.start : open.start, end: close.end, text: "" });
        }
        else {
            edits.push({ start: open.start, end: close.end, text: `{ ${names.join(", ")} }` });
        }
    }
    if (pending.length > 0) {
        const last = imports[imports.length - 1];
        const at = last ? statementSpan(p, last.firstIdx, last.lastIdx).end : 0;
        const quote = last && p.text[p.tokens[last.lastIdx].start] === '"' ? '"' : "'";
        const lines = pending.map((a) => `import { ${a.name} } from ${quote}${a.source}${quote};\n`).join("");
        edits.push({ start: at, end: at, text: lines });
    }
    return edits;
}
function uniqueName(p, base) {
    let name = base;
    let n = 2;
    while (identUses(p, name).length > 0 || p.tokens.some((t) => t.type === "ident" && t.value === name))
        name = `${base}${n++}`;
    return name;
}
/** Find `<factory>()` used to build the server inside a handler body, and the server variable. */
function findFactory(p, body, transportVars) {
    const t = p.tokens;
    for (let i = body.open; i < body.close; i++) {
        // `<server>.connect(<transport>)`
        if (isPunct(t[i], ".") && isIdent(t[i + 1], "connect") && isPunct(t[i + 2], "(")) {
            const argClose = p.pairs.get(i + 2);
            const arg = tokText(p, i + 3, argClose - 1);
            if (!transportVars.has(arg.trim()))
                continue;
            const before = t[i - 1];
            if (isPunct(before, ")")) {
                // `factory().connect(transport)`
                const open = p.pairs.get(i - 1);
                if (open !== i - 2 || !isIdent(t[i - 3]))
                    return { problem: "the server is built with arguments; pass request data through createMcpHandler's factory context instead" };
                return { call: `${t[i - 3].value}()`, name: t[i - 3].value };
            }
            if (!isIdent(before))
                return { problem: "could not tell where the server instance comes from" };
            const serverVar = before.value;
            const decl = findDeclaration(p, serverVar, { from: body.open, to: body.close });
            if (!decl || decl.initIdx === undefined) {
                return { problem: `\`${serverVar}\` is a shared instance declared outside the request handler; createMcpHandler needs a factory that builds a fresh McpServer per request (wrap the construction in \`function buildServer() { … return server; }\`)` };
            }
            let k = decl.initIdx;
            if (isIdent(t[k], "await"))
                k++;
            if (isIdent(t[k]) && isPunct(t[k + 1], "(") && p.pairs.get(k + 1) === k + 2) {
                return { call: `${t[k].value}()`, name: t[k].value };
            }
            if (isIdent(t[k], "new")) {
                return { problem: `the server is constructed inline in the handler (\`new ${t[k + 1]?.value}(…)\`); move the construction and registrations into a factory function, then re-run` };
            }
            return { problem: "the server is built with arguments; pass request data through createMcpHandler's factory context instead" };
        }
    }
    return { problem: "no `server.connect(transport)` found in the handler" };
}
/** The http-entry codemod (Express / Node-style route handlers). */
export function httpEntry(file, project) {
    const id = "http-entry";
    if (!isJsLike(file.path))
        return skip(id, file.path);
    const masked = maskComments(file.text);
    if (!/StreamableHTTPServerTransport/.test(masked))
        return skip(id, file.path);
    const p = parse(file.text);
    if (!p)
        return refused(id, file.path, "the file could not be tokenized safely");
    const t = p.tokens;
    const imports = parseImports(p);
    const transportImport = imports.find((d) => d.named.some((s) => s.imported === "NodeStreamableHTTPServerTransport" || s.imported === "StreamableHTTPServerTransport"));
    if (!transportImport)
        return refused(id, file.path, "the Streamable HTTP transport is not imported by name in this file");
    if (transportImport.source.startsWith("@modelcontextprotocol/sdk")) {
        return refused(id, file.path, "this file is still on the v1 SDK; run `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` first, then re-run statelint migrate");
    }
    if (transportImport.source !== V2_NODE)
        return refused(id, file.path, `the transport comes from ${transportImport.source}, not ${V2_NODE}`);
    const transportLocal = transportImport.named.find((s) => /StreamableHTTPServerTransport$/.test(s.imported))?.local;
    if (project.files.some((f) => isJsLike(f.path) && /\b(?:extra|ctx)\s*\.\s*sessionId\b/.test(maskComments(f.text)))) {
        return refused(id, file.path, "tools read ctx.sessionId (or extra.sessionId); replace that per-session state with explicit handles first, or the rewrite would break them");
    }
    // The POST route that hosts the transport.
    const routes = findMemberCalls(p, new Set(["post", "get", "delete", "all"])).filter((c) => c.args.length >= 2 && stringValue(t[c.args[0].from]) !== undefined && c.args[0].from === c.args[0].to && startsStatement(p, c.objIdx));
    const resolve = (c) => {
        const h = c.args[c.args.length - 1];
        if (h.from === h.to && isIdent(t[h.from])) {
            const decl = findDeclaration(p, t[h.from].value);
            const start = decl ? (decl.kind === "function" ? decl.nameIdx - 1 : decl.initIdx) : undefined;
            if (!decl || start === undefined)
                return undefined;
            const body = functionBody(p, start, decl.lastIdx);
            return body ? { call: c, body, decl } : undefined;
        }
        const body = functionBody(p, h.from, h.to);
        return body ? { call: c, body } : undefined;
    };
    const hasNewTransport = (b) => {
        for (let i = b.open; i < b.close; i++)
            if (isIdent(t[i], "new") && isIdent(t[i + 1], transportLocal))
                return true;
        return false;
    };
    const posts = routes.filter((c) => c.method === "post").map(resolve).filter((r) => !!r && hasNewTransport(r.body));
    if (posts.length === 0)
        return refused(id, file.path, `no app.post(path, handler) route that builds a ${transportLocal} was found (only Express-style routes are rewritten)`);
    if (posts.length > 1)
        return refused(id, file.path, "more than one route builds the transport; rewrite them by hand");
    const post = posts[0];
    const pathArg = post.call.args[0];
    const pathValue = stringValue(t[pathArg.from]);
    const middleware = post.call.args.slice(1, -1).map((r) => rangeText(p, r));
    const [reqName = "req", resName = "res"] = post.body.params;
    // Transport options.
    let jsonMode = false;
    let dnsRebinding = false;
    let eventStore = false;
    const transportVars = new Set();
    for (let i = post.body.open; i < post.body.close; i++) {
        if (!(isIdent(t[i], "new") && isIdent(t[i + 1], transportLocal) && isPunct(t[i + 2], "(")))
            continue;
        // `transport = new …`, `const transport = new …` or `const transport: T = new …`
        if (isPunct(t[i - 1], "=")) {
            let declared;
            for (let j = i - 2; j >= Math.max(post.body.open, i - 24); j--) {
                if (isPunct(t[j], ";") || isPunct(t[j], "{") || isPunct(t[j], "}"))
                    break;
                if ((isIdent(t[j], "const") || isIdent(t[j], "let") || isIdent(t[j], "var")) && isIdent(t[j + 1])) {
                    declared = t[j + 1].value;
                    break;
                }
            }
            const name = declared ?? (isIdent(t[i - 2]) && !isPunct(t[i - 3], ":") ? t[i - 2].value : undefined);
            if (name)
                transportVars.add(name);
        }
        const args = splitArgs(p, i + 2);
        const opts = args[0];
        if (opts && isPunct(t[opts.from], "{")) {
            for (const prop of splitArgs(p, opts.from)) {
                const key = t[prop.from].value;
                const value = tokText(p, prop.from, prop.to);
                if (key === "sessionIdGenerator" || key === "onsessioninitialized" || key === "onsessionclosed" || key === "retryInterval")
                    continue;
                if (key === "enableJsonResponse")
                    jsonMode = /:\s*true\b/.test(value);
                else if (key === "eventStore")
                    eventStore = true;
                else if (key === "enableDnsRebindingProtection" || key === "allowedHosts" || key === "allowedOrigins")
                    dnsRebinding = true;
                else
                    return refused(id, file.path, `the transport has an option statelint does not know how to carry over: \`${key}\``);
            }
        }
    }
    if (transportVars.size === 0)
        return refused(id, file.path, "could not find the variable that holds the transport");
    const factory = findFactory(p, post.body, transportVars);
    if ("problem" in factory)
        return refused(id, file.path, factory.problem);
    // handleRequest(req, res[, body]): carry the body argument over.
    let bodyArg;
    let sawHandle = false;
    for (let i = post.body.open; i < post.body.close; i++) {
        if (!(isPunct(t[i], ".") && isIdent(t[i + 1], "handleRequest") && isPunct(t[i + 2], "(")))
            continue;
        sawHandle = true;
        const args = splitArgs(p, i + 2).map((r) => rangeText(p, r).trim());
        if (args[0] !== reqName || args[1] !== resName)
            return refused(id, file.path, "handleRequest is not called with the route's own (req, res)");
        if (args[2] !== undefined) {
            if (args[2] !== `${reqName}.body`)
                return refused(id, file.path, `handleRequest receives a custom body (\`${args[2]}\`)`);
            bodyArg = "req.body";
        }
    }
    if (!sawHandle)
        return refused(id, file.path, "no transport.handleRequest(req, res) call in the route");
    // The session map, if any: a module-level `{}` or `new Map()` the handler indexes.
    let mapVar;
    let mapDecl;
    for (let i = post.body.open; i < post.body.close; i++) {
        const tok = t[i];
        if (tok.type !== "ident" || isPunct(t[i - 1], "."))
            continue;
        if (!(isPunct(t[i + 1], "[") || (isPunct(t[i + 1], ".") && /^(get|set|has|delete)$/.test(t[i + 2]?.value ?? ""))))
            continue;
        const decl = findDeclaration(p, tok.value);
        if (!decl || decl.initIdx === undefined || decl.firstIdx > post.body.open && decl.firstIdx < post.body.close)
            continue;
        const init = t[decl.initIdx];
        if (isPunct(init, "{") || (isIdent(init, "new") && isIdent(t[decl.initIdx + 1], "Map"))) {
            mapVar = tok.value;
            mapDecl = decl;
            break;
        }
    }
    const b = {
        names: new Set([transportLocal, ...transportVars, factory.name, ...(mapVar ? [mapVar] : []), "isInitializeRequest", "randomUUID"]),
        res: resName,
        problems: [],
    };
    checkBoilerplate(p, post.body.open, b);
    if (b.problems.length > 0) {
        return refused(id, file.path, `the ${pathValue} handler does more than host the transport (${b.problems.slice(0, 2).join("; ")}); move that logic into middleware or your tools, then re-run`);
    }
    // Everything that goes away: the POST route, GET/DELETE routes for the same path, the map,
    // and named handlers only those routes use.
    const removedRoutes = [post.call];
    const removable = (r) => {
        const text = p.text.slice(t[r.body.open].start, t[r.body.close].end);
        return (mapVar !== undefined && new RegExp(`\\b${mapVar}\\b`).test(text)) || /handleRequest\s*\(|\b405\b|method not allowed/i.test(text);
    };
    const resolvedOthers = [];
    for (const c of routes) {
        if (c === post.call || (c.method !== "get" && c.method !== "delete") || stringValue(t[c.args[0].from]) !== pathValue)
            continue;
        const r = resolve(c);
        if (!r || !removable(r))
            return refused(id, file.path, `${c.method.toUpperCase()} ${pathValue} does something other than serve sessions; remove or move it by hand`);
        removedRoutes.push(c);
        resolvedOthers.push(r);
    }
    const spans = removedRoutes.map((c) => ({ from: c.objIdx, to: statementEnd(p, c.closeIdx) }));
    if (mapDecl)
        spans.push({ from: mapDecl.firstIdx, to: statementEnd(p, mapDecl.lastIdx) });
    for (const r of [post, ...resolvedOthers]) {
        if (!r.decl)
            continue;
        const name = t[r.decl.nameIdx].value;
        const declSpan = { from: r.decl.firstIdx, to: statementEnd(p, r.decl.lastIdx) };
        const uses = identUses(p, name).filter((u) => !within(u, [declSpan]));
        if (uses.every((u) => within(u, spans)) && !spans.some((s) => s.from === declSpan.from))
            spans.push(declSpan);
    }
    if (mapVar) {
        const stray = identUses(p, mapVar).filter((u) => !within(u, spans));
        if (stray.length > 0) {
            return refused(id, file.path, `\`${mapVar}\` is also used on line ${t[stray[0]].line + 1}, outside the routes being replaced`);
        }
    }
    // Build the edits.
    const postSpan = statementSpan(p, post.call.objIdx, statementEnd(p, post.call.closeIdx));
    const indent = indentOf(p.text, t[post.call.objIdx].start);
    const handlerName = uniqueName(p, "mcpHandler");
    const nodeName = uniqueName(p, "mcpNodeHandler");
    const lines = [
        `// MCP 2026-07-28 (stateless): a fresh server from the factory answers every request.`,
        `// createMcpHandler also serves 2025-11-25 clients statelessly, and answers GET and DELETE with 405.`,
    ];
    if (dnsRebinding) {
        lines.push(`// TODO(statelint): the old transport validated Host/Origin (DNS-rebinding protection); createMcpHandler does not.`, `// Mount localhostHostValidation() and localhostOriginValidation() from @modelcontextprotocol/node in front, or use createMcpExpressApp().`);
    }
    lines.push(`const ${handlerName} = createMcpHandler(() => ${factory.call}${jsonMode ? ", { responseMode: 'json' }" : ""});`, `const ${nodeName} = toNodeHandler(${handlerName});`, `${post.call.obj}.all(${rangeText(p, pathArg)}, ${middleware.length ? `${middleware.join(", ")}, ` : ""}(req, res) => void ${nodeName}(req, res${bodyArg ? `, ${bodyArg}` : ""}));`);
    const replacement = `${lines.map((l) => indent + l).join("\n")}\n`;
    const edits = [{ start: postSpan.start, end: postSpan.end, text: replacement }];
    for (const s of spans.slice(1)) {
        const span = statementSpan(p, s.from, s.to);
        edits.push({ start: span.start, end: span.end, text: "" });
    }
    // Imports: drop what is no longer used, add createMcpHandler and toNodeHandler.
    const allSpans = spans;
    const unused = new Set();
    for (const name of [transportLocal, "isInitializeRequest", "randomUUID"]) {
        const decl = importOf(imports, name);
        if (!decl)
            continue;
        const importSpan = { from: decl.firstIdx, to: decl.lastIdx };
        const remaining = identUses(p, name).filter((u) => !within(u, allSpans) && !within(u, [importSpan]));
        if (remaining.length === 0)
            unused.add(name);
    }
    const have = (name) => imports.some((d) => d.named.some((s) => s.local === name));
    const additions = [
        ...(have("createMcpHandler") ? [] : [{ name: "createMcpHandler", source: V2_SERVER }]),
        ...(have("toNodeHandler") ? [] : [{ name: "toNodeHandler", source: V2_NODE }]),
    ];
    edits.push(...importEdits(p, imports, unused, additions));
    let out;
    try {
        out = tidyBlankLines(applyEdits(p.text, edits));
    }
    catch (err) {
        return refused(id, file.path, `internal safety check failed (${err.message})`);
    }
    if (!parse(out))
        return refused(id, file.path, "internal safety check failed: the rewritten file would not tokenize");
    const notes = [
        `Replaced ${removedRoutes.map((c) => `${c.method.toUpperCase()} ${pathValue}`).join(", ")} with ${post.call.obj}.all(${JSON.stringify(pathValue)}) over createMcpHandler(() => ${factory.call}).`,
    ];
    if (mapVar)
        notes.push(`Removed the session map \`${mapVar}\`.`);
    if (jsonMode)
        notes.push("Kept JSON responses: enableJsonResponse became { responseMode: 'json' }.");
    if (eventStore)
        notes.push("Dropped the eventStore: 2026-07-28 has no SSE resumability.");
    if (dnsRebinding)
        notes.push("Host/Origin validation must be re-added in front of the handler (TODO comment inserted).");
    const missing = [V2_SERVER, V2_NODE].filter((pkg) => !(pkg in project.ts.v2));
    if (missing.length > 0)
        notes.push(`Install: npm install ${missing.join(" ")}`);
    return { codemod: id, file: file.path, status: "rewritten", reason: notes[0], notes, newText: out };
}
/** Replace `server.connect(new StdioServerTransport())` with `serveStdio(() => factory())`. */
export function stdioEntry(file, project) {
    const id = "stdio-entry";
    if (!isJsLike(file.path))
        return skip(id, file.path);
    if (!/StdioServerTransport/.test(maskComments(file.text)))
        return skip(id, file.path);
    const p = parse(file.text);
    if (!p)
        return refused(id, file.path, "the file could not be tokenized safely");
    const t = p.tokens;
    const imports = parseImports(p);
    const tImport = imports.find((d) => d.named.some((s) => s.imported === "StdioServerTransport"));
    if (!tImport)
        return refused(id, file.path, "StdioServerTransport is not imported by name in this file");
    if (tImport.source.startsWith("@modelcontextprotocol/sdk")) {
        return refused(id, file.path, "this file is still on the v1 SDK; run `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` first");
    }
    const local = tImport.named.find((s) => s.imported === "StdioServerTransport")?.local;
    // Find `<server>.connect(<transport>)` where <transport> is `new Stdio…()` or a variable holding one.
    for (let i = 0; i < t.length; i++) {
        if (!(isPunct(t[i], ".") && isIdent(t[i + 1], "connect") && isPunct(t[i + 2], "(")))
            continue;
        const argClose = p.pairs.get(i + 2);
        let transportDecl;
        const argIsNew = isIdent(t[i + 3], "new") && isIdent(t[i + 4], local);
        if (!argIsNew) {
            if (!(argClose === i + 4 && isIdent(t[i + 3])))
                continue;
            transportDecl = findDeclaration(p, t[i + 3].value);
            if (!transportDecl || transportDecl.initIdx === undefined || !(isIdent(t[transportDecl.initIdx], "new") && isIdent(t[transportDecl.initIdx + 1], local)))
                continue;
        }
        // Statement start: optional `await`.
        let stmtStart = i - 1;
        let factoryCall;
        let serverDecl;
        if (isPunct(t[stmtStart], ")")) {
            const open = p.pairs.get(stmtStart);
            if (open !== stmtStart - 1 || !isIdent(t[open - 1]))
                return refused(id, file.path, "the server is built with arguments; wrap it in a zero-argument factory first");
            factoryCall = `${t[open - 1].value}()`;
            stmtStart = open - 1;
        }
        else if (isIdent(t[stmtStart])) {
            const serverVar = t[stmtStart].value;
            serverDecl = findDeclaration(p, serverVar);
            let k = serverDecl?.initIdx;
            if (k !== undefined && isIdent(t[k], "await"))
                k++;
            if (!serverDecl || k === undefined)
                return refused(id, file.path, `could not find where \`${serverVar}\` is created`);
            if (isIdent(t[k], "new")) {
                return refused(id, file.path, `\`${serverVar}\` is a module-level \`new ${t[k + 1]?.value}(…)\`; wrap its construction and registrations in \`function buildServer() { … return ${serverVar}; }\`, then use serveStdio(buildServer)`);
            }
            if (!(isIdent(t[k]) && isPunct(t[k + 1], "(") && p.pairs.get(k + 1) === k + 2))
                return refused(id, file.path, "the server is built with arguments; wrap it in a zero-argument factory first");
            factoryCall = `${t[k].value}()`;
            const otherUses = identUses(p, serverVar).filter((u) => u !== stmtStart && u !== serverDecl.nameIdx);
            if (otherUses.length > 0)
                return refused(id, file.path, `\`${serverVar}\` is used elsewhere (line ${t[otherUses[0]].line + 1}); serveStdio builds its own instance`);
        }
        else
            continue;
        if (isIdent(t[stmtStart - 1], "await"))
            stmtStart--;
        if (!startsStatement(p, stmtStart))
            return refused(id, file.path, "server.connect(…) is part of a larger expression");
        const stmtSpan = statementSpan(p, stmtStart, statementEnd(p, argClose));
        const indent = indentOf(p.text, t[stmtStart].start);
        const edits = [{ start: stmtSpan.start, end: stmtSpan.end, text: `${indent}serveStdio(() => ${factoryCall});\n` }];
        if (serverDecl) {
            const s = statementSpan(p, serverDecl.firstIdx, statementEnd(p, serverDecl.lastIdx));
            edits.push({ start: s.start, end: s.end, text: "" });
        }
        if (transportDecl) {
            const s = statementSpan(p, transportDecl.firstIdx, statementEnd(p, transportDecl.lastIdx));
            edits.push({ start: s.start, end: s.end, text: "" });
        }
        const removedSpans = [{ from: stmtStart, to: argClose }, ...(transportDecl ? [{ from: transportDecl.firstIdx, to: transportDecl.lastIdx }] : [])];
        const remaining = identUses(p, local).filter((u) => !within(u, removedSpans) && !within(u, [{ from: tImport.firstIdx, to: tImport.lastIdx }]));
        const have = imports.some((d) => d.named.some((s) => s.local === "serveStdio"));
        edits.push(...importEdits(p, imports, remaining.length === 0 ? new Set([local]) : new Set(), have ? [] : [{ name: "serveStdio", source: V2_STDIO }]));
        let out;
        try {
            out = tidyBlankLines(applyEdits(p.text, edits));
        }
        catch (err) {
            return refused(id, file.path, `internal safety check failed (${err.message})`);
        }
        if (!parse(out))
            return refused(id, file.path, "internal safety check failed: the rewritten file would not tokenize");
        return {
            codemod: id,
            file: file.path,
            status: "rewritten",
            reason: `Replaced the StdioServerTransport wiring with serveStdio(() => ${factoryCall}).`,
            notes: [`Replaced the StdioServerTransport wiring with serveStdio(() => ${factoryCall}); it serves 2026-07-28 and 2025-era clients on the same connection.`],
            newText: out,
        };
    }
    return skip(id, file.path);
}
/** Renumber retired and draft error codes where the line clearly constructs or names an error. */
export function errorCodes(file) {
    const id = "error-codes";
    if (!isJsLike(file.path))
        return skip(id, file.path);
    const masked = maskComments(file.text);
    const edits = [];
    const notes = [];
    const lines = masked.split("\n");
    let offset = 0;
    lines.forEach((line, n) => {
        const draft = /HeaderMismatch|MissingRequiredClientCapability|UnsupportedProtocolVersion/i.test(line);
        const errorContext = /\bcode\b|Error\s*\(|ErrorCode|reject|throw|NOT_FOUND|NotFound/i.test(line);
        const re = /(?<![\w.])-\s?(32002|32001|32003|32004)\b/g;
        let m;
        while ((m = re.exec(line)) !== null) {
            const code = m[1];
            let to;
            if (code === "32002" && errorContext)
                to = "-32602";
            if (draft && code === "32001")
                to = "-32020";
            if (draft && code === "32003")
                to = "-32021";
            if (draft && code === "32004")
                to = "-32022";
            if (!to)
                continue;
            edits.push({ start: offset + m.index, end: offset + m.index + m[0].length, text: to });
            notes.push(`line ${n + 1}: -${code} → ${to}`);
        }
        offset += line.length + 1;
    });
    if (edits.length === 0)
        return skip(id, file.path);
    return { codemod: id, file: file.path, status: "rewritten", reason: notes.join("; "), notes, newText: applyEdits(file.text, edits) };
}
/** Run every codemod over every file, chaining their output per file. */
export function runCodemods(project) {
    const outcomes = [];
    for (const original of project.files) {
        if (!isJsLike(original.path))
            continue;
        let current = original;
        for (const fn of [httpEntry, stdioEntry, errorCodes]) {
            const o = fn(current, project);
            if (o.status === "not-applicable")
                continue;
            outcomes.push(o);
            if (o.status === "rewritten" && o.newText !== undefined)
                current = { path: original.path, text: o.newText };
        }
    }
    return outcomes;
}
