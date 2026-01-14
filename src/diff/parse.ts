import { hasBgAnsi, stripAnsi } from "../ansi";

type DiffLineKind = "add" | "del" | "context" | "meta";

type DiffLine = {
  rawAnsi: string;
  plain: string;
  kind: DiffLineKind;
  oldLineNo?: number;
  newLineNo?: number;
  hasBgAnsi: boolean;
  copyTag?: CopyTag;
};

type CopyTag = {
  similarity: number;
  source: CloneRegion;
  sourceLine?: number;
  allowFold: boolean;
};

type Hunk = {
  headerLine: DiffLine;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  foldSegments: FoldSegment[];
};

type FoldSegment = {
  startIndex: number;
  endIndex: number;
  summary: string;
};

type FileDiff = {
  headerLines: DiffLine[];
  fromFile: string;
  toFile: string;
  hunks: Hunk[];
};

type DiffParseResult = {
  files: FileDiff[];
  rawLines: string[];
};

type CloneRegion = { file: string; startLine: number; endLine: number };

const parseDiff = (input: string): DiffParseResult => {
  const rawLines = input.split("\n");
  const files: FileDiff[] = [];
  let currentFile: FileDiff | undefined;
  let currentHunk: Hunk | undefined;
  let oldLineNo = 0;
  let newLineNo = 0;

  const pushLine = (line: DiffLine): void => {
    if (currentHunk) {
      currentHunk.lines.push(line);
    } else if (currentFile) {
      currentFile.headerLines.push(line);
    }
  };

  rawLines.forEach((rawLine) => {
    const plain = stripAnsi(rawLine);
    if (plain.startsWith("diff --git")) {
      currentFile = {
        headerLines: [],
        fromFile: "",
        toFile: "",
        hunks: []
      };
      files.push(currentFile);
      currentHunk = undefined;
      pushLine({
        rawAnsi: rawLine,
        plain,
        kind: "meta",
        hasBgAnsi: hasBgAnsi(rawLine)
      });
      return;
    }

    if (!currentFile) {
      return;
    }

    if (plain.startsWith("--- ")) {
      currentFile.fromFile = plain.replace(/^---\s+/, "");
    }
    if (plain.startsWith("+++ ")) {
      currentFile.toFile = plain.replace(/^\+\+\+\s+/, "");
    }

    const hunkMatch = plain.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      const oldStart = Number.parseInt(hunkMatch[1], 10);
      const oldLines = Number.parseInt(hunkMatch[2] ?? "1", 10);
      const newStart = Number.parseInt(hunkMatch[3], 10);
      const newLines = Number.parseInt(hunkMatch[4] ?? "1", 10);
      oldLineNo = oldStart;
      newLineNo = newStart;
      currentHunk = {
        headerLine: {
          rawAnsi: rawLine,
          plain,
          kind: "meta",
          hasBgAnsi: hasBgAnsi(rawLine)
        },
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
        foldSegments: []
      };
      currentFile.hunks.push(currentHunk);
      return;
    }

    if (!currentHunk) {
      pushLine({
        rawAnsi: rawLine,
        plain,
        kind: "meta",
        hasBgAnsi: hasBgAnsi(rawLine)
      });
      return;
    }

    if (plain.startsWith("+")) {
      const line: DiffLine = {
        rawAnsi: rawLine,
        plain,
        kind: "add",
        oldLineNo: undefined,
        newLineNo,
        hasBgAnsi: hasBgAnsi(rawLine)
      };
      newLineNo += 1;
      currentHunk.lines.push(line);
      return;
    }

    if (plain.startsWith("-")) {
      const line: DiffLine = {
        rawAnsi: rawLine,
        plain,
        kind: "del",
        oldLineNo,
        newLineNo: undefined,
        hasBgAnsi: hasBgAnsi(rawLine)
      };
      oldLineNo += 1;
      currentHunk.lines.push(line);
      return;
    }

    if (plain.startsWith("\\")) {
      const line: DiffLine = {
        rawAnsi: rawLine,
        plain,
        kind: "meta",
        hasBgAnsi: hasBgAnsi(rawLine)
      };
      currentHunk.lines.push(line);
      return;
    }

    const line: DiffLine = {
      rawAnsi: rawLine,
      plain,
      kind: "context",
      oldLineNo,
      newLineNo,
      hasBgAnsi: hasBgAnsi(rawLine)
    };
    oldLineNo += 1;
    newLineNo += 1;
    currentHunk.lines.push(line);
  });

  return { files, rawLines };
};

export { parseDiff };
export type { CloneRegion, CopyTag, DiffLine, DiffParseResult, FileDiff, FoldSegment, Hunk };
