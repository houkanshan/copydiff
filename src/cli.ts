#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCacheOptions, runJscpd } from "./clone/jscpd";
import { getCachePath, readCache, writeCache } from "./cache";
import { parseDiff } from "./diff/parse";
import { getHeadSha, getRepoRoot, runGitDiff } from "./git";
import type { DiffConfigMode } from "./git";
import { applyCopyOverlay } from "./overlay";
import { renderHtml } from "./render/html";
import { renderTerminal } from "./render/terminal";

const defaultIgnore = [".git", "node_modules", "dist", "build", ".next", "out", "coverage"];

type CliOptions = {
  stdin: boolean;
  html?: string;
  noFoldPure: boolean;
  pureThreshold: number;
  minFoldLines: number;
  minLines: number;
  ignore: string[];
  cache: boolean;
  verbose: boolean;
  diffConfig: DiffConfigMode;
  range?: string;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    stdin: false,
    html: undefined,
    noFoldPure: false,
    pureThreshold: 0.98,
    minFoldLines: 12,
    minLines: 8,
    ignore: defaultIgnore,
    cache: true,
    verbose: false,
    diffConfig: "force",
    range: undefined
  };

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
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid arguments";
    process.stderr.write(`${message}\n`);
    return 2;
  }

  const diffText = options.stdin
    ? await readStdin()
    : options.range
      ? await runGitDiff(options.range, options.diffConfig)
      : undefined;
  if (!diffText) {
    process.stderr.write("Usage: copydiff --stdin | copydiff <range>\n");
    return 2;
  }

  const parsed = parseDiff(diffText);
  if (parsed.files.length === 0) {
    process.stdout.write(diffText);
    return 0;
  }

  let clonePairs = [];
  try {
    const repoRoot = await getRepoRoot();
    const headSha = await getHeadSha();
    const cacheOptions = buildCacheOptions({
      repoRoot,
      ignore: options.ignore,
      minLines: options.minLines,
      cache: options.cache,
      verbose: options.verbose
    });
    if (options.cache) {
      const cachePath = await getCachePath(repoRoot, headSha, cacheOptions);
      const cached = await readCache(cachePath);
      if (cached) {
        clonePairs = cached;
      } else {
        clonePairs = await runJscpd({
          repoRoot,
          ignore: options.ignore,
          minLines: options.minLines,
          cache: options.cache,
          verbose: options.verbose
        });
        await writeCache(cachePath, clonePairs);
      }
    } else {
      clonePairs = await runJscpd({
        repoRoot,
        ignore: options.ignore,
        minLines: options.minLines,
        cache: options.cache,
        verbose: options.verbose
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "jscpd failed";
    process.stderr.write(`${message}\n`);
    return 3;
  }

  const overlay = applyCopyOverlay(parsed.files, clonePairs, {
    pureThreshold: options.pureThreshold,
    minFoldLines: options.noFoldPure ? Number.POSITIVE_INFINITY : options.minFoldLines
  });

  const terminalOutput = renderTerminal(overlay.files);
  process.stdout.write(terminalOutput);

  if (options.html) {
    const html = renderHtml(overlay.files, { title: "copydiff" });
    const outputPath = path.resolve(options.html);
    await writeFile(outputPath, html, "utf8");
  }

  return 0;
};

const exitCode = await run();
process.exit(exitCode);
