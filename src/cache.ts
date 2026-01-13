import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import type { ClonePair } from "./clone/jscpd";

type CacheOptions = {
  ignore: string[];
  minLines: number;
  jscpdVersion?: string;
};

const hashOptions = (options: CacheOptions): string => {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(options));
  return hash.digest("hex");
};

const getCachePath = async (repoRoot: string, headSha: string, options: CacheOptions): Promise<string> => {
  const cacheDir = path.join(repoRoot, ".git", "copydiff", "cache");
  await mkdir(cacheDir, { recursive: true });
  const hash = hashOptions(options);
  return path.join(cacheDir, `${headSha}-${hash}.json`);
};

const readCache = async (cachePath: string): Promise<ClonePair[] | undefined> => {
  try {
    const data = await readFile(cachePath, "utf8");
    return JSON.parse(data) as ClonePair[];
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
};

const writeCache = async (cachePath: string, pairs: ClonePair[]): Promise<void> => {
  await writeFile(cachePath, JSON.stringify(pairs, undefined, 2), "utf8");
};

export { getCachePath, readCache, writeCache };
export type { CacheOptions };
