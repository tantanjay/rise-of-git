/**
 * Counts the "meaningful" changed lines in a unified diff, so XP and streaks reward real work.
 * A changed line does not count when it is:
 *   - blank or whitespace-only,
 *   - a comment (by file type: // # -- <!-- and block-comment lines),
 *   - in a lockfile, minified/source-map file, build output or vendored dependency,
 *   - a pure reformat / re-indent / move: removed and added lines that match once whitespace is
 *     ignored cancel out, and a file whose code is identical without whitespace counts zero.
 */

const IGNORED_FILE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|go\.sum|packages\.lock\.json|mix\.lock)$|\.min\.(js|css)$|\.map$|(^|\/)(node_modules|vendor|dist|build|obj|bin|__pycache__|\.next|coverage)\//i;

const SLASH = ["//", "/*", "*/", "*"];
const HASH = ["#"];
const DASH = ["--"];
const XML = ["<!--", "-->"];

/** Comment prefixes per file extension; files not listed get no comment detection */
const COMMENTS: Record<string, string[]> = {
  ...Object.fromEntries(
    ["js", "jsx", "ts", "tsx", "mjs", "cjs", "java", "c", "h", "cpp", "hpp", "cc", "cs", "go", "rs", "kt", "kts", "swift", "dart", "scala", "groovy", "gradle", "css", "scss", "less", "m", "mm"].map((e) => [e, SLASH])
  ),
  php: [...SLASH, ...HASH],
  ...Object.fromEntries(["py", "rb", "sh", "bash", "zsh", "ps1", "yml", "yaml", "toml", "conf", "cfg", "r", "pl", "pm", "tf", "env", "properties", "dockerfile", "makefile", "mk", "cmake"].map((e) => [e, HASH])),
  ini: [...HASH, ";"],
  ...Object.fromEntries(["sql", "lua", "hs"].map((e) => [e, DASH])),
  ...Object.fromEntries(["html", "htm", "xml", "xaml", "svg", "csproj"].map((e) => [e, XML])),
  ...Object.fromEntries(["vue", "svelte"].map((e) => [e, [...XML, ...SLASH]]))
};

function commentPrefixes(path: string): string[] {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile" || name === "makefile") return HASH;
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return COMMENTS[ext] ?? [];
}

interface FileChanges {
  path: string;
  added: string[]; // raw content without the leading +/-
  removed: string[];
}

function parseDiff(diff: string): FileChanges[] {
  const files: FileChanges[] = [];
  let file: FileChanges | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(line);
      file = { path: m ? m[1] : "", added: [], removed: [] };
      files.push(file);
      inHeader = true; // ---/+++ lines belong to the header until the first hunk
      continue;
    }
    if (!file) continue;
    if (line.startsWith("@@")) {
      inHeader = false;
      continue;
    }
    if (inHeader) continue;
    if (line.startsWith("+")) file.added.push(line.slice(1));
    else if (line.startsWith("-")) file.removed.push(line.slice(1));
  }
  return files;
}

/** Number of meaningful changed lines (added + removed) in a unified diff */
export function meaningfulLines(diff: string): number {
  let total = 0;
  for (const f of parseDiff(diff)) {
    if (IGNORED_FILE.test(f.path)) continue;
    const prefixes = commentPrefixes(f.path);
    const code = (lines: string[]) =>
      lines
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !prefixes.some((p) => l.startsWith(p)))
        .map((l) => l.replace(/\s+/g, ""));
    const added = code(f.added);
    const removed = code(f.removed);

    // Reflowed / re-indented file: same code once whitespace and line breaks are ignored
    if (added.join("") === removed.join("")) continue;

    // Lines that only moved or changed whitespace cancel against each other
    const pool = new Map<string, number>();
    for (const r of removed) pool.set(r, (pool.get(r) ?? 0) + 1);
    let addedReal = 0;
    for (const a of added) {
      const n = pool.get(a) ?? 0;
      if (n > 0) pool.set(a, n - 1);
      else addedReal++;
    }
    let removedReal = 0;
    for (const n of pool.values()) removedReal += n;
    total += addedReal + removedReal;
  }
  return total;
}
