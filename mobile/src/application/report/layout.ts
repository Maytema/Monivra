// Lays a report model out on A4 pages as drawing commands (port of js/data/report-layout.js). Nothing is
// drawn here: the PDF writer and the preview draw the same commands. Sizes are in points on 595 × 842.
// Text is measured with the report font itself, so the layout and the PDF agree.
import { formatNumber } from "../../domain/money.ts";
import type { LedgerData } from "../../domain/types.ts";
import type { Translator } from "../../i18n/index.ts";
import { reportFonts } from "./font.ts";
import { money, type DetailModel, type Meta, type SummaryModel } from "./model.ts";

export const PAGE = { width: 595, height: 842 };
const MARGIN = 40;
const TOP = 74;
const BOTTOM = PAGE.height - 56;
const WIDTH = PAGE.width - MARGIN * 2;
export const FONT_FAMILY = "MonivraReport";

const INK = "#252127";
const MUTED = "#6a636e";
const LINE = "#e2dce3";
const POSITIVE = "#2a7a60";
const NEGATIVE = "#b93666";
export const mix = (hex: string, other: string, share: number): string => {
  const channel = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(channel(hex, i) * share + channel(other, i) * (1 - share)).toString(16).padStart(2, "0")).join("");
};
const theme = (data: LedgerData) => {
  const accent = /^#[0-9a-f]{6}$/i.test(data.settings.accent) ? data.settings.accent : "#a000b8";
  return { accent, soft: mix(accent, "#ffffff", 0.1), softer: mix(accent, "#ffffff", 0.05), strong: mix(accent, "#000000", 0.85) };
};

// The drawing commands of a page.
export type Command =
  | { t: "text"; x: number; y: number; s: string; font: string; color: string; align: "left" | "right" | "center" }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string | null; radius: number; stroke: string | null }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { t: "path"; points: [number, number][]; color: string; width: number; area: { baseline: number; fill: string } | null }
  | { t: "dot"; x: number; y: number; r: number; color: string }
  | { t: "arc"; x: number; y: number; r: number; inner: number; from: number; to: number; color: string };

export interface Ctx {
  data: LedgerData;
  t: Translator;
}
interface TextOptions {
  x?: number;
  y?: number;
  size?: number;
  weight?: number;
  color?: string;
  align?: "left" | "right" | "center";
  width?: number;
  lineHeight?: number;
  maxLines?: number;
}
interface CellPart {
  text: string;
  size?: number;
  color?: string;
  weight?: number;
}
type Cell = string | (CellPart & { lines?: CellPart[] }) | { lines: CellPart[]; text?: undefined };
interface Line {
  text: string;
  size: number;
  color: string;
  weight: number;
}
interface TableColumn {
  label: string;
  weight: number;
  align?: "left" | "right";
}

// The width of a text in the report font: 600 and heavier is the bold face, as in the PDF.
export const measure = (text: string, size: number, weight: number): number => (weight >= 600 ? reportFonts().bold : reportFonts().regular).widthOf(text, size);

// A compact number for the axes of charts: 1.2K, 3.4M (1,2 тыс., 3,4 млн).
function compact(x: Ctx, minor: number): string {
  const value = minor / 100;
  const ru = x.t.locale.startsWith("ru");
  const steps: [number, string, string][] = [
    [1e9, "B", " млрд"],
    [1e6, "M", " млн"],
    [1e3, "K", " тыс."],
  ];
  const one = (n: number) => {
    const r = Math.round(n * 10) / 10;
    const text = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return ru ? text.replace(".", ",") : text;
  };
  for (const [size, en, rus] of steps) if (Math.abs(value) >= size) return `${one(value / size)}${ru ? rus : en}`;
  return one(value);
}
const signed = (data: LedgerData, minor: number, currency: string) => `${minor > 0 ? "+" : ""}${money(data, minor, currency).replace("-", "−")}`;
const percentText = (data: LedgerData, value: number) => `${formatNumber(Math.round(value * 100), data.settings.numberFormat, false, 0, 2)}%`;

// Round bounds and step for an axis from `min` to `max` with about `count` intervals.
function niceScale(min: number, max: number, count: number) {
  const high = max > min ? max : min + 1;
  const raw = (high - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(high / step) * step, step };
}

// The layout of one report. `ctx` only measures text.
class Layout {
  pages: Command[][] = [];
  appendix: { title: string; text: string }[] = [];
  palette: ReturnType<typeof theme>;
  y = TOP;
  x: Ctx;
  constructor(x: Ctx) {
    this.x = x;
    this.palette = theme(x.data);
    this.newPage();
  }

  newPage() {
    this.pages.push([]);
    this.y = TOP;
  }

  get page(): Command[] {
    return this.pages[this.pages.length - 1]!;
  }

  add(command: Command) {
    this.page.push(command);
  }

  // Room for `height` more points; a new page when there is not enough.
  ensure(height: number) {
    if (this.y + height > BOTTOM && this.y > TOP) this.newPage();
  }

  gap(height: number) {
    this.y += height;
  }

  font(size: number, weight = 400) {
    return `${weight} ${size}px ${FONT_FAMILY}`;
  }

  width(text: string, size: number, weight: number) {
    return measure(text, size, weight);
  }

  // The lines `text` takes in `width`: words are kept whole unless one is wider than the line.
  wrap(text: string, size: number, weight: number, width: number, maxLines = Infinity): string[] {
    const m = (s: string) => measure(s, size, weight);
    const lines: string[] = [];
    for (const paragraph of String(text ?? "").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (m(attempt) <= width) {
          line = attempt;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        let rest = word;
        while (m(rest) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && m(rest.slice(0, cut)) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1] ?? "";
      while (last.length > 1 && m(`${last}…`) > width)
        last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    return lines;
  }

  // Draws text at x, y (top of the line); returns the height it took.
  text(
    text: string,
    {
      x = MARGIN,
      y = this.y,
      size = 10,
      weight = 400,
      color = INK,
      align = "left",
      width = WIDTH,
      lineHeight = 1.35,
      maxLines,
    }: TextOptions = {},
  ) {
    const lines = this.wrap(text, size, weight, width, maxLines);
    lines.forEach((line, i) =>
      this.add({
        t: "text",
        x: align === "right" ? x + width : align === "center" ? x + width / 2 : x,
        y: y + i * size * lineHeight,
        s: line,
        font: this.font(size, weight),
        color,
        align,
      }),
    );
    return lines.length * size * lineHeight;
  }

  // Text that moves the cursor down.
  paragraph(text: string, options: TextOptions = {}) {
    const height =
      this.wrap(
        text,
        options.size ?? 10,
        options.weight ?? 400,
        options.width ?? WIDTH,
        options.maxLines,
      ).length *
      (options.size ?? 10) *
      (options.lineHeight ?? 1.35);
    this.ensure(height);
    this.y += this.text(text, options);
  }

  // A long text that may continue over as many pages as it needs, line by line.
  flow(text: string, { size = 9, color = INK } = {}) {
    const step = size * 1.35;
    for (const line of this.wrap(text, size, 400, WIDTH)) {
      this.ensure(step);
      this.text(line, { size, color, width: WIDTH });
      this.y += step;
    }
  }

  rect(x: number, y: number, w: number, h: number, fill: string | null, radius = 0, stroke: string | null = null) {
    this.add({ t: "rect", x, y, w, h, fill, radius, stroke });
  }

  line(x1: number, y1: number, x2: number, y2: number, color = LINE, width = 0.75) {
    this.add({ t: "line", x1, y1, x2, y2, color, width });
  }

  // ---- Blocks ----

  // Heading of a part of the report.
  section(title: string, keepWith = 90) {
    this.gap(14);
    this.ensure(keepWith);
    this.rect(MARGIN, this.y + 1, 3, 15, this.palette.accent, 1.5);
    this.y += this.text(title, { x: MARGIN + 11, size: 14, weight: 600, color: INK }) + 8;
  }

  // The title block of the first page.
  cover(meta: Meta, extra: string[] = []) {
    const p = this.palette;
    const lines = [...meta.filters.map(([label, value]) => `${label}: ${value}`)];
    const detail = [`${this.x.t.t("Period")}: ${meta.period}`, ...lines, ...extra];
    const detailHeight = detail.reduce(
      (h, s) => h + this.wrap(s, 9, 400, WIDTH - 40).length * 12.5,
      0,
    );
    const height = 62 + detailHeight + 16;
    this.rect(MARGIN, this.y, WIDTH, height, p.soft, 14);
    this.rect(MARGIN, this.y, 6, height, p.accent, 3);
    let y = this.y + 16;
    y += this.text(meta.title, {
      x: MARGIN + 22,
      y,
      size: 22,
      weight: 600,
      color: p.strong,
      width: WIDTH - 40,
    });
    y += 8;
    for (const s of detail)
      y += this.text(s, {
        x: MARGIN + 22,
        y,
        size: 9,
        color: MUTED,
        width: WIDTH - 40,
        lineHeight: 1.4,
      });
    this.y += height + 10;
  }

  // A row of cards: [{ label, value, sub, tone }].
  cards(items: { label: string; value: string; sub?: string; tone?: string }[]) {
    const gap = 10;
    const w = (WIDTH - gap * (items.length - 1)) / items.length;
    // Labels and notes take a second line when they do not fit, in every card of the row.
    const lines = (text: string | undefined, size: number) => (text ? this.wrap(text, size, 400, w - 20, 2).length : 0);
    const labelLines = Math.max(...items.map((item) => lines(item.label, 8.5)));
    const subLines = Math.max(...items.map((item) => lines(item.sub, 8)));
    const shift = (labelLines - 1) * 11.5;
    const height = 66 + shift + Math.max(0, subLines - 1) * 10.8;
    this.ensure(height + 10);
    items.forEach((item, i) => {
      const x = MARGIN + i * (w + gap);
      this.rect(x, this.y, w, height, "#ffffff", 10, LINE);
      this.text(item.label, {
        x: x + 10,
        y: this.y + 9,
        size: 8.5,
        color: MUTED,
        width: w - 20,
        maxLines: 2,
      });
      const color = item.tone === "good" ? POSITIVE : item.tone === "bad" ? NEGATIVE : INK;
      let size = 15;
      while (size > 9 && this.width(item.value, size, 600) > w - 20) size -= 0.5;
      this.text(item.value, {
        x: x + 10,
        y: this.y + 24 + shift,
        size,
        weight: 600,
        color,
        width: w - 20,
        maxLines: 1,
      });
      if (item.sub)
        this.text(item.sub, {
          x: x + 10,
          y: this.y + 47 + shift,
          size: 8,
          color: MUTED,
          width: w - 20,
          maxLines: 2,
        });
    });
    this.y += height + 10;
  }

  // A table. `columns`: [{ label, width (a share), align }]; `rows`: arrays of cells, a cell being a
  // text or { text, color, weight, lines: [{ text, size, color, weight }] }. The heading repeats on
  // every page; a row that fits on a page is never cut by its end, a taller one continues on the next pages.
  table(columns: TableColumn[], rows: Cell[][], options: { footer?: Cell[] | null; fontSize?: number; pad?: number; appendix?: ((row: number) => string) | null } = {}) {
    for (const _step of this.tableSteps(columns, rows, options));
  }

  // The same table as steps: one step per few hundred rows (their number done), for a list of tens of thousands.
  *tableSteps(columns: TableColumn[], rows: Cell[][], { footer = null, fontSize = 9, pad = 5, appendix = null }: { footer?: Cell[] | null; fontSize?: number; pad?: number; appendix?: ((row: number) => string) | null } = {}): Generator<number, void> {
    const total = columns.reduce((s, c) => s + c.weight, 0);
    const widths = columns.map((c) => (c.weight / total) * WIDTH);
    const xs = widths.reduce((acc, w, i) => [...acc, acc[i]! + w], [MARGIN]);
    // A cell longer than LINE_CAP lines shows its start and points to the appendix, which holds the
    // whole text: nothing is cut, and one huge comment cannot take over the table.
    const LINE_CAP = 10;
    const cellLines = (cell: Cell, i: number, rowIndex: number): Line[] => {
      const inner = widths[i]! - 12;
      const parts: CellPart[] = typeof cell === "string" ? [{ text: cell }] : cell.lines || [cell as CellPart];
      return parts.flatMap((part) => {
        const size = part.size ?? fontSize;
        const weight = part.weight ?? 400;
        let lines = this.wrap(part.text, size, weight, inner);
        if (appendix && lines.length > LINE_CAP) {
          const ref = this.appendix.push({ title: appendix(rowIndex), text: part.text });
          const mark = this.x.t.t("… full text: appendix, note {n}", { n: ref });
          lines = [...lines.slice(0, LINE_CAP - 1), ...this.wrap(mark, size, 600, inner)];
          return lines.map((line, k) => ({
            text: line,
            size,
            color: k < LINE_CAP - 1 ? (part.color ?? INK) : this.palette.strong,
            weight: k < LINE_CAP - 1 ? weight : 600,
          }));
        }
        return lines.map((line) => ({ text: line, size, color: part.color ?? INK, weight }));
      });
    };
    const heading = () => {
      const h = 22;
      this.rect(MARGIN, this.y, WIDTH, h, this.palette.soft, 6);
      columns.forEach((c, i) => {
        const align = c.align || "left";
        this.text(c.label, {
          x: xs[i]! + 6,
          y: this.y + 6,
          size: 8.5,
          weight: 600,
          color: this.palette.strong,
          width: widths[i]! - 12,
          align,
          maxLines: 1,
        });
      });
      this.y += h + 2;
    };
    const lineHeight = (l: Line) => l.size * 1.3;
    const heightOf = (cols: Line[][]) =>
      Math.max(0, ...cols.map((col) => col.reduce((sum, l) => sum + lineHeight(l), 0))) + pad * 2;
    // Draws the lines of a row (or of a part of it) at the cursor.
    const paint = (cols: Line[][], index: number, bold: boolean) => {
      const height = heightOf(cols);
      if (index % 2 === 1) this.rect(MARGIN, this.y, WIDTH, height, this.palette.softer, 0);
      cols.forEach((col, i) => {
        let y = this.y + pad;
        for (const l of col) {
          this.add({
            t: "text",
            x: columns[i]!.align === "right" ? xs[i]! + widths[i]! - 6 : xs[i]! + 6,
            y,
            s: l.text,
            font: this.font(l.size, bold ? 600 : l.weight),
            color: l.color,
            align: columns[i]!.align === "right" ? "right" : "left",
          });
          y += lineHeight(l);
        }
      });
      this.line(MARGIN, this.y + height, MARGIN + WIDTH, this.y + height);
      this.y += height;
    };
    // A row stays whole when it fits on a page; a taller one continues on the next pages.
    const drawRow = (cells: Cell[], index: number, bold = false): void => {
      let cols = cells.map((cell, i) => cellLines(cell, i, index));
      const pageRoom = BOTTOM - TOP - 30;
      if (this.y + heightOf(cols) > BOTTOM && heightOf(cols) <= pageRoom) {
        this.newPage();
        heading();
      }
      for (;;) {
        if (this.y + heightOf(cols) <= BOTTOM) return paint(cols, index, bold);
        if (BOTTOM - this.y < 60) {
          this.newPage();
          heading();
          continue;
        }
        const room = BOTTOM - this.y - pad * 2;
        const fits = (col: Line[]) => {
          let used = 0;
          let n = 0;
          while (n < col.length && used + lineHeight(col[n]!) <= room) used += lineHeight(col[n++]!);
          return n;
        };
        const counts = cols.map(fits);
        paint(
          cols.map((col, i) => col.slice(0, counts[i])),
          index,
          bold,
        );
        cols = cols.map((col, i) => col.slice(counts[i]));
        this.newPage();
        heading();
        if (cols.every((col) => !col.length)) return;
      }
    };
    this.ensure(22 + 40);
    heading();
    for (let i = 0; i < rows.length; i++) {
      drawRow(rows[i]!, i);
      if (i % 300 === 299) yield i + 1;
    }
    if (footer) {
      this.ensure(30);
      this.line(MARGIN, this.y, MARGIN + WIDTH, this.y, this.palette.accent, 1.2);
      drawRow(footer, 0, true);
    }
    this.gap(6);
  }

  // Bars for two series (income, expenses) over time.
  barChart(labels: string[], series: { color: string; label: string; values: number[] }[], { height = 150, title }: { height?: number; title?: string } = {}) {
    this.ensure(height + 40);
    if (title) {
      this.text(title, { size: 9.5, weight: 600, color: MUTED, width: WIDTH - 130 });
      let x = MARGIN + WIDTH;
      for (const s of [...series].reverse()) {
        const w = this.width(s.label, 8.5, 400);
        this.text(s.label, { x: x - w, size: 8.5, color: MUTED, width: w + 2 });
        this.rect(x - w - 13, this.y + 2, 9, 9, s.color, 2.5);
        x -= w + 26;
      }
      this.y += 18;
    }
    const left = 42;
    const plotX = MARGIN + left;
    const plotW = WIDTH - left;
    const plotY = this.y + 6;
    const plotH = height - 30;
    const { hi: top, step } = niceScale(0, Math.max(1, ...series.flatMap((s) => s.values)), 4);
    for (let tick = 0; tick <= top + step / 2; tick += step) {
      const y = plotY + plotH - (plotH * tick) / top;
      this.line(plotX, y, plotX + plotW, y, tick === 0 ? "#bdb5bf" : LINE);
      this.text(compact(this.x, tick), {
        x: MARGIN,
        y: y - 5,
        size: 7.5,
        color: MUTED,
        width: left - 6,
        align: "right",
        maxLines: 1,
      });
    }
    const n = labels.length;
    const group = plotW / n;
    const barW = Math.min(16, (group * 0.78) / series.length);
    series.forEach((s, k) =>
      s.values.forEach((v, i) => {
        if (v <= 0) return;
        const h = Math.max(1, (v / top) * plotH);
        const x = plotX + i * group + (group - barW * series.length) / 2 + k * barW;
        this.rect(x, plotY + plotH - h, barW - 1, h, s.color, 1.5);
      }),
    );
    const every = Math.max(1, Math.ceil((n * 30) / plotW));
    labels.forEach((label, i) => {
      if (i % every === 0)
        this.text(label, {
          x: plotX + i * group - 6,
          y: plotY + plotH + 5,
          size: 7.5,
          color: MUTED,
          width: group + 12,
          align: "center",
          maxLines: 1,
        });
    });
    this.y += height + 4;
  }

  // A line over time, with the area under it tinted.
  lineChart(x: number, y: number, w: number, h: number, labels: string[], values: number[], color: string, zero = true) {
    const left = 40;
    const plotX = x + left;
    const plotW = w - left - 4;
    const plotY = y + 4;
    const plotH = h - 24;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = zero ? 0 : Math.max(1, (high - low) * 0.1);
    const { lo, hi, step } = niceScale(
      zero ? Math.min(0, low) : low - pad,
      zero ? Math.max(1, high) : high + pad,
      3,
    );
    const at = (v: number) => plotY + plotH - ((v - lo) / (hi - lo)) * plotH;
    for (let tick = lo; tick <= hi + step / 2; tick += step) {
      const gy = at(tick);
      this.line(plotX, gy, plotX + plotW, gy, tick === lo ? "#bdb5bf" : LINE);
      this.text(compact(this.x, tick), {
        x,
        y: gy - 5,
        size: 7.5,
        color: MUTED,
        width: left - 6,
        align: "right",
        maxLines: 1,
      });
    }
    if (lo < 0) this.line(plotX, at(0), plotX + plotW, at(0), "#9d95a0", 0.9);
    const n = values.length;
    const px = (i: number) => plotX + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const points = values.map((v, i): [number, number] => [px(i), at(v)]);
    this.add({
      t: "path",
      points,
      color,
      width: 1.8,
      area:
        n > 1
          ? { baseline: at(Math.min(Math.max(lo, 0), hi)), fill: mix(color, "#ffffff", 0.14) }
          : null,
    });
    if (n <= 24) points.forEach(([cx, cy]) => this.add({ t: "dot", x: cx, y: cy, r: 2.2, color }));
    const every = Math.max(1, Math.ceil((n * 30) / plotW));
    labels.forEach((label, i) => {
      if (i % every === 0)
        this.text(label, {
          x: px(i) - 20,
          y: plotY + plotH + 5,
          size: 7.5,
          color: MUTED,
          width: 40,
          align: "center",
          maxLines: 1,
        });
    });
  }

  // A donut with its legend: slices [{ name, amount, share, color }].
  donut(slices: { name: string; amount: number; share: number; color: string }[], currency: string) {
    const radius = 62;
    const height = Math.max(radius * 2 + 12, slices.length * 17 + 8);
    this.ensure(height + 10);
    const cx = MARGIN + radius + 8;
    const cy = this.y + radius + 6;
    const total = slices.reduce((s, x) => s + x.amount, 0);
    let angle = -Math.PI / 2;
    for (const s of slices) {
      const sweep = (s.amount / total) * Math.PI * 2;
      this.add({
        t: "arc",
        x: cx,
        y: cy,
        r: radius,
        inner: radius * 0.6,
        from: angle,
        to: angle + sweep,
        color: s.color,
      });
      angle += sweep;
    }
    this.text(money(this.x.data, total, currency), {
      x: cx - radius * 0.55,
      y: cy - 6,
      size: 8.5,
      weight: 600,
      color: INK,
      width: radius * 1.1,
      align: "center",
      maxLines: 1,
    });
    const lx = MARGIN + radius * 2 + 40;
    const legendWidth = Math.min(WIDTH - (lx - MARGIN), 300);
    slices.forEach((s, i) => {
      const y = this.y + 6 + i * 17;
      this.rect(lx, y + 1, 9, 9, s.color, 2.5);
      this.text(s.name, { x: lx + 15, y, size: 9, width: legendWidth - 150, maxLines: 1 });
      this.text(percentText(this.x.data, s.share), {
        x: lx + legendWidth - 140,
        y,
        size: 9,
        color: MUTED,
        width: 50,
        align: "right",
        maxLines: 1,
      });
      this.text(money(this.x.data, s.amount, currency), {
        x: lx + legendWidth - 86,
        y,
        size: 9,
        weight: 500,
        width: 86,
        align: "right",
        maxLines: 1,
      });
    });
    this.y += height + 6;
  }

  // A row with a name, a figure and a bar: savings, debts and budgets.
  meters(items: { name: string; figure: string; ratio: number; caption: string; over?: boolean }[]) {
    const p = this.palette;
    for (const item of items) {
      const height = 46;
      this.ensure(height + 4);
      this.text(item.name, { y: this.y, size: 10, weight: 500, width: WIDTH - 170, maxLines: 1 });
      this.text(item.figure, {
        x: MARGIN + WIDTH - 220,
        y: this.y,
        size: 9.5,
        width: 220,
        align: "right",
        color: item.over ? NEGATIVE : INK,
        maxLines: 1,
      });
      this.rect(MARGIN, this.y + 17, WIDTH, 6, "#ece7ed", 3);
      const share = Math.max(0, Math.min(1, item.ratio));
      if (share > 0)
        this.rect(MARGIN, this.y + 17, WIDTH * share, 6, item.over ? NEGATIVE : p.accent, 3);
      this.text(item.caption, { y: this.y + 26, size: 8, color: MUTED, maxLines: 1 });
      this.y += height;
    }
  }
}




// ---- The financial summary ----

export function layoutSummary(model: SummaryModel, ctx: Ctx): Command[][] {
  const L = new Layout(ctx);
  const mo = (n: number, c: string) => money(L.x.data, n, c);
  const sg = (n: number, c: string) => signed(L.x.data, n, c);
  const pc = (v: number) => percentText(L.x.data, v);
  const { meta, overview, shown } = model;
  const main = meta.mainCurrency;
  const counts = overview.counts;
  L.cover(meta, [
    L.x.t.t(
      "Operations: {n} (incomes {income}, expenses {expense}, transfers {transfers}, adjustments {adjustments})",
      {
        n: counts.all,
        income: counts.income,
        expense: counts.expense,
        transfers: counts.transfers,
        adjustments: counts.adjustments,
      },
    ),
  ]);
  const converted = overview.converted;
  const label = (text: string) => (converted ? `${L.x.t.t(text)} (${main})` : L.x.t.t(text));
  const one = overview.byCurrency.length === 1 ? overview.byCurrency[0] : null;
  const cur = converted || !one ? main : one.currency;
  const [incomeValue, expenseValue, netValue] =
    converted || !one
      ? [overview.income, overview.expense, overview.net]
      : [one.income, one.expense, one.net];

  L.section(L.x.t.t("Overview"));
  L.cards([
    { label: label("Income"), value: mo(incomeValue, cur), tone: "good" },
    { label: label("Expenses"), value: mo(expenseValue, cur), tone: "bad" },
    {
      label: label("Net cash flow"),
      value: sg(netValue, cur),
      tone: netValue < 0 ? "bad" : netValue > 0 ? "good" : "",
    },
    {
      label: L.x.t.t("Operations"),
      value: String(counts.all),
      sub: L.x.t.t("{n} incomes, {m} expenses", { n: counts.income, m: counts.expense }),
    },
  ]);
  const second = [];
  if (shown.accounts) {
    const total = model.total;
    second.push({
      label: `${L.x.t.t("Balance at end")} (${main})`,
      value: mo(total.closing, main),
      sub: `${L.x.t.t("at the start")}: ${mo(total.opening, main)}`,
    });
    second.push({
      label: `${L.x.t.t("Change of balance")} (${main})`,
      value: sg(total.closing - total.opening, main),
      tone:
        total.closing - total.opening < 0 ? "bad" : total.closing - total.opening > 0 ? "good" : "",
    });
  }
  if (overview.cardSpend.length)
    second.push({
      label: L.x.t.t("Spent on credit cards"),
      value: overview.cardSpend.map((x) => mo(x.amount, x.currency)).join(" · "),
      sub: L.x.t.t("part of the expenses"),
    });
  if (second.length) L.cards(second);
  if (shown.accounts)
    L.text(
      L.x.t.t(
        "Net cash flow counts income and expenses only. The change of balance also includes adjustments, transfers to or from accounts outside the total, and currency conversion.",
      ),
      { size: 8.5, color: MUTED },
    );
  if (
    overview.byCurrency.length > 1 ||
    (overview.byCurrency.length === 1 && overview.byCurrency[0]!.currency !== main)
  )
    L.table(
      [
        { label: L.x.t.t("Currency"), weight: 1 },
        { label: L.x.t.t("Income"), weight: 2, align: "right" },
        { label: L.x.t.t("Expenses"), weight: 2, align: "right" },
        { label: L.x.t.t("Net cash flow"), weight: 2, align: "right" },
      ],
      overview.byCurrency.map((c) => [
        c.currency,
        { text: mo(c.income, c.currency), color: POSITIVE },
        { text: mo(c.expense, c.currency), color: NEGATIVE },
        { text: sg(c.net, c.currency), color: c.net < 0 ? NEGATIVE : INK },
      ]),
    );

  if (shown.charts) {
    L.section(L.x.t.t("Trends"), 230);
    const flow = model.flow.series;
    L.barChart(
      flow.map((s) => s.label),
      [
        { color: POSITIVE, label: L.x.t.t("Income"), values: flow.map((s) => s.income) },
        { color: NEGATIVE, label: L.x.t.t("Expenses"), values: flow.map((s) => s.expense) },
      ],
      {
        title: `${L.x.t.t("Income and expenses")} (${main}) · ${L.x.t.t({ day: "by day", week: "by week", month: "by month", year: "by year" }[model.flow.unit])}`,
        height: 130,
      },
    );
    L.ensure(108);
    const half = (WIDTH - 16) / 2;
    const y0 = L.y;
    L.text(`${L.x.t.t("Net cash flow")} (${main})`, {
      size: 9.5,
      weight: 600,
      color: MUTED,
      width: half,
    });
    L.lineChart(
      MARGIN,
      y0 + 14,
      half,
      92,
      flow.map((s) => s.label),
      flow.map((s) => s.net),
      L.palette.accent,
    );
    if (model.trend.length) {
      L.text(`${L.x.t.t("Balance")} (${main})`, {
        x: MARGIN + half + 16,
        y: y0,
        size: 9.5,
        weight: 600,
        color: MUTED,
        width: half,
      });
      L.lineChart(
        MARGIN + half + 16,
        y0 + 14,
        half,
        92,
        model.trend.map((s) => s.label),
        model.trend.map((s) => s.value),
        "#3a6fd1",
        false,
      );
    }
    L.y = y0 + 112;
    if (model.expenseCategories.length) {
      L.section(L.x.t.t("Where the money went"), 170);
      const top = model.expenseCategories.slice(0, 7);
      const rest = model.expenseCategories.slice(7);
      const slices = rest.length
        ? [
            ...top,
            {
              name: L.x.t.t("Other"),
              color: "#b6afb8",
              amount: rest.reduce((s, x) => s + x.amount, 0),
              share: rest.reduce((s, x) => s + x.share, 0),
            },
          ]
        : top;
      L.donut(slices, main);
    }
    if (model.incomeCategories.length) {
      L.section(L.x.t.t("Where the income came from"), 120);
      L.table(
        [
          { label: L.x.t.t("Category"), weight: 3 },
          { label: L.x.t.t("Share of total"), weight: 1, align: "right" },
          { label: L.x.t.t("Income"), weight: 2, align: "right" },
        ],
        model.incomeCategories
          .slice(0, 8)
          .map((c) => [
            c.name,
            pc(c.share),
            { text: mo(c.amount, main), color: POSITIVE },
          ]),
      );
    }
  }

  if (shown.accounts) {
    L.section(L.x.t.t("Accounts"), 120);
    L.table(
      [
        { label: L.x.t.t("Account"), weight: 3 },
        { label: L.x.t.t("Type"), weight: 1.6 },
        { label: L.x.t.t("At the start"), weight: 2, align: "right" },
        { label: L.x.t.t("Change"), weight: 2, align: "right" },
        { label: L.x.t.t("At the end"), weight: 2, align: "right" },
      ],
      model.accounts.map((a) => [
        { lines: [{ text: `${a.name}${a.counted ? "" : " *"}` }] },
        a.kind,
        mo(a.opening, a.currency),
        {
          text: sg(a.change, a.currency),
          color: a.change < 0 ? NEGATIVE : a.change > 0 ? POSITIVE : MUTED,
        },
        { text: mo(a.closing, a.currency), weight: 600 },
      ]),
      {
        footer: [
          L.x.t.t("Total of the accounts counted"),
          "",
          mo(model.total.opening, main),
          sg(model.total.closing - model.total.opening, main),
          mo(model.total.closing, main),
        ],
      },
    );
    if (model.accounts.some((a) => !a.counted))
      L.paragraph(L.x.t.t("* not counted in the total (excluded or archived)"), {
        size: 8,
        color: MUTED,
      });
  }

  if (model.movements.length) {
    L.section(L.x.t.t("Other movements of money"), 110);
    L.table(
      [
        { label: L.x.t.t("Kind"), weight: 3 },
        { label: L.x.t.t("Operations"), weight: 1, align: "right" },
        { label: L.x.t.t("Amount"), weight: 3, align: "right" },
      ],
      model.movements.map((m) => [
        m.label,
        String(m.count),
        m.amounts
          .map((a) => (a.amount < 0 ? sg(a.amount, a.currency) : mo(a.amount, a.currency)))
          .join(" · "),
      ]),
    );
  }

  if (shown.savings) {
    L.section(L.x.t.t("Savings"), 80);
    L.meters(
      model.savings.map((s) => ({
        name: s.name,
        figure: `${mo(s.balance, s.currency)} / ${mo(s.goal, s.currency)}`,
        ratio: s.ratio,
        caption: `${pc(s.percent)} · ${s.left > 0 ? L.x.t.t("{amount} to the goal", { amount: mo(s.left, s.currency) }) : L.x.t.t("goal reached")}`,
      })),
    );
  }
  if (shown.debts) {
    L.section(L.x.t.t("Debts"), 80);
    L.meters(
      model.debts.map((d) => ({
        name: `${d.name} · ${d.direction}`,
        figure: d.total
          ? `${mo(d.balance, d.currency)} / ${mo(d.total, d.currency)}`
          : mo(d.balance, d.currency),
        ratio: d.ratio ?? 0,
        caption:
          d.percent === null
            ? L.x.t.t("No total amount set")
            : `${pc(d.percent ?? 0)} ${L.x.t.t("settled")}${(d.left ?? 0) > 0 ? ` · ${L.x.t.t("{amount} left", { amount: mo(d.left ?? 0, d.currency) })}` : ""}`,
      })),
    );
  }
  if (shown.budgets) {
    L.section(L.x.t.t("Budgets"), 80);
    L.meters(
      model.budgets.map((b) => ({
        name: `${b.name} · ${b.range}`,
        figure: `${mo(b.used, b.currency)} / ${mo(b.amount, b.currency)}`,
        ratio: b.ratio,
        over: b.left < 0,
        caption: `${pc(b.percent)} · ${b.left >= 0 ? L.x.t.t("{amount} left", { amount: mo(b.left, b.currency) }) : L.x.t.t("over by {amount}", { amount: mo(-b.left, b.currency) })}`,
      })),
    );
  }

  L.section(L.x.t.t("Notes"), 60);
  for (const note of model.notes)
    L.paragraph(`• ${note}`, { size: 8.5, color: MUTED, lineHeight: 1.4 });
  return finish(L, meta);
}

// ---- The detailed list ----

export function layoutDetail(model: DetailModel, ctx: Ctx): Command[][] {
  const steps = layoutDetailSteps(model, ctx);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// The detailed list as steps: each yields the number of rows laid out so far.
export function* layoutDetailSteps(model: DetailModel, ctx: Ctx): Generator<number, Command[][]> {
  const L = new Layout(ctx);
  const mo = (n: number, c: string) => money(L.x.data, n, c);
  const sg = (n: number, c: string) => signed(L.x.data, n, c);
  const { meta } = model;
  L.cover(meta, [L.x.t.tc("{n} operation", "{n} operations", model.counts.all)]);
  if (model.totals.length) {
    L.section(L.x.t.t("Totals by currency"), 80);
    L.table(
      [
        { label: L.x.t.t("Currency"), weight: 1 },
        { label: L.x.t.t("Income"), weight: 2, align: "right" },
        { label: L.x.t.t("Expenses"), weight: 2, align: "right" },
        { label: L.x.t.t("Net cash flow"), weight: 2, align: "right" },
      ],
      model.totals.map((c) => [
        c.currency,
        { text: mo(c.income, c.currency), color: POSITIVE },
        { text: mo(c.expense, c.currency), color: NEGATIVE },
        { text: sg(c.net, c.currency), color: c.net < 0 ? NEGATIVE : INK },
      ]),
    );
  }
  L.section(L.x.t.t("Operations"), 90);
  if (!model.rows.length)
    L.paragraph(L.x.t.t("There are no operations in this scope."), { color: MUTED });
  else {
    const columns = model.columns.map((c) => ({
      label: c.label,
      weight: c.weight,
      align: c.align,
    }));
    const rows = model.rows.map((r) =>
      model.columns.map((c): Cell => {
        const text = r.cells[c.key] ?? "";
        if (c.key === "subject")
          return {
            lines: [
              { text, weight: 500 },
              ...(r.cells.detail ? [{ text: r.cells.detail, size: 8, color: MUTED }] : []),
            ],
          };
        if (c.key === "amount")
          return { text, color: r.sign > 0 ? POSITIVE : r.sign < 0 ? NEGATIVE : INK, weight: 500 };
        if (c.key === "tags" || c.key === "comment")
          return { text, color: c.key === "tags" ? MUTED : INK };
        return text;
      }),
    );
    yield* L.tableSteps(columns, rows, {
      fontSize: 8.5,
      pad: 4.5,
      appendix: (i) =>
        [model.rows[i]!.cells.date, model.rows[i]!.cells.subject].filter(Boolean).join(" · "),
    });
  }
  for (const note of model.notes) L.paragraph(note, { size: 8, color: MUTED });
  if (L.appendix.length) {
    L.section(L.x.t.t("Appendix: full texts"), 90);
    L.appendix.forEach(({ title, text }, i) => {
      L.ensure(60);
      L.y += L.text(`${i + 1}. ${title}`, { size: 9.5, weight: 600, color: INK, width: WIDTH });
      L.flow(text);
      L.gap(8);
    });
  }
  return finish(L, meta);
}

// The pages with what belongs to every page: header and footer, with the number of pages known.
function finish(L: Layout, meta: Meta): Command[][] {
  const total = L.pages.length;
  L.pages.forEach((commands, index) => {
    const header: Command[] = [
      {
        t: "rect",
        x: MARGIN,
        y: 24,
        w: 17,
        h: 17,
        fill: L.palette.accent,
        radius: 5,
        stroke: null,
      },
      {
        t: "text",
        x: MARGIN + 8.5,
        y: 27.2,
        s: "$",
        font: L.font(11, 700),
        color: "#ffffff",
        align: "center",
      },
      {
        t: "text",
        x: MARGIN + 25,
        y: 27,
        s: "Monivra",
        font: L.font(12, 600),
        color: INK,
        align: "left",
      },
      {
        t: "text",
        x: PAGE.width - MARGIN,
        y: 28.5,
        s: `${meta.title} · ${meta.periodShort}`,
        font: L.font(8.5, 400),
        color: MUTED,
        align: "right",
      },
      { t: "line", x1: MARGIN, y1: 50, x2: PAGE.width - MARGIN, y2: 50, color: LINE, width: 0.75 },
    ];
    const footer: Command[] = [
      {
        t: "line",
        x1: MARGIN,
        y1: PAGE.height - 42,
        x2: PAGE.width - MARGIN,
        y2: PAGE.height - 42,
        color: LINE,
        width: 0.75,
      },
      {
        t: "text",
        x: MARGIN,
        y: PAGE.height - 32,
        s: `${L.x.t.t("Generated")}: ${meta.generated}`,
        font: L.font(8, 400),
        color: MUTED,
        align: "left",
      },
      {
        t: "text",
        x: PAGE.width - MARGIN,
        y: PAGE.height - 32,
        s: L.x.t.t("Page {n} of {total}", { n: index + 1, total }),
        font: L.font(8, 400),
        color: MUTED,
        align: "right",
      },
    ];
    commands.unshift(...header);
    commands.push(...footer);
  });
  return L.pages;
}
