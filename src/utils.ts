import { pathToFileURL, fileURLToPath } from "node:url";
import * as path from "node:path";

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".rs": "rust",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".lua": "lua",
  ".zig": "zig",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".php": "php",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".json": "json",
  ".jsonc": "jsonc",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".sql": "sql",
  ".md": "markdown",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".dart": "dart",
  ".r": "r",
  ".R": "r",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".cljc": "clojure",
  ".fs": "fsharp",
  ".fsx": "fsharp",
  ".nim": "nim",
  ".pl": "perl",
  ".pm": "perl",
};

export function inferLanguageId(filePath: string): string {
  const ext = path.extname(filePath);
  return EXTENSION_LANGUAGE_MAP[ext] ?? "plaintext";
}

export function log(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  if (args.length > 0) {
    process.stderr.write(`[${timestamp}] ${message} ${args.map(a => JSON.stringify(a)).join(" ")}\n`);
  } else {
    process.stderr.write(`[${timestamp}] ${message}\n`);
  }
}

export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorMsg = error instanceof Error ? error.message : String(error ?? "");
  process.stderr.write(`[${timestamp}] ERROR: ${message}${errorMsg ? ` — ${errorMsg}` : ""}\n`);
}

export function filePathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

export function uriToFilePath(uri: string): string {
  return fileURLToPath(uri);
}

export function toRelativePath(absolutePath: string, rootPath: string): string {
  return path.relative(rootPath, absolutePath);
}

export function toAbsolutePath(relativePath: string, rootPath: string): string {
  return path.resolve(rootPath, relativePath);
}
