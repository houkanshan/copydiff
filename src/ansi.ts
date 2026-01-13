const ansiPattern = /\x1b\[[0-9;]*m/g;

const bgAnsiPattern = /\x1b\[48;(?:[0-9]{1,3};?)+m/;

const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

type AnsiStyle = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  faint?: boolean;
  underline?: boolean;
};

const resetStyle = (): AnsiStyle => ({
  fg: undefined,
  bg: undefined,
  bold: false,
  faint: false,
  underline: false
});

const ansiColorCodeMap: Record<number, string> = {
  30: "#000000",
  31: "#d73a49",
  32: "#22863a",
  33: "#b08800",
  34: "#005cc5",
  35: "#6f42c1",
  36: "#1b7c83",
  37: "#6a737d",
  90: "#586069",
  91: "#b31d28",
  92: "#2cbe4e",
  93: "#735c0f",
  94: "#0366d6",
  95: "#6f42c1",
  96: "#1b7c83",
  97: "#24292e"
};

const ansiBgColorCodeMap: Record<number, string> = {
  40: "#000000",
  41: "#d73a49",
  42: "#22863a",
  43: "#b08800",
  44: "#005cc5",
  45: "#6f42c1",
  46: "#1b7c83",
  47: "#6a737d",
  100: "#586069",
  101: "#b31d28",
  102: "#2cbe4e",
  103: "#735c0f",
  104: "#0366d6",
  105: "#6f42c1",
  106: "#1b7c83",
  107: "#959da5"
};

const applyColorSequence = (style: AnsiStyle, codes: number[]): void => {
  let index = 0;
  while (index < codes.length) {
    const code = codes[index];
    switch (code) {
      case 0:
        Object.assign(style, resetStyle());
        index += 1;
        break;
      case 1:
        style.bold = true;
        index += 1;
        break;
      case 2:
        style.faint = true;
        index += 1;
        break;
      case 4:
        style.underline = true;
        index += 1;
        break;
      case 22:
        style.bold = false;
        style.faint = false;
        index += 1;
        break;
      case 24:
        style.underline = false;
        index += 1;
        break;
      case 39:
        style.fg = undefined;
        index += 1;
        break;
      case 49:
        style.bg = undefined;
        index += 1;
        break;
      case 38: {
        const mode = codes[index + 1];
        if (mode === 5) {
          const colorIndex = codes[index + 2];
          style.fg = `var(--ansi-${colorIndex})`;
          index += 3;
        } else if (mode === 2) {
          const [r, g, b] = codes.slice(index + 2, index + 5);
          style.fg = `rgb(${r}, ${g}, ${b})`;
          index += 5;
        } else {
          index += 1;
        }
        break;
      }
      case 48: {
        const mode = codes[index + 1];
        if (mode === 5) {
          const colorIndex = codes[index + 2];
          style.bg = `var(--ansi-${colorIndex})`;
          index += 3;
        } else if (mode === 2) {
          const [r, g, b] = codes.slice(index + 2, index + 5);
          style.bg = `rgb(${r}, ${g}, ${b})`;
          index += 5;
        } else {
          index += 1;
        }
        break;
      }
      default: {
        if (ansiColorCodeMap[code]) {
          style.fg = ansiColorCodeMap[code];
        }
        if (ansiBgColorCodeMap[code]) {
          style.bg = ansiBgColorCodeMap[code];
        }
        index += 1;
      }
    }
  }
};

const styleToCss = (style: AnsiStyle): string => {
  const parts: string[] = [];
  if (style.fg) {
    parts.push(`color: ${style.fg}`);
  }
  if (style.bg) {
    parts.push(`background-color: ${style.bg}`);
  }
  if (style.bold) {
    parts.push("font-weight: 600");
  }
  if (style.faint) {
    parts.push("opacity: 0.65");
  }
  if (style.underline) {
    parts.push("text-decoration: underline");
  }
  return parts.join("; ");
};

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (match) => htmlEscapeMap[match] ?? match);

const buildAnsiPalette = (): string => {
  const entries: string[] = [];
  for (let i = 0; i < 256; i += 1) {
    const value = i < 16 ? i : i;
    entries.push(`--ansi-${i}: ${ansi256ToHex(value)};`);
  }
  return `:root {${entries.join(" ")}}`;
};

const ansi256ToHex = (value: number): string => {
  if (value < 16) {
    const base = [
      "#000000",
      "#800000",
      "#008000",
      "#808000",
      "#000080",
      "#800080",
      "#008080",
      "#c0c0c0",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff"
    ];
    return base[value] ?? "#000000";
  }
  if (value >= 16 && value <= 231) {
    const idx = value - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const toRgb = (n: number) => (n === 0 ? 0 : 55 + 40 * n);
    return `rgb(${toRgb(r)}, ${toRgb(g)}, ${toRgb(b)})`;
  }
  const gray = 8 + (value - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
};

const stripAnsi = (input: string): string => input.replace(ansiPattern, "");

const hasBgAnsi = (input: string): boolean => bgAnsiPattern.test(input);

const ansiToHtml = (input: string): string => {
  const segments = input.split(/\x1b\[[0-9;]*m/);
  const matches = input.match(/\x1b\[[0-9;]*m/g) ?? [];
  const style = resetStyle();
  const rendered: string[] = [];

  segments.forEach((segment, index) => {
    if (segment.length > 0) {
      const css = styleToCss(style);
      const escaped = escapeHtml(segment);
      if (css) {
        rendered.push(`<span style="${css}">${escaped}</span>`);
      } else {
        rendered.push(escaped);
      }
    }
    const match = matches[index];
    if (match) {
      const codeText = match.slice(2, -1);
      const codes = codeText
        .split(";")
        .filter((value) => value.length > 0)
        .map((value) => Number.parseInt(value, 10));
      if (codes.length > 0) {
        applyColorSequence(style, codes);
      } else {
        Object.assign(style, resetStyle());
      }
    }
  });

  return rendered.join("");
};

export {
  ansiToHtml,
  buildAnsiPalette,
  hasBgAnsi,
  stripAnsi
};
export type { AnsiStyle };
