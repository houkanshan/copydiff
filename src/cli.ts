#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCacheOptions, normalizeClonePath, runJscpd } from "./clone/jscpd";
import { getCachePath, readCache, writeCache } from "./cache";
import { parseDiff } from "./diff/parse";
import type { FileDiff } from "./diff/parse";
import { getHeadSha, getRepoRoot, parseGitColorSpec, readGitColor, runGitDiff } from "./git";
import type { DiffConfigMode } from "./git";
import { applyCopyOverlay } from "./overlay";
import { renderHtml } from "./render/html";
import { renderTerminal } from "./render/terminal";

const defaultIgnore = [".git", "node_modules", "dist", "build", ".next", "out", "coverage"];

type CliOptions = {
  stdin: boolean;
  html?: string;
  noFoldPure: boolean;
  copyColorSpec?: string;
  copyColorDisabled: boolean;
  pureThreshold: number;
  minFoldLines: number;
  minLines: number;
  minTokens: number;
  ignore: string[];
  cache: boolean;
  verbose: boolean;
  scanScope: "all" | "changed-types";
  diffConfig: DiffConfigMode;
  range?: string;
};

const usageText = `Usage:
  copydiff --stdin [options]
  copydiff <range> [options]

Options:
  --stdin                read diff from stdin
  --html <path>          write a light-mode HTML diff
  --no-fold-pure         disable folding for pure copies
  --copy-color <spec>    copy highlight color in git syntax (default color.diff.newMoved)
  --no-copy-color        disable copy highlighting
  --pure-threshold <n>   similarity threshold for pure copies (default 0.98)
  --min-fold-lines <n>   minimum lines to fold (default 12)
  --min-lines <n>        minimum lines for jscpd (default 8)
  --min-tokens <n>       minimum tokens for jscpd (default min-lines * 2)
  --ignore <globs>       ignored globs for jscpd (comma-separated)
  --cache <on|off>       enable clone cache (default on)
  --verbose              log jscpd output
  --diff-config <mode>   git diff config mode: force|respect (default force)
  --scan-scope <scope>   scan all or changed-types (default all)
  -h, --help             show help
`;

const logVerbose = (options: CliOptions, message: string): void => {
  if (options.verbose) {
    process.stderr.write(`[copydiff] ${message}\n`);
  }
};

const normalizeIgnorePatterns = (patterns: string[]): string[] => {
  const normalized = patterns.map((pattern) => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      return "";
    }
    const hasGlobChar = /[*?[\]{}!]/.test(trimmed);
    const hasPathSep = trimmed.includes("/");
    if (hasGlobChar || hasPathSep) {
      return trimmed;
    }
    return `**/${trimmed}/**`;
  });
  return Array.from(new Set(normalized)).filter(Boolean);
};

const stripDiffPrefix = (file: string): string | undefined => {
  if (file === "/dev/null") {
    return undefined;
  }
  if (file.length > 2 && file[1] === "/" && /[abciow]/.test(file[0])) {
    return file.slice(2);
  }
  return file;
};

const collectDiffFiles = (files: FileDiff[]): string[] => {
  const paths = new Set<string>();
  files.forEach((file) => {
    const target = stripDiffPrefix(file.toFile);
    if (target) {
      paths.add(target);
    }
  });
  return Array.from(paths).sort();
};

const collectDiffExtensions = (paths: string[]): string[] => {
  const exts = new Set<string>();
  paths.forEach((filePath) => {
    const ext = path.extname(filePath);
    if (!ext || ext === ".") {
      return;
    }
    const normalized = ext.slice(1).toLowerCase();
    if (normalized) {
      exts.add(normalized);
    }
  });
  return Array.from(exts).sort();
};

const buildPatternFromExtensions = (extensions: string[]): string | undefined => {
  if (extensions.length === 0) {
    return undefined;
  }
  if (extensions.length === 1) {
    return `**/*.${extensions[0]}`;
  }
  return `**/*.{${extensions.join(",")}}`;
};

const gitignoreLineToGlobs = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return [];
  }
  let raw = trimmed;
  const anchored = raw.startsWith("/");
  if (anchored) {
    raw = raw.slice(1);
  }
  const isDir = raw.endsWith("/");
  raw = raw.replace(/\/+$/, "");
  if (!raw) {
    return [];
  }
  const hasGlob = /[*?[\]{}!]/.test(raw);
  const hasSlash = raw.includes("/");
  let glob = raw;
  if (!anchored) {
    glob = `**/${raw}`;
  }
  if (isDir) {
    return [`${glob}/**`];
  }
  if (hasGlob) {
    return [glob];
  }
  if (hasSlash || anchored) {
    return [glob, `${glob}/**`];
  }
  return [glob, `${glob}/**`];
};

const loadGitignorePatterns = async (repoRoot: string): Promise<string[]> => {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  let data: string;
  try {
    data = await readFile(gitignorePath, "utf8");
  } catch {
    return [];
  }
  const globs: string[] = [];
  for (const line of data.split(/\r?\n/)) {
    globs.push(...gitignoreLineToGlobs(line));
  }
  return Array.from(new Set(globs)).filter(Boolean);
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    stdin: false,
    html: undefined,
    noFoldPure: false,
    copyColorSpec: undefined,
    copyColorDisabled: false,
    pureThreshold: 0.98,
    minFoldLines: 12,
    minLines: 8,
    minTokens: 16,
    ignore: defaultIgnore,
    cache: true,
    verbose: false,
    scanScope: "all",
    diffConfig: "force",
    range: undefined
  };
  let minTokensSet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--stdin":
        options.stdin = true;
        break;
      case "--html": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--html requires a path");
        }
        options.html = value;
        index += 1;
        break;
      }
      case "--no-fold-pure":
        options.noFoldPure = true;
        break;
      case "--copy-color": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--copy-color requires a value");
        }
        options.copyColorSpec = value;
        options.copyColorDisabled = false;
        index += 1;
        break;
      }
      case "--no-copy-color":
        options.copyColorDisabled = true;
        options.copyColorSpec = undefined;
        break;
      case "--pure-threshold": {
        const value = argv[index + 1];
        if (!value || Number.isNaN(Number.parseFloat(value))) {
          throw new Error("--pure-threshold requires a number");
        }
        options.pureThreshold = Number.parseFloat(value);
        index += 1;
        break;
      }
      case "--min-fold-lines": {
        const value = argv[index + 1];
        if (!value || Number.isNaN(Number.parseInt(value, 10))) {
          throw new Error("--min-fold-lines requires a number");
        }
        options.minFoldLines = Number.parseInt(value, 10);
        index += 1;
        break;
      }
      case "--min-lines": {
        const value = argv[index + 1];
        if (!value || Number.isNaN(Number.parseInt(value, 10))) {
          throw new Error("--min-lines requires a number");
        }
        options.minLines = Number.parseInt(value, 10);
        if (!minTokensSet) {
          options.minTokens = Math.max(1, options.minLines * 2);
        }
        index += 1;
        break;
      }
      case "--min-tokens": {
        const value = argv[index + 1];
        if (!value || Number.isNaN(Number.parseInt(value, 10))) {
          throw new Error("--min-tokens requires a number");
        }
        const parsed = Number.parseInt(value, 10);
        if (parsed < 1) {
          throw new Error("--min-tokens must be >= 1");
        }
        options.minTokens = parsed;
        minTokensSet = true;
        index += 1;
        break;
      }
      case "--ignore": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--ignore requires a list");
        }
        options.ignore = value.split(",").map((item) => item.trim()).filter(Boolean);
        index += 1;
        break;
      }
      case "--cache": {
        const value = argv[index + 1];
        if (!value || !["on", "off"].includes(value)) {
          throw new Error("--cache requires on|off");
        }
        options.cache = value === "on";
        index += 1;
        break;
      }
      case "--verbose":
        options.verbose = true;
        break;
      case "--scan-scope": {
        const value = argv[index + 1];
        if (!value || (value !== "all" && value !== "changed-types")) {
          throw new Error("--scan-scope requires all|changed-types");
        }
        options.scanScope = value;
        index += 1;
        break;
      }
      case "--diff-config": {
        const value = argv[index + 1];
        if (!value || (value !== "force" && value !== "respect")) {
          throw new Error("--diff-config requires force|respect");
        }
        options.diffConfig = value;
        index += 1;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        if (!options.range) {
          options.range = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  return options;
};

const readStdin = async (): Promise<string> => {
  const response = new Response(Bun.stdin);
  return response.text();
};

const run = async (): Promise<number> => {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    process.stdout.write(usageText);
    return 0;
  }
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid arguments";
    process.stderr.write(`${message}\n`);
    process.stderr.write(usageText);
    return 2;
  }
  let diffText: string | undefined;
  if (options.stdin) {
    logVerbose(options, "reading diff from stdin");
    diffText = await readStdin();
  } else if (options.range) {
    logVerbose(options, `running git diff ${options.range}`);
    diffText = await runGitDiff(options.range, options.diffConfig);
  } else {
    diffText = undefined;
  }
  if (!diffText) {
    process.stderr.write(usageText);
    return 2;
  }

  const parsed = parseDiff(diffText);
  logVerbose(options, `parsed ${parsed.files.length} files from diff`);
  if (parsed.files.length === 0) {
    process.stdout.write(diffText);
    return 0;
  }
  const diffFiles = collectDiffFiles(parsed.files);
  const diffExtensions = collectDiffExtensions(diffFiles);

  let clonePairs = [];
  let repoRoot: string | undefined;
  const hasDiffTargets = diffFiles.length > 0;
  if (options.scanScope === "changed-types" && !hasDiffTargets) {
    logVerbose(options, "scan-scope changed-types with no target files; skipping clone scan");
  } else {
    try {
      logVerbose(options, "loading clone pairs");
      const resolvedRepoRoot = await getRepoRoot();
      repoRoot = resolvedRepoRoot;
      const gitignorePatterns = await loadGitignorePatterns(resolvedRepoRoot);
      const userIgnore = normalizeIgnorePatterns(options.ignore);
      options.ignore = Array.from(new Set([...userIgnore, ...gitignorePatterns]));
      logVerbose(
        options,
        `ignore patterns: ${options.ignore.join(",")} (gitignore on, scan-scope ${options.scanScope})`
      );
      const headSha = await getHeadSha();
      const scanPattern =
        options.scanScope === "changed-types" ? buildPatternFromExtensions(diffExtensions) : undefined;
      if (options.scanScope === "changed-types") {
        if (scanPattern) {
          logVerbose(options, `scan pattern: ${scanPattern}`);
        } else {
          logVerbose(options, "scan-scope changed-types with no extensions; scanning all files");
        }
      }
      const cacheOptions = buildCacheOptions({
        repoRoot: resolvedRepoRoot,
        ignore: options.ignore,
        minLines: options.minLines,
        minTokens: options.minTokens,
        scanScope: options.scanScope,
        scanPattern,
        cache: options.cache,
        verbose: options.verbose
      });
      if (options.cache) {
        logVerbose(options, "checking clone cache");
        const cachePath = await getCachePath(resolvedRepoRoot, headSha, cacheOptions);
        const cached = await readCache(cachePath);
          if (cached) {
            logVerbose(options, `using clone cache with ${cached.length} pairs`);
            clonePairs = cached.map((pair) => ({
              a: { ...pair.a, file: normalizeClonePath(resolvedRepoRoot, pair.a.file) },
              b: { ...pair.b, file: normalizeClonePath(resolvedRepoRoot, pair.b.file) },
              similarity: pair.similarity
            }));
          } else {
          logVerbose(options, "cache miss, running jscpd");
          clonePairs = await runJscpd({
            repoRoot: resolvedRepoRoot,
            ignore: options.ignore,
            minLines: options.minLines,
            minTokens: options.minTokens,
            pattern: scanPattern,
            cache: options.cache,
            verbose: options.verbose
          });
          await writeCache(cachePath, clonePairs);
        }
      } else {
        logVerbose(options, "running jscpd without cache");
        clonePairs = await runJscpd({
          repoRoot: resolvedRepoRoot,
          ignore: options.ignore,
          minLines: options.minLines,
          minTokens: options.minTokens,
          pattern: scanPattern,
          cache: options.cache,
          verbose: options.verbose
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "jscpd failed";
      process.stderr.write(`${message}\n`);
      return 3;
    }
  }

  logVerbose(options, `loaded ${clonePairs.length} clone pairs`);
  const overlay = applyCopyOverlay(parsed.files, clonePairs, {
    pureThreshold: options.pureThreshold,
    minFoldLines: options.noFoldPure ? Number.POSITIVE_INFINITY : options.minFoldLines
  });

  let copyColor: string | undefined;
  if (!options.copyColorDisabled) {
    if (options.copyColorSpec) {
      copyColor = await parseGitColorSpec(options.copyColorSpec);
      if (!copyColor) {
        process.stderr.write(`Invalid copy color: ${options.copyColorSpec}\n`);
        return 2;
      }
    } else {
      copyColor = await readGitColor("color.diff.newMoved");
    }
  }

  logVerbose(options, "rendering terminal output");
  const terminalOutput = renderTerminal(overlay.files, {
    copyColor,
    dimCopy: !copyColor
  });
  process.stdout.write(terminalOutput);

  if (options.html) {
    logVerbose(options, `writing html output to ${options.html}`);
    const html = await renderHtml(overlay.files, {
      title: "copydiff",
      copyColor,
      debug: options.verbose,
      repoRoot
    });
    const outputPath = path.resolve(options.html);
    await writeFile(outputPath, html, "utf8");
  }

  return 0;
};

const exitCode = await run();
process.exit(exitCode);
