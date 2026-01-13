import type { DiffLine, FileDiff, FoldSegment } from "../diff/parse";

type TerminalRenderOptions = {
  copyColor?: string;
  dimCopy: boolean;
};

const faint = (text: string): string => `\x1b[2m${text}\x1b[22m`;

const applyCopyColor = (rawAnsi: string, copyColor: string): string => {
  const prefixMatch = rawAnsi.match(/^(?:\x1b\[[0-9;]*m)*/);
  const prefix = prefixMatch?.[0] ?? "";
  const rest = rawAnsi.slice(prefix.length);
  return `${prefix}${copyColor}${rest}`;
};

const renderHunk = (
  hunkLines: DiffLine[],
  foldSegments: FoldSegment[],
  options: TerminalRenderOptions
): string[] => {
  const output: string[] = [];
  const foldMap = new Map<number, FoldSegment>();
  foldSegments.forEach((segment) => {
    foldMap.set(segment.startIndex, segment);
  });
  let index = 0;
  while (index < hunkLines.length) {
    const fold = foldMap.get(index);
    if (fold) {
      output.push(faint(` ${fold.summary}`));
      index = fold.endIndex + 1;
      continue;
    }
    const line = hunkLines[index];
    if (line.kind === "add" && line.copyTag && !line.hasBgAnsi) {
      if (options.copyColor) {
        output.push(applyCopyColor(line.rawAnsi, options.copyColor));
      } else if (options.dimCopy) {
        output.push(faint(line.rawAnsi));
      } else {
        output.push(line.rawAnsi);
      }
    } else {
      output.push(line.rawAnsi);
    }
    index += 1;
  }
  return output;
};

const renderTerminal = (files: FileDiff[], options: TerminalRenderOptions): string => {
  const output: string[] = [];
  files.forEach((file) => {
    file.headerLines.forEach((line) => output.push(line.rawAnsi));
    file.hunks.forEach((hunk) => {
      output.push(hunk.headerLine.rawAnsi);
      output.push(...renderHunk(hunk.lines, hunk.foldSegments, options));
    });
  });
  return output.join("\n");
};

export { renderTerminal };
export type { TerminalRenderOptions };
