import { readFile } from "node:fs/promises";
import path from "node:path";

import { ansiToHtml, buildAnsiPalette } from "../ansi";
import type { CloneRegion, DiffLine, FileDiff } from "../diff/parse";

type HtmlRenderOptions = {
  title: string;
  copyColor?: string;
  debug?: boolean;
  repoRoot?: string;
};

type ShikiModule = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => Promise<string>;
};

type InlineRange = { start: number; end: number };

type InlineToken = {
  text: string;
  start: number;
  end: number;
  isWhitespace: boolean;
};

type SourceFileCache = Map<string, string[] | null>;

type CopyRun = {
  startIndex: number;
  endIndex: number;
  source: CloneRegion;
  similarity: number;
  sourceStartLine: number;
  sourceEndLine: number;
};

type CopyDetail = {
  summaryText: string;
  bodyHtml: string;
};

const themeName = "github-light";
const defaultLanguage = "text";
const defaultCopyAccent = "#0969da";
let shikiPromise: Promise<ShikiModule> | undefined;
const highlightDebugState = new Set<string>();
const inlineTokenPattern = /\w+|\s+|[^\w\s]+/g;
const inlineMinSimilarity = 0.5;
const inlineMinCommonChars = 3;

const debugLogOnce = (enabled: boolean | undefined, key: string, message: string): void => {
  if (!enabled || highlightDebugState.has(key)) {
    return;
  }
  highlightDebugState.add(key);
  process.stderr.write(`[copydiff] ${message}\n`);
};

const loadShiki = async (): Promise<ShikiModule> => {
  if (!shikiPromise) {
    shikiPromise = (async () => {
      const shiki = (await import("shiki")) as ShikiModule;
      if (!shiki.codeToHtml) {
        throw new Error("Shiki codeToHtml is unavailable");
      }
      return shiki;
    })();
  }
  return shikiPromise;
};

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });

const stripDiffPrefix = (file: string): string | undefined => {
  if (file === "/dev/null") {
    return undefined;
  }
  if (file.length > 2 && file[1] === "/" && /[abciow]/.test(file[0])) {
    return file.slice(2);
  }
  return file;
};

const filenameLanguageMap: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile"
};

const extensionLanguageMap: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "mdx",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".go": "go",
  ".rs": "rust",
  ".py": "python",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".m": "objective-c",
  ".mm": "objective-cpp",
  ".sh": "shellscript",
  ".zsh": "shellscript",
  ".fish": "fish",
  ".sql": "sql",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".xml": "xml"
};

const resolveLanguage = (file: FileDiff): string => {
  const candidate = stripDiffPrefix(file.toFile) ?? stripDiffPrefix(file.fromFile);
  if (!candidate) {
    return defaultLanguage;
  }
  const base = path.basename(candidate);
  const byName = filenameLanguageMap[base];
  if (byName) {
    return byName;
  }
  const ext = path.extname(candidate).toLowerCase();
  return extensionLanguageMap[ext] ?? defaultLanguage;
};

const resolveLanguageForPath = (filePath: string): string => {
  const base = path.basename(filePath);
  const byName = filenameLanguageMap[base];
  if (byName) {
    return byName;
  }
  const ext = path.extname(filePath).toLowerCase();
  return extensionLanguageMap[ext] ?? defaultLanguage;
};

const resolveSourcePath = (repoRoot: string, filePath: string): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const parts = filePath.split("/").filter((part) => part.length > 0);
  return path.resolve(repoRoot, ...parts);
};

const readSourceFileLines = async (
  repoRoot: string,
  filePath: string,
  cache: SourceFileCache
): Promise<string[] | undefined> => {
  const resolvedPath = resolveSourcePath(repoRoot, filePath);
  const cached = cache.get(resolvedPath);
  if (cached) {
    return cached;
  }
  if (cached === null) {
    return undefined;
  }
  try {
    const data = await readFile(resolvedPath, "utf8");
    const normalized = data.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    cache.set(resolvedPath, lines);
    return lines;
  } catch {
    cache.set(resolvedPath, null);
    return undefined;
  }
};

const extractCopyAccent = (copyColor?: string): string | undefined => {
  if (!copyColor) {
    return undefined;
  }
  const html = ansiToHtml(`${copyColor}x`);
  const styleMatch = html.match(/style="([^"]+)"/);
  if (!styleMatch) {
    return undefined;
  }
  const colorMatch = styleMatch[1].match(/color:\s*([^;]+)/);
  return colorMatch?.[1];
};

const extractLineHtml = (html: string): string[] => {
  const lines: string[] = [];
  const lineStartToken = '<span class="line';
  const openTag = "<span";
  const closeTag = "</span>";
  let searchIndex = 0;

  while (searchIndex < html.length) {
    const lineStart = html.indexOf(lineStartToken, searchIndex);
    if (lineStart === -1) {
      break;
    }
    const tagEnd = html.indexOf(">", lineStart);
    if (tagEnd === -1) {
      break;
    }
    let depth = 1;
    let cursor = tagEnd + 1;
    while (cursor < html.length && depth > 0) {
      const nextOpen = html.indexOf(openTag, cursor);
      const nextClose = html.indexOf(closeTag, cursor);
      if (nextClose === -1) {
        cursor = html.length;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + openTag.length;
        continue;
      }
      depth -= 1;
      cursor = nextClose + closeTag.length;
    }
    const lineContentEnd = depth === 0 ? cursor - closeTag.length : cursor;
    lines.push(html.slice(tagEnd + 1, Math.max(tagEnd + 1, lineContentEnd)));
    searchIndex = cursor;
  }

  return lines;
};

const hasFaintAnsi = (input: string): boolean => {
  const matches = input.match(/\x1b\[[0-9;]*m/g) ?? [];
  for (const match of matches) {
    const codes = match
      .slice(2, -1)
      .split(";")
      .filter((value) => value.length > 0)
      .map((value) => Number.parseInt(value, 10));
    let index = 0;
    while (index < codes.length) {
      const code = codes[index];
      if (code === 2) {
        return true;
      }
      if (code === 38 || code === 48) {
        const mode = codes[index + 1];
        if (mode === 2) {
          index += 5;
          continue;
        }
        if (mode === 5) {
          index += 3;
          continue;
        }
      }
      index += 1;
    }
  }
  return false;
};

const tokenizeInline = (line: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  for (const match of line.matchAll(inlineTokenPattern)) {
    const text = match[0];
    const start = match.index ?? 0;
    tokens.push({
      text,
      start,
      end: start + text.length,
      isWhitespace: /^\s+$/.test(text)
    });
  }
  return tokens;
};

const buildLcsMatrix = (aTokens: InlineToken[], bTokens: InlineToken[]): number[][] => {
  const matrix: number[][] = Array.from({ length: aTokens.length + 1 }, () =>
    Array.from({ length: bTokens.length + 1 }, () => 0)
  );
  for (let i = aTokens.length - 1; i >= 0; i -= 1) {
    for (let j = bTokens.length - 1; j >= 0; j -= 1) {
      if (aTokens[i].text === bTokens[j].text) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }
  return matrix;
};

type InlineOp =
  | { type: "equal"; a: number; b: number }
  | { type: "remove"; a: number }
  | { type: "add"; b: number };

const buildInlineOps = (aTokens: InlineToken[], bTokens: InlineToken[], matrix: number[][]): InlineOp[] => {
  const ops: InlineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < aTokens.length && j < bTokens.length) {
    if (aTokens[i].text === bTokens[j].text) {
      ops.push({ type: "equal", a: i, b: j });
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      ops.push({ type: "remove", a: i });
      i += 1;
    } else {
      ops.push({ type: "add", b: j });
      j += 1;
    }
  }
  while (i < aTokens.length) {
    ops.push({ type: "remove", a: i });
    i += 1;
  }
  while (j < bTokens.length) {
    ops.push({ type: "add", b: j });
    j += 1;
  }
  return ops;
};

const normalizeInlineRanges = (ranges: InlineRange[]): InlineRange[] => {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const merged: InlineRange[] = [];
  sorted.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  });
  return merged;
};

const buildInlineRanges = (tokens: InlineToken[], changed: Set<number>): InlineRange[] => {
  const ranges: InlineRange[] = [];
  let current: InlineRange | undefined;
  tokens.forEach((token, index) => {
    if (!changed.has(index) || token.isWhitespace) {
      if (current) {
        ranges.push(current);
        current = undefined;
      }
      return;
    }
    if (!current) {
      current = { start: token.start, end: token.end };
      return;
    }
    if (token.start <= current.end) {
      current.end = Math.max(current.end, token.end);
    } else {
      ranges.push(current);
      current = { start: token.start, end: token.end };
    }
  });
  if (current) {
    ranges.push(current);
  }
  return normalizeInlineRanges(ranges);
};

const computeInlineHighlightRanges = (
  before: string,
  after: string
): { del: InlineRange[]; add: InlineRange[] } | undefined => {
  if (!before || !after) {
    return undefined;
  }
  const beforeTokens = tokenizeInline(before);
  const afterTokens = tokenizeInline(after);
  if (beforeTokens.length === 0 || afterTokens.length === 0) {
    return undefined;
  }
  const matrix = buildLcsMatrix(beforeTokens, afterTokens);
  const ops = buildInlineOps(beforeTokens, afterTokens, matrix);
  const changedBefore = new Set<number>();
  const changedAfter = new Set<number>();
  let commonChars = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  beforeTokens.forEach((token) => {
    if (!token.isWhitespace) {
      totalBefore += token.text.length;
    }
  });
  afterTokens.forEach((token) => {
    if (!token.isWhitespace) {
      totalAfter += token.text.length;
    }
  });

  ops.forEach((op) => {
    if (op.type === "equal") {
      const token = beforeTokens[op.a];
      if (!token.isWhitespace) {
        commonChars += token.text.length;
      }
      return;
    }
    if (op.type === "remove") {
      changedBefore.add(op.a);
      return;
    }
    changedAfter.add(op.b);
  });

  const changedBeforeChars = Array.from(changedBefore).reduce((sum, index) => {
    const token = beforeTokens[index];
    return sum + (token && !token.isWhitespace ? token.text.length : 0);
  }, 0);
  const changedAfterChars = Array.from(changedAfter).reduce((sum, index) => {
    const token = afterTokens[index];
    return sum + (token && !token.isWhitespace ? token.text.length : 0);
  }, 0);

  const compareChars = Math.max(Math.min(totalBefore, totalAfter), 1);
  const similarity = commonChars / compareChars;
  const changedChars = Math.max(changedBeforeChars, changedAfterChars);
  if (changedChars === 0) {
    return undefined;
  }
  if (commonChars < inlineMinCommonChars || similarity < inlineMinSimilarity) {
    return undefined;
  }

  const delRanges = buildInlineRanges(beforeTokens, changedBefore);
  const addRanges = buildInlineRanges(afterTokens, changedAfter);
  if (delRanges.length === 0 && addRanges.length === 0) {
    return undefined;
  }
  return { del: delRanges, add: addRanges };
};

const buildInlineHighlightMap = (lines: DiffLine[]): Map<number, InlineRange[]> => {
  const map = new Map<number, InlineRange[]>();
  let index = 0;
  while (index < lines.length) {
    if (lines[index].kind !== "del") {
      index += 1;
      continue;
    }
    const delStart = index;
    while (index < lines.length && lines[index].kind === "del") {
      index += 1;
    }
    const delEnd = index;
    const addStart = index;
    while (index < lines.length && lines[index].kind === "add") {
      index += 1;
    }
    const addEnd = index;
    const pairCount = Math.min(delEnd - delStart, addEnd - addStart);
    for (let offset = 0; offset < pairCount; offset += 1) {
      const delLine = lines[delStart + offset];
      const addLine = lines[addStart + offset];
      if (delLine.hasBgAnsi || addLine.hasBgAnsi) {
        continue;
      }
      if (hasFaintAnsi(delLine.rawAnsi) || hasFaintAnsi(addLine.rawAnsi)) {
        continue;
      }
      const highlight = computeInlineHighlightRanges(
        delLine.plain.slice(1),
        addLine.plain.slice(1)
      );
      if (!highlight) {
        continue;
      }
      if (highlight.del.length > 0) {
        map.set(delStart + offset, highlight.del);
      }
      if (highlight.add.length > 0) {
        map.set(addStart + offset, highlight.add);
      }
    }
  }
  return map;
};

const applyInlineHighlights = (contentHtml: string, ranges: InlineRange[], className: string): string => {
  if (ranges.length === 0) {
    return contentHtml;
  }
  const normalized = normalizeInlineRanges(ranges);
  let rangeIndex = 0;
  let range = normalized[rangeIndex];
  let textIndex = 0;
  let active = false;
  let output = "";

  const open = (): void => {
    if (!active) {
      output += `<span class="${className}">`;
      active = true;
    }
  };

  const close = (): void => {
    if (active) {
      output += "</span>";
      active = false;
    }
  };

  for (let i = 0; i < contentHtml.length; i += 1) {
    if (!range) {
      output += contentHtml.slice(i);
      break;
    }
    const char = contentHtml[i];
    if (char === "<") {
      if (active) {
        close();
      }
      const tagEnd = contentHtml.indexOf(">", i);
      if (tagEnd === -1) {
        output += contentHtml.slice(i);
        break;
      }
      output += contentHtml.slice(i, tagEnd + 1);
      i = tagEnd;
      if (textIndex >= range.start && textIndex < range.end) {
        open();
      }
      continue;
    }

    if (char === "&") {
      if (textIndex === range.start) {
        open();
      }
      const entityEnd = contentHtml.indexOf(";", i);
      if (entityEnd === -1) {
        output += char;
        textIndex += 1;
      } else {
        output += contentHtml.slice(i, entityEnd + 1);
        i = entityEnd;
        textIndex += 1;
      }
      if (active && textIndex === range.end) {
        close();
        rangeIndex += 1;
        range = normalized[rangeIndex];
      }
      continue;
    }

    if (textIndex === range.start) {
      open();
    }
    output += char;
    textIndex += 1;
    if (active && textIndex === range.end) {
      close();
      rangeIndex += 1;
      range = normalized[rangeIndex];
    }
  }
  if (active) {
    close();
  }
  return output;
};

const buildCopyRuns = (lines: DiffLine[]): CopyRun[] => {
  const runs: CopyRun[] = [];
  let current:
    | { key: string; run: CopyRun; minSourceLine?: number; maxSourceLine?: number }
    | undefined;

  const flush = (): void => {
    if (!current) {
      return;
    }
    if (current.minSourceLine !== undefined && current.maxSourceLine !== undefined) {
      current.run.sourceStartLine = current.minSourceLine;
      current.run.sourceEndLine = current.maxSourceLine;
    }
    runs.push(current.run);
    current = undefined;
  };

  lines.forEach((line, index) => {
    if (line.kind !== "add" || !line.copyTag) {
      flush();
      return;
    }
    const key = `${line.copyTag.source.file}:${line.copyTag.source.startLine}-${line.copyTag.source.endLine}`;
    const sourceLine = line.copyTag.sourceLine;
    const isNewRun = !current || current.key !== key || index !== current.run.endIndex + 1;
    if (isNewRun) {
      flush();
      current = {
        key,
        run: {
          startIndex: index,
          endIndex: index,
          source: line.copyTag.source,
          similarity: line.copyTag.similarity,
          sourceStartLine: line.copyTag.source.startLine,
          sourceEndLine: line.copyTag.source.endLine
        },
        minSourceLine: sourceLine,
        maxSourceLine: sourceLine
      };
      return;
    }
    current.run.endIndex = index;
    current.run.similarity = Math.min(current.run.similarity, line.copyTag.similarity);
    if (sourceLine !== undefined) {
      current.minSourceLine = current.minSourceLine === undefined ? sourceLine : Math.min(current.minSourceLine, sourceLine);
      current.maxSourceLine = current.maxSourceLine === undefined ? sourceLine : Math.max(current.maxSourceLine, sourceLine);
    }
  });

  flush();
  return runs;
};

const buildCopyDetail = async (
  run: CopyRun,
  options: HtmlRenderOptions,
  sourceCache: SourceFileCache
): Promise<CopyDetail> => {
  const sourceLabel = `${run.source.file}:${run.sourceStartLine}-${run.sourceEndLine}`;
  const similarity = Math.round(run.similarity * 100);
  const summaryText = `copied from ${sourceLabel} (${similarity}%)`;
  let body = "";
  const repoRoot = options.repoRoot;
  if (repoRoot) {
    const lines = await readSourceFileLines(repoRoot, run.source.file, sourceCache);
    if (lines) {
      const start = Math.max(1, run.sourceStartLine);
      const end = Math.min(run.sourceEndLine, lines.length);
      if (start <= end) {
        const snippet = lines.slice(start - 1, end);
        const lang = resolveLanguageForPath(run.source.file);
        const highlighted = await highlightLines(snippet, lang, options.debug, run.source.file);
        const rendered = highlighted.map(
          (content) => `<span class="line copy-source-line">${content}</span>`
        );
        body = rendered.join("\n");
      }
    }
  }
  if (!body) {
    body = "<span class=\"line copy-source-line copy-source-missing\">source unavailable</span>";
  }
  return { summaryText, bodyHtml: body };
};

const renderCopyPanel = (panelId: string, detail: CopyDetail): string => {
  const summary = `<summary class="copy-panel-summary">${escapeHtml(detail.summaryText)}</summary>`;
  return `<details class="copy-panel" id="${panelId}">${summary}<div class="copy-panel-body">${detail.bodyHtml}</div></details>`;
};

const buildCopyInlineHighlightMap = async (
  lines: DiffLine[],
  inlineHighlightMap: Map<number, InlineRange[]>,
  options: HtmlRenderOptions,
  sourceCache: SourceFileCache
): Promise<Map<number, InlineRange[]>> => {
  const map = new Map<number, InlineRange[]>();
  const repoRoot = options.repoRoot;
  if (!repoRoot) {
    return map;
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.kind !== "add" || !line.copyTag) {
      continue;
    }
    if (inlineHighlightMap.has(index)) {
      continue;
    }
    if (line.hasBgAnsi || hasFaintAnsi(line.rawAnsi)) {
      continue;
    }
    const sourceLineNo = line.copyTag.sourceLine;
    if (!sourceLineNo) {
      continue;
    }
    const sourceLines = await readSourceFileLines(repoRoot, line.copyTag.source.file, sourceCache);
    const sourceLine = sourceLines?.[sourceLineNo - 1];
    if (sourceLine === undefined) {
      continue;
    }
    const highlight = computeInlineHighlightRanges(sourceLine, line.plain.slice(1));
    if (highlight && highlight.add.length > 0) {
      map.set(index, highlight.add);
    }
  }
  return map;
};

const highlightLines = async (
  lines: string[],
  lang: string,
  debug?: boolean,
  fileLabel?: string
): Promise<string[]> => {
  if (lines.length === 0) {
    return [];
  }
  if (lang === defaultLanguage) {
    const label = fileLabel ? ` (${fileLabel})` : "";
    debugLogOnce(debug, `lang:${lang}:${fileLabel ?? ""}`, `html highlight skipped for language=${lang}${label}`);
    return lines.map(escapeHtml);
  }
  let html: string;
  try {
    const shiki = await loadShiki();
    html = await shiki.codeToHtml(lines.join("\n"), { lang, theme: themeName });
  } catch {
    const label = fileLabel ? ` (${fileLabel})` : "";
    debugLogOnce(debug, `shiki:${lang}:${fileLabel ?? ""}`, `html highlight disabled (codeToHtml failed)${label}`);
    return lines.map(escapeHtml);
  }
  const highlighted = extractLineHtml(html);
  if (highlighted.length === 0) {
    const label = fileLabel ? ` (${fileLabel})` : "";
    debugLogOnce(debug, `shiki-lines:${lang}:${fileLabel ?? ""}`, `html highlight disabled (no lines parsed)${label}`);
    return lines.map(escapeHtml);
  }
  if (highlighted.length >= lines.length) {
    return highlighted.slice(0, lines.length);
  }
  return [...highlighted, ...lines.slice(highlighted.length).map(escapeHtml)];
};

const buildHtmlHead = (options: HtmlRenderOptions, copyAccent?: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${options.title}</title>
<style>
${buildAnsiPalette()}
:root {
  --bg: #ffffff;
  --text: #1f2328;
  --meta-bg: #f6f8fa;
  --meta-text: #57606a;
  --add-bg: #dafbe1;
  --del-bg: #ffebe8;
  --copied-bg: #e6f7ff;
  --ctx-bg: #ffffff;
  --marker-add: #1a7f37;
  --marker-del: #cf222e;
  --marker-ctx: #57606a;
  --inline-add-bg: #aceebb;
  --inline-del-bg: #ffcecb;
  --inline-copy-bg: #fff1a8;
  --copy-meta-bg: #eef2f6;
  --copy-source-bg: #f6f8fa;
  --copy-accent: ${copyAccent ?? defaultCopyAccent};
}
body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: var(--bg); color: var(--text); margin: 0; }
header { padding: 16px 20px; border-bottom: 1px solid #d0d7de; background: #f8f9fb; }
main { padding: 16px 20px; }
.diff-grid { font-size: 13px; line-height: 1.5; }
.diff-row { position: relative; --info-gap: 18px; --info-width: clamp(260px, 34%, 420px); padding-right: calc(var(--info-width) + var(--info-gap)); }
.diff-cell { min-width: 0; }
.info-cell { position: absolute; top: 0; right: 0; width: var(--info-width); z-index: 1; }
.line { display: block; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; padding-left: 4px; padding-right: 12px; }
.line.meta { background: var(--meta-bg); color: var(--meta-text); font-weight: 600; }
.line.add { background: var(--add-bg); }
.line.del { background: var(--del-bg); }
.line.context { background: var(--ctx-bg); }
.line.moved { background: transparent; }
.marker { display: inline-block; width: 1ch; color: var(--marker-ctx); }
.line.add .marker { color: var(--marker-add); }
.line.del .marker { color: var(--marker-del); }
.line.context .marker { color: var(--marker-ctx); }
.line.copied { background: var(--copied-bg); }
.line.copy-accent { box-shadow: inset 3px 0 0 var(--copy-accent); }
.inline-change { border-radius: 2px; padding: 0 1px; }
.inline-add { background: var(--inline-add-bg); }
.inline-del { background: var(--inline-del-bg); }
.inline-copy { background: var(--inline-copy-bg); }
.pure-copy { display: block; margin: 0; }
.pure-copy summary { cursor: pointer; list-style: none; margin: 0; padding: 0; }
.pure-copy summary::-webkit-details-marker { display: none; }
.pure-copy summary::marker { content: ""; }
.line.fold-summary { background: #eef2f6; color: var(--meta-text); font-weight: 600; }
.copy-panel { border: 1px solid #d0d7de; border-radius: 6px; background: #ffffff; margin-bottom: 12px; overflow: hidden; }
.copy-panel-summary { cursor: pointer; list-style: none; margin: 0; padding: 6px 8px; background: var(--copy-meta-bg); color: var(--meta-text); font-weight: 600; display: block; font-size: inherit; line-height: inherit; }
.copy-panel-summary::-webkit-details-marker { display: none; }
.copy-panel-summary::marker { content: ""; }
.copy-panel-body { padding: 4px 0; }
.copy-panel-body .line { padding-left: 8px; padding-right: 8px; }
.line.copy-source-line { background: var(--copy-source-bg); color: var(--text); }
.line.copy-source-line .marker { color: var(--marker-ctx); }
.copy-source-missing { font-style: italic; }
.legend { font-size: 12px; color: #57606a; }
@media (max-width: 960px) {
  .diff-row { padding-right: 0; }
  .info-cell { position: static; width: auto; padding-top: 8px; }
  .info-cell:empty { display: none; padding-top: 0; }
}
</style>
</head>
<body>
<header>
  <strong>copydiff</strong>
  <div class="legend">Syntax highlighting enabled when available. Copied source details appear next to their matching additions. Pure copy blocks are collapsed.</div>
</header>
<main>
  <div class="diff-grid">`;

const buildHtmlFooter = (): string => `</div>
</main>
</body>
</html>`;

const renderMetaLine = (line: DiffLine): string =>
  `<span class="line meta">${escapeHtml(line.plain)}</span>`;

const renderFoldSummaryLine = (summary: string): string =>
  `<summary class="line meta fold-summary"><span class="marker"> </span>${escapeHtml(summary)}</summary>`;

const renderDiffLine = (
  line: DiffLine,
  contentHtml: string,
  copyAccent?: string,
  moved?: boolean
): string => {
  const classes = ["line", line.kind];
  const isCopiedAdd = line.kind === "add" && line.copyTag;
  if (isCopiedAdd) {
    if (copyAccent) {
      classes.push("copy-accent");
    } else {
      classes.push("copied");
    }
  }
  if (moved) {
    classes.push("moved");
  }
  const marker = escapeHtml(line.plain.slice(0, 1));
  return `<span class="${classes.join(" ")}"><span class="marker">${marker}</span>${contentHtml}</span>`;
};

type FoldSegmentMap = Map<number, { endIndex: number; summary: string }>;

const renderRow = (diffHtml: string, panelHtml?: string): string =>
  `<div class="diff-row"><div class="diff-cell">${diffHtml}</div><div class="info-cell">${panelHtml ?? ""}</div></div>`;

const renderHunk = async (
  lines: DiffLine[],
  foldSegments: FoldSegmentMap,
  options: HtmlRenderOptions,
  lang: string,
  copyAccent: string | undefined,
  fileLabel: string | undefined,
  panelPrefix: string,
  sourceCache: SourceFileCache
): Promise<string> => {
  const inlineHighlightMap = buildInlineHighlightMap(lines);
  const copyInlineHighlightMap = await buildCopyInlineHighlightMap(lines, inlineHighlightMap, options, sourceCache);
  const copyRuns = buildCopyRuns(lines);
  const foldRanges = Array.from(foldSegments.entries()).map(([startIndex, segment]) => ({
    startIndex,
    endIndex: segment.endIndex
  }));
  const isFoldedRun = (run: CopyRun): boolean =>
    foldRanges.some((range) => run.startIndex >= range.startIndex && run.endIndex <= range.endIndex);
  const copyRunPanels = new Map<number, string>();
  let panelIndex = 0;
  for (const run of copyRuns) {
    if (isFoldedRun(run)) {
      continue;
    }
    const detail = await buildCopyDetail(run, options, sourceCache);
    const panelId = `${panelPrefix}-${panelIndex}`;
    panelIndex += 1;
    copyRunPanels.set(run.startIndex, renderCopyPanel(panelId, detail));
  }
  const codeLines = lines
    .filter((line) => line.kind === "add" || line.kind === "del" || line.kind === "context")
    .map((line) => line.plain.slice(1));
  const highlighted = await highlightLines(codeLines, lang, options.debug, fileLabel);
  let codeIndex = 0;
  const renderedLines = lines.map((line, lineIndex) => {
    if (line.kind === "add" || line.kind === "del" || line.kind === "context") {
      let content = highlighted[codeIndex] ?? escapeHtml(codeLines[codeIndex] ?? "");
      const inlineRanges = inlineHighlightMap.get(lineIndex);
      if (inlineRanges && (line.kind === "add" || line.kind === "del")) {
        const inlineClass = line.kind === "add" ? "inline-change inline-add" : "inline-change inline-del";
        content = applyInlineHighlights(content, inlineRanges, inlineClass);
      } else if (line.kind === "add") {
        const copyRanges = copyInlineHighlightMap.get(lineIndex);
        if (copyRanges) {
          content = applyInlineHighlights(content, copyRanges, "inline-change inline-copy");
        }
      }
      codeIndex += 1;
      const accent = options.copyColor ? copyAccent ?? defaultCopyAccent : undefined;
      const moved = line.hasBgAnsi || hasFaintAnsi(line.rawAnsi);
      const lineHtml = renderDiffLine(line, content, accent, moved);
      return lineHtml;
    }
    return renderMetaLine(line);
  });

  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const fold = foldSegments.get(index);
    if (fold) {
      const foldedLines = renderedLines.slice(index, fold.endIndex + 1).join("\n");
      const diffHtml = `<details class="pure-copy">${renderFoldSummaryLine(fold.summary)}${foldedLines}</details>`;
      output.push(renderRow(diffHtml));
      index = fold.endIndex + 1;
      continue;
    }
    const panelHtml = copyRunPanels.get(index);
    output.push(renderRow(renderedLines[index], panelHtml));
    index += 1;
  }
  return output.join("\n");
};

const renderHtml = async (files: FileDiff[], options: HtmlRenderOptions): Promise<string> => {
  const copyAccent = extractCopyAccent(options.copyColor);
  const sourceCache: SourceFileCache = new Map();
  const content: string[] = [buildHtmlHead(options, copyAccent)];
  for (const [fileIndex, file] of files.entries()) {
    const lang = resolveLanguage(file);
    const fileLabel = stripDiffPrefix(file.toFile) ?? stripDiffPrefix(file.fromFile);
    file.headerLines.forEach((line) => content.push(renderRow(renderMetaLine(line))));
    for (const [hunkIndex, hunk] of file.hunks.entries()) {
      content.push(renderRow(renderMetaLine(hunk.headerLine)));
      const foldMap: FoldSegmentMap = new Map();
      hunk.foldSegments.forEach((segment) => {
        foldMap.set(segment.startIndex, { endIndex: segment.endIndex, summary: segment.summary });
      });
      const rendered = await renderHunk(
        hunk.lines,
        foldMap,
        options,
        lang,
        copyAccent,
        fileLabel,
        `copy-${fileIndex}-${hunkIndex}`,
        sourceCache
      );
      content.push(rendered);
    }
  }
  content.push(buildHtmlFooter());
  return content.join("\n");
};

export { renderHtml };
export type { HtmlRenderOptions };
