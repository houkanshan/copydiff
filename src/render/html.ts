import { ansiToHtml, buildAnsiPalette } from "../ansi";
import type { DiffLine, FileDiff } from "../diff/parse";

type HtmlRenderOptions = {
  title: string;
  copyColor?: string;
};

const applyCopyColor = (rawAnsi: string, copyColor: string): string => {
  const prefixMatch = rawAnsi.match(/^(?:\x1b\[[0-9;]*m)*/);
  const prefix = prefixMatch?.[0] ?? "";
  const rest = rawAnsi.slice(prefix.length);
  return `${prefix}${copyColor}${rest}`;
};

const buildHtmlHead = (options: HtmlRenderOptions): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${options.title}</title>
<style>
${buildAnsiPalette()}
body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #fff; color: #1f2328; margin: 0; }
header { padding: 16px 20px; border-bottom: 1px solid #d0d7de; }
main { padding: 16px 20px; }
pre { white-space: pre; margin: 0; font-size: 13px; line-height: 1.45; }
.copied { opacity: 0.65; }
.pure-copy summary { opacity: 0.75; cursor: pointer; }
.legend { font-size: 12px; color: #57606a; }
</style>
</head>
<body>
<header>
  <strong>copydiff</strong>
  <div class="legend">Copied with edits lines are dimmed. Pure copy blocks are collapsed.</div>
</header>
<main>
<pre>`;

const buildHtmlFooter = (): string => `</pre>
</main>
</body>
</html>`;

const renderLine = (line: DiffLine, options: HtmlRenderOptions): string => {
  const isCopiedAdd = line.kind === "add" && line.copyTag && !line.hasBgAnsi;
  const rawAnsi =
    isCopiedAdd && options.copyColor ? applyCopyColor(line.rawAnsi, options.copyColor) : line.rawAnsi;
  const html = ansiToHtml(rawAnsi);
  if (isCopiedAdd && !options.copyColor) {
    return `<span class="copied">${html}</span>`;
  }
  return html;
};

type FoldSegmentMap = Map<number, { endIndex: number; summary: string }>;

const renderHunk = (lines: DiffLine[], foldSegments: FoldSegmentMap, options: HtmlRenderOptions): string => {
  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const fold = foldSegments.get(index);
    if (fold) {
      const foldedLines = lines
        .slice(index, fold.endIndex + 1)
        .map((line) => renderLine(line, options))
        .join("\n");
      output.push(
        `<details class="pure-copy"><summary>${fold.summary}</summary>${foldedLines}</details>`
      );
      index = fold.endIndex + 1;
      continue;
    }
    output.push(renderLine(lines[index], options));
    index += 1;
  }
  return output.join("\n");
};

const renderHtml = (files: FileDiff[], options: HtmlRenderOptions): string => {
  const content: string[] = [buildHtmlHead(options)];
  files.forEach((file) => {
    file.headerLines.forEach((line) => content.push(renderLine(line, options)));
    file.hunks.forEach((hunk) => {
      content.push(renderLine(hunk.headerLine, options));
      const foldMap: FoldSegmentMap = new Map();
      hunk.foldSegments.forEach((segment) => {
        foldMap.set(segment.startIndex, { endIndex: segment.endIndex, summary: segment.summary });
      });
      content.push(renderHunk(hunk.lines, foldMap, options));
    });
  });
  content.push(buildHtmlFooter());
  return content.join("\n");
};

export { renderHtml };
export type { HtmlRenderOptions };
