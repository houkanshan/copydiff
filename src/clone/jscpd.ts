import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { spawn } from "bun";

import type { CacheOptions } from "../cache";

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

const normalizeClonePairs = (payload: unknown): ClonePair[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const duplicates = root.duplicates as
    | Array<{
        lines: number;
        firstFile?: { name?: string; start?: number; end?: number };
        secondFile?: { name?: string; start?: number; end?: number };
      }>
    | undefined;
  if (Array.isArray(duplicates)) {
    return duplicates
      .map((dup) => {
        const first = dup.firstFile;
        const second = dup.secondFile;
        if (!first?.name || !second?.name || !first.start || !first.end || !second.start || !second.end) {
          return undefined;
        }
        const similarity = dup.lines ? dup.lines / Math.max(first.end - first.start + 1, second.end - second.start + 1) : 1;
        return {
          a: { file: first.name, startLine: first.start, endLine: first.end },
          b: { file: second.name, startLine: second.start, endLine: second.end },
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
  return normalizeClonePairs(payload).map((pair) => ({
    a: { ...pair.a, file: normalizeClonePath(options.repoRoot, pair.a.file) },
    b: { ...pair.b, file: normalizeClonePath(options.repoRoot, pair.b.file) },
    similarity: pair.similarity
  }));
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
