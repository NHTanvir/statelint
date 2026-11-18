/** Read a project from disk (or from memory) into the shape the migration rules work on. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface VirtualFile {
  /** Path relative to the project root, with forward slashes. */
  path: string;
  text: string;
}

export type Language = "typescript" | "javascript" | "python" | "go" | "rust" | "csharp" | "java" | "kotlin";

export interface ProjectInfo {
  root: string;
  files: VirtualFile[];
  languages: Language[];
  /** TypeScript/JavaScript SDK facts from package.json files. */
  ts: {
    /** Version range of the v1 package `@modelcontextprotocol/sdk`, if depended on. */
    sdkV1?: string;
    /** v2 packages depended on, name -> version range. */
    v2: Record<string, string>;
    frameworks: string[];
    manifests: string[];
  };
  python: { mcp?: string; manifests: string[] };
  go: { goSdk?: string; manifests: string[] };
  /** Files skipped because they were too large or unreadable. */
  skipped: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".vercel",
  ".wrangler",
  ".cache",
  "vendor",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  "target",
  "bin",
  "obj",
]);

const EXT_LANG: Record<string, Language> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".cs": "csharp",
  ".java": "java",
  ".kt": "kotlin",
};

const MANIFESTS = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|setup\.cfg|Pipfile|go\.mod)$/;
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 20_000;

export function extensionOf(path: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(path);
  return m ? m[0].toLowerCase() : "";
}

export function languageOf(path: string): Language | undefined {
  if (/\.d\.ts$/.test(path)) return undefined;
  return EXT_LANG[extensionOf(path)];
}

export function isJsLike(path: string): boolean {
  const l = languageOf(path);
  return l === "typescript" || l === "javascript";
}

/** Walk a directory and return source files and manifests, relative to `root`. */
export function readProject(root: string): ProjectInfo {
  const files: VirtualFile[] = [];
  const skipped: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < MAX_FILES) {
    const dir = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      const rel = relative(root, full).split(sep).join("/");
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) stack.push(full);
        continue;
      }
      if (!languageOf(rel) && !MANIFESTS.test(rel)) continue;
      if (st.size > MAX_FILE_BYTES) {
        skipped.push(rel);
        continue;
      }
      try {
        files.push({ path: rel, text: readFileSync(full, "utf8") });
      } catch {
        skipped.push(rel);
      }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const info = analyzeProject(files, root);
  info.skipped = skipped;
  return info;
}

/** Build project facts from files already in memory (tests, the demo). */
export function analyzeProject(files: VirtualFile[], root = "."): ProjectInfo {
  const languages = new Set<Language>();
  for (const f of files) {
    const l = languageOf(f.path);
    if (l) languages.add(l);
  }
  const info: ProjectInfo = {
    root,
    files,
    languages: [...languages].sort(),
    ts: { v2: {}, frameworks: [], manifests: [] },
    python: { manifests: [] },
    go: { manifests: [] },
    skipped: [],
  };
  const frameworks = new Set<string>();
  for (const f of files) {
    const name = f.path.split("/").pop() ?? "";
    if (name === "package.json") {
      info.ts.manifests.push(f.path);
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(f.text) as Record<string, unknown>;
      } catch {
        continue;
      }
      const deps: Record<string, string> = {};
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const d = pkg[key];
        if (d && typeof d === "object") Object.assign(deps, d as Record<string, string>);
      }
      for (const [dep, version] of Object.entries(deps)) {
        if (dep === "@modelcontextprotocol/sdk") info.ts.sdkV1 = String(version);
        else if (/^@modelcontextprotocol\/(server|client|core|node|express|hono|fastify|server-legacy)$/.test(dep)) info.ts.v2[dep] = String(version);
        if (dep === "express" || dep === "hono" || dep === "fastify" || dep === "koa" || dep === "agents") frameworks.add(dep);
      }
    } else if (name === "pyproject.toml" || name === "setup.cfg" || name === "Pipfile" || /^requirements[^/]*\.txt$/.test(name)) {
      info.python.manifests.push(f.path);
      const m = /(?:^|["'\s,=\[])mcp(?:\[[^\]]*\])?\s*([<>=!~^][^"'\n,;#\]]*)?/m.exec(f.text);
      if (m && !info.python.mcp) info.python.mcp = (m[1] ?? "").trim() || "*";
    } else if (name === "go.mod") {
      info.go.manifests.push(f.path);
      const m = /github\.com\/modelcontextprotocol\/go-sdk\s+(v[0-9][^\s]*)/.exec(f.text);
      if (m) info.go.goSdk = m[1];
    }
  }
  info.ts.frameworks = [...frameworks].sort();
  return info;
}
