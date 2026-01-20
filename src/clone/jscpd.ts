import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { spawn } from "bun";

import type { CacheOptions } from "../cache";
import { validateClonePairs } from "./tokenizer";

const getTempDir = async (): Promise<string> => {
  const base = process.env.TMPDIR ?? "/tmp";
  return mkdtemp(path.join(base, "copydiff-jscpd-"));
};

type CloneRegion = { file: string; startLine: number; endLine: number };

type ClonePair = { a: CloneRegion; b: CloneRegion; similarity: number };

type JscpdRunOptions = {
  repoRoot: string;
  ignore: string[];
  minLines: number;
  minTokens: number;
  pattern?: string;
  cache: boolean;
  verbose: boolean;
};

type JscpdCacheOptionsInput = JscpdRunOptions & {
  scanScope: "all" | "changed-types";
  scanPattern?: string;
  jscpdVersion?: string;
};

const normalizeClonePath = (repoRoot: string, filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/");
  if (!path.isAbsolute(filePath)) {
    return normalized;
  }
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedFile = path.resolve(filePath);
  if (resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedFile).split(path.sep).join("/");
  }
  return normalized;
};

const logVerbose = (options: JscpdRunOptions, message: string): void => {
  if (options.verbose) {
    process.stderr.write(`[copydiff] ${message}\n`);
  }
};

const streamToText = async (
  stream: ReadableStream<Uint8Array> | null,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  if (!stream) {
    return "";
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    const chunkText = decoder.decode(value, { stream: true });
    text += chunkText;
    if (onChunk && chunkText) {
      onChunk(chunkText);
    }
  }
  const tail = decoder.decode();
  if (tail) {
    text += tail;
    if (onChunk) {
      onChunk(tail);
    }
  }
  return text;
};

const isLineLengthBalanced = (pair: ClonePair): boolean => {
  const linesA = pair.a.endLine - pair.a.startLine;
  const linesB = pair.b.endLine - pair.b.startLine;
  return Math.abs(linesA - linesB) <= Math.max(linesA, linesB) * 0.5;
};

const normalizeClonePairs = (payload: unknown): ClonePair[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const duplicates = root.duplicates as
    | Array<{
        lines: number;
        firstFile?: { name?: string; start?: number; end?: number; startLoc?: { line?: number }; endLoc?: { line?: number } };
        secondFile?: { name?: string; start?: number; end?: number; startLoc?: { line?: number }; endLoc?: { line?: number } };
      }>
    | undefined;
  if (Array.isArray(duplicates)) {
    return duplicates
      .map((dup) => {
        const first = dup.firstFile;
        const second = dup.secondFile;
        const firstStart = first?.startLoc?.line ?? first?.start;
        const firstEnd = first?.endLoc?.line ?? first?.end;
        const secondStart = second?.startLoc?.line ?? second?.start;
        const secondEnd = second?.endLoc?.line ?? second?.end;
        if (!first?.name || !second?.name || !firstStart || !firstEnd || !secondStart || !secondEnd) {
          return undefined;
        }
        const similarity = dup.lines ? dup.lines / Math.max(firstEnd - firstStart + 1, secondEnd - secondStart + 1) : 1;
        return {
          a: { file: first.name, startLine: firstStart, endLine: firstEnd },
          b: { file: second.name, startLine: secondStart, endLine: secondEnd },
          similarity
        } satisfies ClonePair;
      })
      .filter((item): item is ClonePair => item !== undefined);
  }

  const clones = root.clones as
    | Array<{
        duplicatedLines?: number;
        instances?: Array<{ file?: string; start?: number; end?: number }>;
      }>
    | undefined;
  if (Array.isArray(clones)) {
    const pairs: ClonePair[] = [];
    clones.forEach((clone) => {
      const [first, second] = clone.instances ?? [];
      if (!first?.file || !second?.file || !first.start || !first.end || !second.start || !second.end) {
        return;
      }
      const similarity = clone.duplicatedLines
        ? clone.duplicatedLines / Math.max(first.end - first.start + 1, second.end - second.start + 1)
        : 1;
      pairs.push({
        a: { file: first.file, startLine: first.start, endLine: first.end },
        b: { file: second.file, startLine: second.start, endLine: second.end },
        similarity
      });
    });
    return pairs;
  }

  return [];
};

const resolveReportPath = async (outputDir: string): Promise<string | undefined> => {
  const entries = await readdir(outputDir);
  const jsonEntry = entries.find((entry) => entry.endsWith(".json"));
  if (!jsonEntry) {
    return undefined;
  }
  return path.join(outputDir, jsonEntry);
};

const runJscpd = async (options: JscpdRunOptions): Promise<ClonePair[]> => {
  const outputDir = await getTempDir();
  const localBin = path.join(
    options.repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "jscpd.cmd" : "jscpd"
  );
  try {
    await access(localBin);
  } catch {
    logVerbose(options, "jscpd not found in node_modules; bunx may download it");
  }
  const args = [
    "jscpd",
    "--reporters",
    "json",
    "--output",
    outputDir,
    "--min-lines",
    options.minLines.toString(),
    "--min-tokens",
    options.minTokens.toString(),
    "--absolute",
    "--gitignore"
  ];

  if (options.pattern) {
    args.push("--pattern", options.pattern);
  }

  if (options.ignore.length > 0) {
    args.push("--ignore", options.ignore.join(","));
  }

  args.push(".");
  logVerbose(options, `running bunx ${args.join(" ")}`);
  const proc = spawn(["bunx", ...args], {
    cwd: options.repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const startTime = Date.now();
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  if (options.verbose) {
    slowTimer = setTimeout(() => {
      process.stderr.write("[copydiff] jscpd still running after 60s\n");
    }, 60000);
  }
  let stdoutText = "";
  let stderrText = "";
  let exitCode = 0;
  try {
    if (options.verbose) {
      const logChunk = (chunk: string) => {
        process.stderr.write(chunk);
      };
      [stdoutText, stderrText, exitCode] = await Promise.all([
        streamToText(proc.stdout, logChunk),
        streamToText(proc.stderr, logChunk),
        proc.exited
      ]);
    } else {
      [stdoutText, stderrText, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited
      ]);
    }
  } finally {
    if (slowTimer) {
      clearTimeout(slowTimer);
    }
  }

  logVerbose(options, `jscpd completed in ${Math.round((Date.now() - startTime) / 1000)}s`);

  if (exitCode !== 0) {
    await rm(outputDir, { recursive: true, force: true });
    throw new Error(`jscpd failed with exit code ${exitCode}`);
  }

  const reportPath = await resolveReportPath(outputDir);
  if (!reportPath) {
    await rm(outputDir, { recursive: true, force: true });
    throw new Error("jscpd report not found");
  }
  const data = await readFile(reportPath, "utf8");
  const payload = JSON.parse(data) as unknown;
  await rm(outputDir, { recursive: true, force: true });
  const allPairs = normalizeClonePairs(payload).map((pair) => ({
    a: { ...pair.a, file: normalizeClonePath(options.repoRoot, pair.a.file) },
    b: { ...pair.b, file: normalizeClonePath(options.repoRoot, pair.b.file) },
    similarity: pair.similarity
  }));
  const balancedPairs = allPairs.filter((pair) => {
    if (isLineLengthBalanced(pair)) {
      return true;
    }
    const linesA = pair.a.endLine - pair.a.startLine;
    const linesB = pair.b.endLine - pair.b.startLine;
    logVerbose(
      options,
      `filtered clone: ${pair.a.file}:${pair.a.startLine}-${pair.a.endLine} (${linesA} lines) vs ${pair.b.file}:${pair.b.startLine}-${pair.b.endLine} (${linesB} lines) - line count mismatch`
    );
    return false;
  });

  // Apply token-based validation to filter false positives
  logVerbose(options, `validating ${balancedPairs.length} clone pairs with tokenizer`);
  const { valid } = await validateClonePairs(balancedPairs, {
    repoRoot: options.repoRoot,
    minSimilarity: 0.5,
    minTokens: options.minTokens,
    verbose: options.verbose
  });
  logVerbose(options, `${valid.length}/${balancedPairs.length} pairs passed token validation`);
  return valid;
};

const buildCacheOptions = (options: JscpdCacheOptionsInput): CacheOptions => ({
  ignore: options.ignore,
  minLines: options.minLines,
  minTokens: options.minTokens,
  scanScope: options.scanScope,
  scanPaths: options.scanPaths,
  scanPattern: options.scanPattern,
  jscpdVersion: options.jscpdVersion
});

export { buildCacheOptions, normalizeClonePath, runJscpd };
export type { ClonePair, CloneRegion, JscpdRunOptions };
