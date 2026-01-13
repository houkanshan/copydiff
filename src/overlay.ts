import type { ClonePair, CloneRegion } from "./clone/jscpd";
import type { CopyTag, DiffLine, FileDiff, FoldSegment, Hunk } from "./diff/parse";

type OverlayOptions = {
  pureThreshold: number;
  minFoldLines: number;
};

type AddedLineIndex = Map<string, Map<number, DiffLine>>;

type AddedIntervals = Map<string, Array<{ start: number; end: number }>>;

type CopyOverlay = {
  files: FileDiff[];
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

const buildAddedLineIndex = (files: FileDiff[]): { index: AddedLineIndex; intervals: AddedIntervals } => {
  const index: AddedLineIndex = new Map();
  const intervals: AddedIntervals = new Map();

  files.forEach((file) => {
    const fileKey = stripDiffPrefix(file.toFile);
    if (!fileKey) {
      return;
    }
    const lineMap = new Map<number, DiffLine>();
    const fileIntervals: Array<{ start: number; end: number }> = [];

    file.hunks.forEach((hunk) => {
      let runStart: number | undefined;
      let previousLine: number | undefined;
      hunk.lines.forEach((line) => {
        if (line.kind === "add" && line.newLineNo !== undefined) {
          lineMap.set(line.newLineNo, line);
          if (runStart === undefined) {
            runStart = line.newLineNo;
            previousLine = line.newLineNo;
          } else if (previousLine !== undefined && line.newLineNo === previousLine + 1) {
            previousLine = line.newLineNo;
          } else {
            fileIntervals.push({ start: runStart, end: previousLine ?? runStart });
            runStart = line.newLineNo;
            previousLine = line.newLineNo;
          }
        } else if (runStart !== undefined) {
          fileIntervals.push({ start: runStart, end: previousLine ?? runStart });
          runStart = undefined;
          previousLine = undefined;
        }
      });
      if (runStart !== undefined) {
        fileIntervals.push({ start: runStart, end: previousLine ?? runStart });
      }
    });

    if (lineMap.size > 0) {
      index.set(fileKey, lineMap);
      intervals.set(fileKey, fileIntervals);
    }
  });

  return { index, intervals };
};

const intersects = (region: CloneRegion, interval: { start: number; end: number }): boolean =>
  region.startLine <= interval.end && region.endLine >= interval.start;

const regionIntersectsIntervals = (region: CloneRegion, intervals: AddedIntervals): boolean => {
  const fileKey = stripDiffPrefix(region.file);
  if (!fileKey) {
    return false;
  }
  const fileIntervals = intervals.get(fileKey);
  if (!fileIntervals) {
    return false;
  }
  return fileIntervals.some((interval) => intersects(region, interval));
};

const applyCopyTag = (
  addedIndex: AddedLineIndex,
  region: CloneRegion,
  source: CloneRegion,
  similarity: number,
  allowFold: boolean
): void => {
  const fileKey = stripDiffPrefix(region.file);
  if (!fileKey) {
    return;
  }
  const lineMap = addedIndex.get(fileKey);
  if (!lineMap) {
    return;
  }
  for (let lineNo = region.startLine; lineNo <= region.endLine; lineNo += 1) {
    const line = lineMap.get(lineNo);
    if (!line || line.hasBgAnsi) {
      continue;
    }
    const tag: CopyTag = {
      similarity,
      source,
      allowFold
    };
    line.copyTag = tag;
  }
};

const summarizeSources = (lines: DiffLine[]): string => {
  const counts = new Map<string, { source: CloneRegion; count: number }>();
  lines.forEach((line) => {
    const source = line.copyTag?.source;
    if (!source) {
      return;
    }
    const key = `${source.file}:${source.startLine}-${source.endLine}`;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { source, count: 1 });
    }
  });
  const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
  if (!top) {
    return "unknown source";
  }
  return `${top.source.file}:${top.source.startLine}-${top.source.endLine}`;
};

const computeFoldSegments = (hunk: Hunk, options: OverlayOptions): FoldSegment[] => {
  const segments: FoldSegment[] = [];
  let runStart: number | undefined;
  let runLines: DiffLine[] = [];

  const flushRun = (endIndex: number): void => {
    if (runStart === undefined) {
      return;
    }
    if (runLines.length >= options.minFoldLines) {
      const similarity = Math.min(...runLines.map((line) => line.copyTag?.similarity ?? 0));
      const summary = `↳ (collapsed) ${runLines.length} added lines copied from ${summarizeSources(runLines)} (${Math.round(
        similarity * 100
      )}%)`;
      segments.push({ startIndex: runStart, endIndex, summary });
    }
    runStart = undefined;
    runLines = [];
  };

  hunk.lines.forEach((line, index) => {
    const qualifies =
      line.kind === "add" &&
      line.copyTag &&
      line.copyTag.allowFold &&
      line.copyTag.similarity >= options.pureThreshold &&
      !line.hasBgAnsi;

    if (qualifies) {
      if (runStart === undefined) {
        runStart = index;
      }
      runLines.push(line);
    } else if (runStart !== undefined) {
      flushRun(index - 1);
    }
  });

  if (runStart !== undefined) {
    flushRun(hunk.lines.length - 1);
  }

  return segments;
};

const applyCopyOverlay = (files: FileDiff[], clonePairs: ClonePair[], options: OverlayOptions): CopyOverlay => {
  const { index: addedIndex, intervals } = buildAddedLineIndex(files);

  clonePairs.forEach((pair) => {
    const aInAdded = regionIntersectsIntervals(pair.a, intervals);
    const bInAdded = regionIntersectsIntervals(pair.b, intervals);
    if (aInAdded && !bInAdded) {
      applyCopyTag(addedIndex, pair.a, pair.b, pair.similarity, true);
      return;
    }
    if (bInAdded && !aInAdded) {
      applyCopyTag(addedIndex, pair.b, pair.a, pair.similarity, true);
      return;
    }
    if (aInAdded && bInAdded) {
      applyCopyTag(addedIndex, pair.a, pair.b, pair.similarity, false);
      applyCopyTag(addedIndex, pair.b, pair.a, pair.similarity, false);
    }
  });

  files.forEach((file) => {
    file.hunks.forEach((hunk) => {
      hunk.foldSegments = computeFoldSegments(hunk, options);
    });
  });

  return { files };
};

export { applyCopyOverlay };
export type { CopyOverlay, OverlayOptions };
