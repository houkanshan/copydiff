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

type CopyRunDetail = {
  startIndex: number;
  detail: CopyDetail;
};

type LineRenderInfo = {
  content: string;
  moved: boolean;
};

type FileNavEntry = {
  path: string;
  title: string;
  anchor: string;
  status: "changed" | "new" | "deleted" | "moved";
  addedLines: number;
  deletedLines: number;
};

type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  entry?: FileNavEntry;
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

const collectCopyRunLines = (lines: DiffLine[], run: CopyRun): string[] => {
  const runLines: string[] = [];
  for (let index = run.startIndex; index <= run.endIndex; index += 1) {
    const line = lines[index];
    if (!line || line.kind !== "add") {
      continue;
    }
    runLines.push(line.plain.slice(1));
  }
  return runLines;
};

const alignCopyRunSourceRange = (
  run: CopyRun,
  runLines: string[],
  sourceLines: string[]
): { startLine: number; endLine: number } | undefined => {
  const runLength = runLines.length;
  if (runLength < 3) {
    return undefined;
  }
  const regionStart = Math.max(1, run.source.startLine);
  const regionEnd = Math.min(run.source.endLine, sourceLines.length);
  if (regionEnd < regionStart) {
    return undefined;
  }
  const windowLength = regionEnd - regionStart + 1;
  if (runLength > windowLength) {
    return undefined;
  }

  const normalizedRun = runLines.map((line) => line.trim());
  const substantive = normalizedRun.map((line) => line.length >= 3);
  const maxScore = substantive.filter(Boolean).length;
  if (maxScore < 2) {
    return undefined;
  }
  const normalizedSource = sourceLines.slice(regionStart - 1, regionEnd).map((line) => line.trim());
  const maxOffset = windowLength - runLength;
  const guessOffset = Math.max(0, Math.min(run.sourceStartLine - regionStart, maxOffset));

  let bestOffset = guessOffset;
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    let score = 0;
    for (let index = 0; index < runLength; index += 1) {
      if (!substantive[index]) {
        continue;
      }
      if (normalizedRun[index] === normalizedSource[offset + index]) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
      bestDistance = Math.abs(offset - guessOffset);
      continue;
    }
    if (score === bestScore) {
      const distance = Math.abs(offset - guessOffset);
      if (distance < bestDistance) {
        bestOffset = offset;
        bestDistance = distance;
      }
    }
  }

  const minScore = Math.max(2, Math.ceil(maxScore * 0.4));
  if (bestScore < minScore) {
    return undefined;
  }
  const startLine = regionStart + bestOffset;
  return { startLine, endLine: startLine + runLength - 1 };
};

const buildCopyDetail = async (
  run: CopyRun,
  diffLines: DiffLine[],
  options: HtmlRenderOptions,
  sourceCache: SourceFileCache
): Promise<CopyDetail> => {
  const similarity = Math.round(run.similarity * 100);
  let body = "";
  let sourceLabel = `${run.source.file}:${run.sourceStartLine}-${run.sourceEndLine}`;
  let sourceStartLine = run.sourceStartLine;
  let sourceEndLine = run.sourceEndLine;
  const repoRoot = options.repoRoot;
  if (repoRoot) {
    const sourceLines = await readSourceFileLines(repoRoot, run.source.file, sourceCache);
    if (sourceLines) {
      const runLines = collectCopyRunLines(diffLines, run);
      const aligned = alignCopyRunSourceRange(run, runLines, sourceLines);
      if (aligned) {
        sourceStartLine = aligned.startLine;
        sourceEndLine = aligned.endLine;
      }
      sourceLabel = `${run.source.file}:${sourceStartLine}-${sourceEndLine}`;
      const start = Math.max(1, sourceStartLine);
      const end = Math.min(sourceEndLine, sourceLines.length);
      if (start <= end) {
        const snippet = sourceLines.slice(start - 1, end);
        const lang = resolveLanguageForPath(run.source.file);
        const highlighted = await highlightLines(snippet, lang, options.debug, run.source.file);
        const rendered = highlighted.map(
          (content) => `<span class="line copy-source-line"><span class="line-content">${content}</span></span>`
        );
        body = rendered.join("\n");
      }
    }
  }
  if (!body) {
    body = "<span class=\"line copy-source-line copy-source-missing\"><span class=\"line-content\">source unavailable</span></span>";
  }
  const summaryText = `copied from ${sourceLabel} (${similarity}%)`;
  return { summaryText, bodyHtml: body };
};

const renderCopyPanel = (panelId: string, detail: CopyDetail): string => {
  const summary = `<summary class="copy-panel-summary">${escapeHtml(detail.summaryText)}</summary>`;
  return `<details class="copy-panel" id="${panelId}">${summary}<div class="copy-panel-body">${detail.bodyHtml}</div></details>`;
};

const buildCopyRunDetails = async (
  lines: DiffLine[],
  foldSegments: FoldSegmentMap,
  options: HtmlRenderOptions,
  sourceCache: SourceFileCache
): Promise<CopyRunDetail[]> => {
  const copyRuns = buildCopyRuns(lines);
  const foldRanges = Array.from(foldSegments.entries()).map(([startIndex, segment]) => ({
    startIndex,
    endIndex: segment.endIndex
  }));
  const isFoldedRun = (run: CopyRun): boolean =>
    foldRanges.some((range) => run.startIndex >= range.startIndex && run.endIndex <= range.endIndex);
  const details: CopyRunDetail[] = [];
  for (const run of copyRuns) {
    if (isFoldedRun(run)) {
      continue;
    }
    const detail = await buildCopyDetail(run, lines, options, sourceCache);
    details.push({ startIndex: run.startIndex, detail });
  }
  return details;
};

const buildCopyRunPanelMap = (details: CopyRunDetail[], panelPrefix: string): Map<number, string> => {
  const panels = new Map<number, string>();
  details.forEach((detail, index) => {
    panels.set(detail.startIndex, renderCopyPanel(`${panelPrefix}-${index}`, detail.detail));
  });
  return panels;
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
  const alignedSourceLineMap = new Map<number, number>();
  const copyRuns = buildCopyRuns(lines);
  for (const run of copyRuns) {
    const sourceLines = await readSourceFileLines(repoRoot, run.source.file, sourceCache);
    if (!sourceLines) {
      continue;
    }
    const runLines = collectCopyRunLines(lines, run);
    const aligned = alignCopyRunSourceRange(run, runLines, sourceLines);
    if (!aligned) {
      continue;
    }
    for (let index = run.startIndex; index <= run.endIndex; index += 1) {
      alignedSourceLineMap.set(index, aligned.startLine + (index - run.startIndex));
    }
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
    const sourceLineNo = alignedSourceLineMap.get(index) ?? line.copyTag.sourceLine;
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

const buildLineRenderInfo = async (
  lines: DiffLine[],
  options: HtmlRenderOptions,
  lang: string,
  fileLabel: string | undefined,
  sourceCache: SourceFileCache
): Promise<Map<number, LineRenderInfo>> => {
  const inlineHighlightMap = buildInlineHighlightMap(lines);
  const copyInlineHighlightMap = await buildCopyInlineHighlightMap(lines, inlineHighlightMap, options, sourceCache);
  const codeLines = lines
    .filter((line) => line.kind === "add" || line.kind === "del" || line.kind === "context")
    .map((line) => line.plain.slice(1));
  const highlighted = await highlightLines(codeLines, lang, options.debug, fileLabel);
  let codeIndex = 0;
  const rendered = new Map<number, LineRenderInfo>();
  lines.forEach((line, lineIndex) => {
    if (line.kind !== "add" && line.kind !== "del" && line.kind !== "context") {
      return;
    }
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
    rendered.set(lineIndex, { content, moved: line.hasBgAnsi || hasFaintAnsi(line.rawAnsi) });
    codeIndex += 1;
  });
  return rendered;
};

const buildHtmlHead = (
  options: HtmlRenderOptions,
  copyAccent?: string,
  fileTreeHtml?: string
): string => `<!DOCTYPE html>
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
  --copied-bg: #f6ffe6;
  --ctx-bg: #ffffff;
  --marker-add: #1a7f37;
  --marker-del: #cf222e;
  --marker-ctx: #57606a;
  --inline-add-bg: #aceebb;
  --inline-del-bg: #ffcecb;
  --inline-copy-bg: #e5f7b8;
  --copy-meta-bg: #eef7d8;
  --copy-source-bg: #f8ffee;
  --line-no: #111111;
  --line-no-bg: #ffffff;
  --line-no-add-bg: #edfdf1;
  --line-no-del-bg: #fff3f1;
  --line-no-copy-bg: #eef7cf;
  --copy-accent: ${copyAccent ?? defaultCopyAccent};
  --tree-bg: #ffffff;
  --tree-border: #d0d7de;
  --tree-header-bg: #f6f8fa;
  --tree-link: #0969da;
  --tree-muted: #57606a;
  --tree-shadow: rgba(27, 31, 36, 0.2);
  --tree-status-changed-bg: #eef2f6;
  --tree-status-changed-text: #57606a;
  --tree-status-new-bg: #dafbe1;
  --tree-status-new-text: #1a7f37;
  --tree-status-deleted-bg: #ffebe8;
  --tree-status-deleted-text: #cf222e;
  --tree-status-moved-bg: #e7f0ff;
  --tree-status-moved-text: #0969da;
  --tree-active-bg: #e7f0ff;
  --tree-active-text: #0b2f6a;
  --tree-active-border: #9cc2ff;
}
body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: var(--bg); color: var(--text); margin: 0; }
header { padding: 16px 20px; border-bottom: 1px solid #d0d7de; background: #f8f9fb; }
.header-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.header-meta { min-width: 240px; }
.legend { font-size: 12px; color: #57606a; margin-top: 4px; }
.view-toggle { display: inline-flex; gap: 6px; padding: 2px; border-radius: 999px; border: 1px solid #d0d7de; background: #eef2f6; }
.view-toggle button { font: inherit; font-size: 12px; padding: 4px 10px; border: 0; border-radius: 999px; background: transparent; color: #57606a; cursor: pointer; }
.view-toggle button:focus { outline: 2px solid #0969da; outline-offset: 2px; }
body[data-view="unified"] .view-toggle button[data-view-toggle="unified"],
body[data-view="side"] .view-toggle button[data-view-toggle="side"] { background: #ffffff; color: var(--text); box-shadow: 0 1px 2px rgba(27, 31, 36, 0.1); }
main { padding: 16px 0; }
.diff-file-list { display: flex; flex-direction: column; gap: 16px; }
.diff-file { border: 1px solid #d0d7de; border-radius: 0; background: #ffffff; overflow: visible; }
.diff-file-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 16px; background: var(--meta-bg); color: var(--text); font-weight: 600; cursor: pointer; list-style: none; position: sticky; top: 0; z-index: 4; }
.diff-file[open] .diff-file-summary { border-bottom: 1px solid #d0d7de; }
.diff-file-summary::-webkit-details-marker { display: none; }
.diff-file-summary::marker { content: ""; }
.file-tree { position: fixed; top: 64px; right: 8px; z-index: 6; }
.file-tree-panel { overflow: hidden; border: 1px solid var(--tree-border); border-radius: 12px; background: var(--tree-bg); box-shadow: 0 12px 28px var(--tree-shadow); width: 320px; }
.file-tree-panel summary { cursor: pointer; list-style: none; padding: 8px 12px; font-size: 12px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 6px; }
.file-tree-panel summary::before { content: ""; width: 0; height: 0; border-style: solid; border-width: 5px 0 5px 8px; border-color: transparent transparent transparent var(--text); transition: transform 0.15s ease; flex-shrink: 0; }
.file-tree-panel[open] > summary::before { transform: rotate(90deg); }
.file-tree-panel summary::-webkit-details-marker { display: none; }
.file-tree-panel summary::marker { content: ""; }
.file-tree-content { max-height: 33vh; overflow: auto; padding: 0 8px 8px; }
.file-tree-list { list-style: none; margin: 0; padding-left: 0; }
.file-tree-list .file-tree-list { padding-left: 8px; }
.file-tree-node > summary { cursor: pointer; list-style: none; color: var(--text); font-weight: 600; font-size: 12px; padding: 4px; display: flex; align-items: center; gap: 4px; }
.file-tree-node > summary::before { content: ""; width: 0; height: 0; border-style: solid; border-width: 4px 0 4px 6px; border-color: transparent transparent transparent var(--tree-muted); transition: transform 0.15s ease; flex-shrink: 0; }
.file-tree-node[open] > summary::before { transform: rotate(90deg); }
.file-tree-item { margin: 4px 0 4px 4px; }
.file-tree-item a { color: var(--tree-link); text-decoration: none; font-size: 12px; border-radius: 6px; padding: 2px 4px; display: flex; align-items: center; gap: 0; }
.file-tree-item a:hover { text-decoration: underline; }
.file-tree-item a:focus { outline: 2px solid var(--tree-link); outline-offset: 2px; }
.file-tree-item a[aria-current="location"] { background: var(--tree-active-bg); color: var(--tree-active-text); box-shadow: inset 0 0 0 1px var(--tree-active-border); text-decoration: none; }
.file-tree-status { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-right: 6px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
.file-tree-status.status-changed { background: var(--tree-status-changed-bg); color: var(--tree-status-changed-text); }
.file-tree-status.status-new { background: var(--tree-status-new-bg); color: var(--tree-status-new-text); }
.file-tree-status.status-deleted { background: var(--tree-status-deleted-bg); color: var(--tree-status-deleted-text); }
.file-tree-status.status-moved { background: var(--tree-status-moved-bg); color: var(--tree-status-moved-text); }
.file-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-tree-stats { display: flex; gap: 4px; margin-left: 6px; font-size: 10px; font-weight: 600; flex-shrink: 0; }
.file-tree-stat-add { color: var(--marker-add); }
.file-tree-stat-del { color: var(--marker-del); }
.file-header { display: inline-flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; }
.file-toggle { width: 0; height: 0; border-style: solid; border-width: 5px 0 5px 8px; border-color: transparent transparent transparent var(--meta-text); transition: transform 0.15s ease; }
.diff-file[open] .file-toggle { transform: rotate(90deg); }
.file-title { font-size: 13px; }
.file-meta { font-size: 12px; color: var(--meta-text); font-weight: 500; }
.file-stats { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 600; }
.file-stat-add { color: var(--marker-add); }
.file-stat-del { color: var(--marker-del); }
.diff-file-body { padding: 0; }
.diff-view { display: none; }
body[data-view="unified"] .diff-view-unified { display: block; }
body[data-view="side"] .diff-view-side { display: block; }
.diff-view-side { overflow-x: auto; }
.diff-grid { font-size: 13px; line-height: 1.5; --info-gap: 18px; --info-width: clamp(260px, 34%, 420px); }
.diff-grid-unified .diff-row { position: relative; padding-right: calc(var(--info-width) + var(--info-gap)); }
.diff-grid-unified .diff-cell { min-width: 0; }
.diff-grid-unified .info-cell { position: absolute; top: 0; right: 0; width: var(--info-width); z-index: 1; }
.diff-grid-side .diff-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: var(--info-gap); align-items: start; padding-right: calc(var(--info-width) + var(--info-gap)); }
.diff-grid-side .diff-cell { min-width: 0; }
.diff-grid-side .diff-cell.span-2 { grid-column: 1 / span 2; }
.diff-grid-side .info-cell { position: absolute; top: 0; right: 8px; width: var(--info-width); z-index: 1; }
.diff-grid-unified .info-cell.is-expanded,
.diff-grid-side .info-cell.is-expanded { z-index: 3; }
.diff-grid-unified .diff-row::after,
.diff-grid-side .diff-row::after { content: ""; position: absolute; top: 0; bottom: 0; right: calc(var(--info-width) + var(--info-gap)); width: 1px; background: #d0d7de; pointer-events: none; }
.line { display: block; padding-right: 12px; }
.line.has-prefix { display: grid; grid-template-columns: max-content 1fr; column-gap: 8px; align-items: stretch; }
.line-prefix { display: flex; align-items: flex-start; align-self: stretch; padding-right: 8px; border-right: 1px solid #ffffff; background: var(--line-no-bg); }
.line.add .line-prefix { background: var(--line-no-add-bg); }
.line.del .line-prefix { background: var(--line-no-del-bg); }
.line.copied .line-prefix { background: var(--line-no-copy-bg); }
.line-content { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.line-no { display: inline-block; min-width: 4ch; text-align: right; color: var(--line-no); font-variant-numeric: tabular-nums; user-select: none; }
.line.meta { background: var(--meta-bg); color: var(--meta-text); font-weight: 600; }
.line.add { background: var(--add-bg); }
.line.del { background: var(--del-bg); }
.line.context { background: var(--ctx-bg); }
.line.empty { background: var(--ctx-bg); }
.line.moved { background: transparent; }
.line.copied { background: var(--copied-bg); }
.line.copy-accent { box-shadow: inset 3px 0 0 var(--copy-accent); }
.inline-change { border-radius: 2px; }
.inline-add { background: var(--inline-add-bg); }
.inline-del { background: var(--inline-del-bg); }
.inline-copy { background: var(--inline-copy-bg); }
.pure-copy { display: block; margin: 0; }
.pure-copy summary { cursor: pointer; list-style: none; margin: 0; padding: 0; }
.pure-copy summary::-webkit-details-marker { display: none; }
.pure-copy summary::marker { content: ""; }
.line.fold-summary { background: #c6dcff; color: var(--meta-text); font-weight: 600; }
.copy-panel { border: 1px solid #d0d7de; border-radius: 6px; background: #ffffff; margin-bottom: 12px; overflow: hidden; }
.copy-panel-summary { cursor: pointer; list-style: none; margin: 0; padding: 6px 8px; background: var(--copy-meta-bg); color: var(--meta-text); font-weight: 600; display: block; font-size: inherit; line-height: inherit; }
.copy-panel-summary::-webkit-details-marker { display: none; }
.copy-panel-summary::marker { content: ""; }
.copy-panel-body { padding: 4px 0; }
.copy-panel-body .line { padding-left: 8px; padding-right: 8px; }
.line.copy-source-line { background: var(--copy-source-bg); color: var(--text); }
.copy-source-missing { font-style: italic; }
@media (max-width: 960px) {
  header { padding: 12px 16px; }
  main { padding: 16px 0; }
  .file-tree { top: 76px; right: 8px; }
  .file-tree-panel { max-width: min(260px, 70vw); }
  .file-tree-content { max-height: 33vh; }
  .diff-grid-unified .diff-row { padding-right: 0; display: flex; flex-direction: column; }
  .diff-grid-unified .diff-cell { order: 1; }
  .diff-grid-unified .info-cell { order: 2; }
  .diff-grid-unified .diff-row::after { display: none; }
  .diff-grid-unified .info-cell { position: static; width: auto; padding-top: 8px; }
  .diff-grid-unified .info-cell:empty { display: none; padding-top: 0; }
}
</style>
</head>
<body data-view="unified">
<header>
  <div class="header-row">
    <div class="header-meta">
      <strong>copydiff</strong>
      <div class="legend">Syntax highlighting enabled when available. Copied source details appear next to their matching additions. Pure copy blocks are collapsed.</div>
    </div>
    <div class="view-toggle" role="group" aria-label="Diff view">
      <button type="button" data-view-toggle="unified" aria-pressed="true">Unified</button>
      <button type="button" data-view-toggle="side" aria-pressed="false">Side-by-side</button>
    </div>
</div>
</header>
${fileTreeHtml ?? ""}
<main>`;

const buildHtmlFooter = (): string => `</main>
<script>
(() => {
  const storageKey = "copydiff:view";
  const body = document.body;
  const buttons = Array.from(document.querySelectorAll("[data-view-toggle]"));
  const applyView = (view) => {
    const next = view === "side" ? "side" : "unified";
    body.dataset.view = next;
    buttons.forEach((button) => {
      const isActive = button.dataset.viewToggle === next;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Ignore storage failures (private browsing, etc.).
    }
  };
  let initial = "unified";
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "side" || stored === "unified") {
      initial = stored;
    }
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
  applyView(initial);
  buttons.forEach((button) => {
    button.addEventListener("click", () => applyView(button.dataset.viewToggle ?? "unified"));
  });
  const updateInfoCell = (infoCell) => {
    const hasOpenPanel = infoCell.querySelector(".copy-panel[open]");
    infoCell.classList.toggle("is-expanded", Boolean(hasOpenPanel));
  };
  const infoCells = Array.from(document.querySelectorAll(".info-cell"));
  infoCells.forEach((infoCell) => {
    updateInfoCell(infoCell);
    infoCell.querySelectorAll(".copy-panel").forEach((panel) => {
      panel.addEventListener("toggle", () => updateInfoCell(infoCell));
    });
  });
  const fileLinks = Array.from(document.querySelectorAll("[data-file-anchor]"));
  const fileLinkMap = new Map();
  fileLinks.forEach((link) => {
    const anchor = link.getAttribute("data-file-anchor");
    if (anchor) {
      fileLinkMap.set(anchor, link);
    }
  });
  let activeAnchor = "";
  const setActiveLink = (anchor) => {
    if (!anchor || anchor === activeAnchor) {
      return;
    }
    const next = fileLinkMap.get(anchor);
    if (!next) {
      return;
    }
    if (activeAnchor) {
      const prev = fileLinkMap.get(activeAnchor);
      if (prev) {
        prev.removeAttribute("aria-current");
      }
    }
    next.setAttribute("aria-current", "location");
    activeAnchor = anchor;
  };
  fileLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const targetId = link.getAttribute("data-file-anchor");
      if (!targetId) {
        return;
      }
      const target = document.getElementById(targetId);
      if (target && target instanceof HTMLDetailsElement) {
        target.open = true;
      }
      setActiveLink(targetId);
    });
  });
  const fileSections = Array.from(document.querySelectorAll(".diff-file[id]"));
  const resolveActiveOffset = () => {
    const header = document.querySelector("header");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const minOffset = Math.max(72, headerHeight + 12);
    return Math.min(minOffset, 160);
  };
  const updateActiveFromScroll = () => {
    if (fileSections.length === 0 || fileLinkMap.size === 0) {
      return;
    }
    const offset = resolveActiveOffset();
    let candidate = null;
    let bestTop = -Infinity;
    fileSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.bottom <= offset) {
        return;
      }
      if (rect.top <= offset) {
        if (rect.top > bestTop) {
          candidate = section;
          bestTop = rect.top;
        }
        return;
      }
      if (!candidate) {
        candidate = section;
      }
    });
    if (candidate && candidate.id) {
      setActiveLink(candidate.id);
    }
  };
  if (fileSections.length > 0 && fileLinkMap.size > 0) {
    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateActiveFromScroll();
      });
    };
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    scheduleUpdate();
  }
})();
</script>
</body>
</html>`;

const renderLineNumber = (value: number | undefined, className: string): string => {
  const text = value === undefined ? "" : String(value);
  return `<span class="line-no ${className}">${text}</span>`;
};

const renderLineNumbers = (line: DiffLine): string =>
  `${renderLineNumber(line.oldLineNo, "old")}${renderLineNumber(line.newLineNo, "new")}`;

const renderMetaLine = (line: DiffLine): string =>
  `<span class="line meta"><span class="line-content">${escapeHtml(line.plain)}</span></span>`;

const renderFoldSummaryContent = (summary: string): string =>
  `<span class="line-prefix">${renderLineNumber(undefined, "old")}${renderLineNumber(
    undefined,
    "new"
  )}</span><span class="line-content">${escapeHtml(summary)}</span>`;

const renderFoldSummaryLine = (summary: string): string =>
  `<summary class="line meta fold-summary has-prefix">${renderFoldSummaryContent(summary)}</summary>`;

const renderFoldSummaryInline = (summary: string): string =>
  `<span class="line meta fold-summary has-prefix">${renderFoldSummaryContent(summary)}</span>`;

const resolveFileHeaderPaths = (file: FileDiff): { fromPath?: string; toPath?: string } => {
  let fromPath = stripDiffPrefix(file.fromFile);
  let toPath = stripDiffPrefix(file.toFile);
  if (!fromPath && !toPath) {
    const header = file.headerLines.find((line) => line.plain.startsWith("diff --git "));
    const match = header?.plain.match(/^diff --git\s+(\S+)\s+(\S+)/);
    if (match) {
      fromPath = stripDiffPrefix(match[1]);
      toPath = stripDiffPrefix(match[2]);
    }
  }
  return { fromPath, toPath };
};

const buildFileAnchorId = (pathLabel: string, index: number): string => {
  const normalized = pathLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = normalized.length > 0 ? normalized : "file";
  return `file-${index + 1}-${suffix}`;
};

const resolveFileStatus = (file: FileDiff): "changed" | "new" | "deleted" | "moved" => {
  const { fromPath, toPath } = resolveFileHeaderPaths(file);
  if (!fromPath && toPath) {
    return "new";
  }
  if (fromPath && !toPath) {
    return "deleted";
  }
  if (fromPath && toPath && fromPath !== toPath) {
    return "moved";
  }
  return "changed";
};

const buildFileNavEntries = (files: FileDiff[]): FileNavEntry[] =>
  files.map((file, index) => {
    const { fromPath, toPath } = resolveFileHeaderPaths(file);
    const moved = Boolean(fromPath && toPath && fromPath !== toPath);
    const displayPath = toPath ?? fromPath ?? `file-${index + 1}`;
    const title = moved ? `${fromPath} -> ${toPath}` : displayPath;
    let addedLines = 0;
    let deletedLines = 0;
    file.hunks.forEach((hunk) => {
      hunk.lines.forEach((line) => {
        if (line.kind === "add") {
          addedLines += 1;
        } else if (line.kind === "del") {
          deletedLines += 1;
        }
      });
    });
    return {
      path: displayPath,
      title,
      anchor: buildFileAnchorId(displayPath, index),
      status: resolveFileStatus(file),
      addedLines,
      deletedLines
    };
  });

const createFileTreeNode = (name: string, pathLabel: string): FileTreeNode => ({
  name,
  path: pathLabel,
  children: new Map<string, FileTreeNode>()
});

const buildFileTree = (entries: FileNavEntry[]): FileTreeNode => {
  const root = createFileTreeNode("", "");
  entries.forEach((entry) => {
    const segments = entry.path.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      const node = createFileTreeNode(entry.path, entry.path);
      node.entry = entry;
      root.children.set(entry.path, node);
      return;
    }
    let current = root;
    let currentPath = "";
    segments.forEach((segment, index) => {
      currentPath = currentPath.length > 0 ? `${currentPath}/${segment}` : segment;
      let child = current.children.get(segment);
      if (!child) {
        child = createFileTreeNode(segment, currentPath);
        current.children.set(segment, child);
      }
      if (index === segments.length - 1) {
        child.entry = entry;
      }
      current = child;
    });
  });
  return root;
};

const renderFileTreeList = (node: FileTreeNode): string => {
  const children = Array.from(node.children.values());
  if (children.length === 0) {
    return "";
  }
  const statusLabelMap: Record<FileNavEntry["status"], string> = {
    changed: "M",
    new: "N",
    deleted: "D",
    moved: "R"
  };
  const statusTitleMap: Record<FileNavEntry["status"], string> = {
    changed: "changed",
    new: "new",
    deleted: "deleted",
    moved: "moved"
  };
  const collapseDirChain = (start: FileTreeNode): { label: string; node: FileTreeNode } => {
    let current = start;
    let label = current.name;
    while (!current.entry && current.children.size === 1) {
      const [child] = Array.from(current.children.values());
      if (child.entry || child.children.size === 0) {
        break;
      }
      label = label.length > 0 ? `${label}/${child.name}` : child.name;
      current = child;
    }
    return { label, node: current };
  };
  const dirNodes: Array<{ label: string; node: FileTreeNode }> = [];
  const fileNodes: FileTreeNode[] = [];
  children.forEach((child) => {
    if (child.children.size > 0) {
      dirNodes.push(collapseDirChain(child));
    } else if (child.entry) {
      fileNodes.push(child);
    }
  });
  dirNodes.sort((a, b) => a.label.localeCompare(b.label));
  fileNodes.sort((a, b) => a.name.localeCompare(b.name));
  const items: string[] = [];
  dirNodes.forEach(({ label, node: dirNode }) => {
    const subtree = renderFileTreeList(dirNode);
    items.push(
      `<li class="file-tree-dir"><details class="file-tree-node" open><summary>${escapeHtml(
        label
      )}</summary>${subtree}</details></li>`
    );
  });
  fileNodes.forEach((child) => {
    const entry = child.entry;
    if (!entry) {
      return;
    }
    const statusLabel = statusLabelMap[entry.status];
    const statusTitle = statusTitleMap[entry.status];
    const statsHtml =
      entry.addedLines > 0 || entry.deletedLines > 0
        ? `<span class="file-tree-stats"><span class="file-tree-stat-add">+${entry.addedLines}</span><span class="file-tree-stat-del">-${entry.deletedLines}</span></span>`
        : "";
    items.push(
      `<li class="file-tree-item"><a href="#${entry.anchor}" data-file-anchor="${
        entry.anchor
      }" title="${escapeHtml(entry.title)}" aria-label="${escapeHtml(
        `${entry.title} (${statusTitle})`
      )}"><span class="file-tree-status status-${entry.status}" aria-hidden="true">${statusLabel}</span><span class="file-tree-name">${escapeHtml(
        child.name
      )}</span>${statsHtml}</a></li>`
    );
  });
  return `<ul class="file-tree-list">${items.join("")}</ul>`;
};

const renderFileTreePanel = (entries: FileNavEntry[]): string => {
  if (entries.length === 0) {
    return "";
  }
  const root = buildFileTree(entries);
  const listHtml = renderFileTreeList(root);
  return `<aside class="file-tree" aria-label="Files"><details class="file-tree-panel" open><summary>Files (${entries.length})</summary><nav class="file-tree-content" aria-label="Changed file tree">${listHtml}</nav></details></aside>`;
};

const renderFileSummary = (file: FileDiff, addedLines: number, deletedLines: number): string => {
  const { fromPath, toPath } = resolveFileHeaderPaths(file);
  const moved = Boolean(fromPath && toPath && fromPath !== toPath);
  const title = moved ? `${fromPath} -> ${toPath}` : fromPath ?? toPath ?? "unknown file";
  const metaLines = file.headerLines
    .map((line) => line.plain)
    .filter((plain) => plain.length > 0)
    .filter((plain) => !plain.startsWith("diff --git"))
    .filter((plain) => !plain.startsWith("--- "))
    .filter((plain) => !plain.startsWith("+++ "));
  const metaHtml = metaLines.length > 0 ? `<span class="file-meta">${escapeHtml(metaLines.join(" | "))}</span>` : "";
  const statsHtml = `<span class="file-stats"><span class="file-stat-add">+${addedLines}</span><span class="file-stat-del">-${deletedLines}</span></span>`;
  return `<summary class="diff-file-summary"><span class="file-header"><span class="file-toggle" aria-hidden="true"></span><span class="file-title">${escapeHtml(
    title
  )}</span>${metaHtml}</span>${statsHtml}</summary>`;
};

const renderDiffLine = (
  line: DiffLine,
  contentHtml: string,
  copyAccent?: string,
  moved?: boolean
): string => {
  const classes = ["line", line.kind, "has-prefix"];
  const isCopiedAdd = line.kind === "add" && line.copyTag;
  if (isCopiedAdd) {
    if (copyAccent) {
      classes.push("copy-accent");
    } else if (!line.hasBgAnsi) {
      classes.push("copied");
    }
  }
  if (moved) {
    classes.push("moved");
  }
  return `<span class="${classes.join(" ")}"><span class="line-prefix">${renderLineNumbers(
    line
  )}</span><span class="line-content">${contentHtml}</span></span>`;
};

type FoldSegmentMap = Map<number, { endIndex: number; summary: string }>;

const renderRow = (diffHtml: string, panelHtml?: string): string =>
  `<div class="diff-row"><div class="info-cell">${panelHtml ?? ""}</div><div class="diff-cell">${diffHtml}</div></div>`;

const renderSideBySideRow = (leftHtml: string, rightHtml: string, panelHtml?: string): string =>
  `<div class="diff-row side-row"><div class="info-cell">${panelHtml ?? ""}</div><div class="diff-cell left">${leftHtml}</div><div class="diff-cell right">${rightHtml}</div></div>`;

const renderSideBySideMetaRow = (metaHtml: string): string =>
  `<div class="diff-row side-row"><div class="info-cell"></div><div class="diff-cell span-2">${metaHtml}</div></div>`;

const renderSideBySideFoldSummaryRow = (summary: string): string =>
  `<summary class="diff-row side-row"><span class="info-cell"></span><span class="diff-cell span-2">${renderFoldSummaryInline(
    summary
  )}</span></summary>`;

const renderSideBySideLine = (
  line: DiffLine,
  lineIndex: number,
  side: "left" | "right",
  rendered: Map<number, LineRenderInfo>,
  copyAccent: string | undefined
): string => {
  const info = rendered.get(lineIndex);
  const content = info?.content ?? escapeHtml(line.plain.slice(1));
  const moved = info?.moved ?? false;
  const classes = ["line", line.kind, "has-prefix"];
  const allowCopy = side === "right" && line.kind === "add" && line.copyTag;
  if (allowCopy) {
    if (copyAccent) {
      classes.push("copy-accent");
    } else if (!line.hasBgAnsi) {
      classes.push("copied");
    }
  }
  if (moved) {
    classes.push("moved");
  }
  const lineNo = side === "left" ? line.oldLineNo : line.newLineNo;
  const lineNoHtml = renderLineNumber(lineNo, side === "left" ? "old" : "new");
  return `<span class="${classes.join(" ")}"><span class="line-prefix">${lineNoHtml}</span><span class="line-content">${content}</span></span>`;
};

const renderEmptySideLine = (side: "left" | "right"): string =>
  `<span class="line empty has-prefix"><span class="line-prefix">${renderLineNumber(
    undefined,
    side === "left" ? "old" : "new"
  )}</span><span class="line-content"></span></span>`;

const renderUnifiedHunk = (
  lines: DiffLine[],
  foldSegments: FoldSegmentMap,
  rendered: Map<number, LineRenderInfo>,
  copyRunPanels: Map<number, string>,
  copyAccent: string | undefined
): string => {
  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const fold = foldSegments.get(index);
    if (fold) {
      const foldedLines = lines
        .slice(index, fold.endIndex + 1)
        .map((line, lineIndex) => {
          const absoluteIndex = index + lineIndex;
          const info = rendered.get(absoluteIndex);
          if (info) {
            return renderDiffLine(line, info.content, copyAccent, info.moved);
          }
          return renderMetaLine(line);
        })
        .join("\n");
      const diffHtml = `<details class="pure-copy">${renderFoldSummaryLine(fold.summary)}${foldedLines}</details>`;
      output.push(renderRow(diffHtml));
      index = fold.endIndex + 1;
      continue;
    }
    const line = lines[index];
    const info = rendered.get(index);
    const lineHtml = info ? renderDiffLine(line, info.content, copyAccent, info.moved) : renderMetaLine(line);
    const panelHtml = copyRunPanels.get(index);
    output.push(renderRow(lineHtml, panelHtml));
    index += 1;
  }
  return output.join("\n");
};

const renderSideBySideRows = (
  lines: DiffLine[],
  baseIndex: number,
  rendered: Map<number, LineRenderInfo>,
  copyRunPanels: Map<number, string>,
  copyAccent: string | undefined
): string[] => {
  const rows: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const absoluteIndex = baseIndex + index;
    if (line.kind === "meta") {
      rows.push(renderSideBySideMetaRow(renderMetaLine(line)));
      index += 1;
      continue;
    }
    if (line.kind === "context") {
      const leftHtml = renderSideBySideLine(line, absoluteIndex, "left", rendered, copyAccent);
      const rightHtml = renderSideBySideLine(line, absoluteIndex, "right", rendered, copyAccent);
      rows.push(renderSideBySideRow(leftHtml, rightHtml, copyRunPanels.get(absoluteIndex)));
      index += 1;
      continue;
    }
    if (line.kind === "del") {
      const delLines: DiffLine[] = [];
      const delIndexes: number[] = [];
      while (index < lines.length && lines[index].kind === "del") {
        delLines.push(lines[index]);
        delIndexes.push(baseIndex + index);
        index += 1;
      }
      const addLines: DiffLine[] = [];
      const addIndexes: number[] = [];
      while (index < lines.length && lines[index].kind === "add") {
        addLines.push(lines[index]);
        addIndexes.push(baseIndex + index);
        index += 1;
      }
      const total = Math.max(delLines.length, addLines.length);
      for (let offset = 0; offset < total; offset += 1) {
        const leftLine = delLines[offset];
        const rightLine = addLines[offset];
        const leftIndex = leftLine ? delIndexes[offset] : undefined;
        const rightIndex = rightLine ? addIndexes[offset] : undefined;
        const leftHtml = leftLine
          ? renderSideBySideLine(leftLine, leftIndex ?? 0, "left", rendered, copyAccent)
          : renderEmptySideLine("left");
        const rightHtml = rightLine
          ? renderSideBySideLine(rightLine, rightIndex ?? 0, "right", rendered, copyAccent)
          : renderEmptySideLine("right");
        rows.push(renderSideBySideRow(leftHtml, rightHtml, rightIndex !== undefined ? copyRunPanels.get(rightIndex) : undefined));
      }
      continue;
    }
    if (line.kind === "add") {
      const addLines: DiffLine[] = [];
      const addIndexes: number[] = [];
      while (index < lines.length && lines[index].kind === "add") {
        addLines.push(lines[index]);
        addIndexes.push(baseIndex + index);
        index += 1;
      }
      addLines.forEach((addLine, offset) => {
        const addIndex = addIndexes[offset];
        const leftHtml = renderEmptySideLine("left");
        const rightHtml = renderSideBySideLine(addLine, addIndex, "right", rendered, copyAccent);
        rows.push(renderSideBySideRow(leftHtml, rightHtml, copyRunPanels.get(addIndex)));
      });
      continue;
    }
    index += 1;
  }
  return rows;
};

const renderSideBySideHunk = (
  lines: DiffLine[],
  foldSegments: FoldSegmentMap,
  rendered: Map<number, LineRenderInfo>,
  copyRunPanels: Map<number, string>,
  copyAccent: string | undefined
): string => {
  const output: string[] = [];
  const folds = Array.from(foldSegments.entries()).sort(([a], [b]) => a - b);
  let cursor = 0;
  folds.forEach(([startIndex, segment]) => {
    if (cursor < startIndex) {
      output.push(
        ...renderSideBySideRows(
          lines.slice(cursor, startIndex),
          cursor,
          rendered,
          copyRunPanels,
          copyAccent
        )
      );
    }
    const foldedRows = renderSideBySideRows(
      lines.slice(startIndex, segment.endIndex + 1),
      startIndex,
      rendered,
      copyRunPanels,
      copyAccent
    ).join("\n");
    output.push(`<details class="pure-copy">${renderSideBySideFoldSummaryRow(segment.summary)}${foldedRows}</details>`);
    cursor = segment.endIndex + 1;
  });
  if (cursor < lines.length) {
    output.push(...renderSideBySideRows(lines.slice(cursor), cursor, rendered, copyRunPanels, copyAccent));
  }
  return output.join("\n");
};

const renderHtml = async (files: FileDiff[], options: HtmlRenderOptions): Promise<string> => {
  const copyAccent = extractCopyAccent(options.copyColor);
  const accent = options.copyColor ? copyAccent ?? defaultCopyAccent : undefined;
  const sourceCache: SourceFileCache = new Map();
  const fileNavEntries = buildFileNavEntries(files);
  const fileTreeHtml = renderFileTreePanel(fileNavEntries);
  const content: string[] = [buildHtmlHead(options, copyAccent, fileTreeHtml)];
  content.push('<div class="diff-file-list">');
  for (const [fileIndex, file] of files.entries()) {
    const unified: string[] = [];
    const sideBySide: string[] = [];
    const lang = resolveLanguage(file);
    const fileLabel = stripDiffPrefix(file.toFile) ?? stripDiffPrefix(file.fromFile);
    const fileNav = fileNavEntries[fileIndex];
    const anchorId = fileNav?.anchor ?? buildFileAnchorId(fileLabel ?? `file-${fileIndex + 1}`, fileIndex);
    const addedLines = fileNav?.addedLines ?? 0;
    const deletedLines = fileNav?.deletedLines ?? 0;
    for (const [hunkIndex, hunk] of file.hunks.entries()) {
      const hunkHeader = renderMetaLine(hunk.headerLine);
      unified.push(renderRow(hunkHeader));
      sideBySide.push(renderSideBySideMetaRow(hunkHeader));
      const foldMap: FoldSegmentMap = new Map();
      hunk.foldSegments.forEach((segment) => {
        foldMap.set(segment.startIndex, { endIndex: segment.endIndex, summary: segment.summary });
      });
      const rendered = await buildLineRenderInfo(hunk.lines, options, lang, fileLabel, sourceCache);
      const copyRunDetails = await buildCopyRunDetails(hunk.lines, foldMap, options, sourceCache);
      const unifiedPanels = buildCopyRunPanelMap(copyRunDetails, `copy-u-${fileIndex}-${hunkIndex}`);
      const sidePanels = buildCopyRunPanelMap(copyRunDetails, `copy-s-${fileIndex}-${hunkIndex}`);
      unified.push(renderUnifiedHunk(hunk.lines, foldMap, rendered, unifiedPanels, accent));
      sideBySide.push(renderSideBySideHunk(hunk.lines, foldMap, rendered, sidePanels, accent));
    }
    content.push(
      `<details class="diff-file" open id="${anchorId}">${renderFileSummary(
        file,
        addedLines,
        deletedLines
      )}`
    );
    content.push('<div class="diff-file-body">');
    content.push('<div class="diff-view diff-view-unified"><div class="diff-grid diff-grid-unified">');
    content.push(...unified);
    content.push("</div></div>");
    content.push('<div class="diff-view diff-view-side"><div class="diff-grid diff-grid-side">');
    content.push(...sideBySide);
    content.push("</div></div>");
    content.push("</div>");
    content.push("</details>");
  }
  content.push("</div>");
  content.push(buildHtmlFooter());
  return content.join("\n");
};

export { renderHtml };
export type { HtmlRenderOptions };
