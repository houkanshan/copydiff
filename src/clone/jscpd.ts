import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
  cache: boolean;
  verbose: boolean;
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
  const args = [
    "jscpd",
    "--reporters",
    "json",
    "--output",
    outputDir,
    "--min-lines",
    options.minLines.toString(),
    "--absolute"
  ];

  if (options.ignore.length > 0) {
    args.push("--ignore", options.ignore.join(","));
  }

  const proc = spawn(["bunx", ...args], {
    cwd: options.repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (options.verbose) {
    if (stdoutText.trim()) {
      process.stdout.write(stdoutText);
    }
    if (stderrText.trim()) {
      process.stderr.write(stderrText);
    }
  }

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
  return normalizeClonePairs(payload);
};

const buildCacheOptions = (options: JscpdRunOptions & { jscpdVersion?: string }): CacheOptions => ({
  ignore: options.ignore,
  minLines: options.minLines,
  jscpdVersion: options.jscpdVersion
});

export { buildCacheOptions, runJscpd };
export type { ClonePair, CloneRegion, JscpdRunOptions };
