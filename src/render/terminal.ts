import type { DiffLine, FileDiff, FoldSegment } from "../diff/parse";

const faint = (text: string): string => `\x1b[2m${text}\x1b[22m`;

const renderHunk = (hunkLines: DiffLine[], foldSegments: FoldSegment[]): string[] => {
  const output: string[] = [];
  const foldMap = new Map<number, FoldSegment>();
  foldSegments.forEach((segment) => {
    foldMap.set(segment.startIndex, segment);
  });
  let index = 0;
  while (index < hunkLines.length) {
    const fold = foldMap.get(index);
    if (fold) {
      output.push(faint(fold.summary));
      index = fold.endIndex + 1;
      continue;
    }
    const line = hunkLines[index];
    if (line.kind === "add" && line.copyTag && !line.hasBgAnsi) {
      output.push(`${faint("│c│ ")}${line.rawAnsi}`);
    } else {
      output.push(line.rawAnsi);
    }
    index += 1;
  }
  return output;
};

const renderTerminal = (files: FileDiff[]): string => {
  const output: string[] = [];
  files.forEach((file) => {
    file.headerLines.forEach((line) => output.push(line.rawAnsi));
    file.hunks.forEach((hunk) => {
      output.push(hunk.headerLine.rawAnsi);
      output.push(...renderHunk(hunk.lines, hunk.foldSegments));
    });
  });
  return output.join("\n");
};

export { renderTerminal };
