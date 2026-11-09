/* Lays a report model out on A4 pages: a list of drawing commands for every page. Nothing is drawn
   here; `platform/report-render.js` draws the commands, so the preview and the PDF show the same pages.
   Sizes are in points (1/72 inch) on a page of 595 × 842. */
import { appData } from "../core/state.js";
import { formatAmountText, formatNumber } from "../domain/finance.js";
import { currentLocale, translate, translateCount, translateWith } from "../i18n/index.js";

export const PAGE = { width: 595, height: 842 };
const MARGIN = 40;
const TOP = 74;
const BOTTOM = PAGE.height - 56;
const WIDTH = PAGE.width - MARGIN * 2;
export const FONT_FAMILY = "MonivraReport";

// Colors of the paper: dark text on white whatever the theme of the screen, with the accent of the
// application as the one decoration.
const INK = "#252127";
const MUTED = "#6a636e";
const LINE = "#e2dce3";
const POSITIVE = "#2a7a60";
const NEGATIVE = "#b93666";
const mix = (hex, other, share) => {
  const channel = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(channel(hex, i) * share + channel(other, i) * (1 - share))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
const theme = () => {
  const accent = /^#[0-9a-f]{6}$/i.test(appData.settings.accent)
    ? appData.settings.accent
    : "#a000b8";
  return {
    accent,
    soft: mix(accent, "#ffffff", 0.1),
    softer: mix(accent, "#ffffff", 0.05),
    strong: mix(accent, "#000000", 0.85),
  };
};

// A compact number for the axes of charts: 1.2K, 3.4M.
const compact = (minor) =>
  new Intl.NumberFormat(currentLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(
    minor / 100,
  );
const signed = (minor, currency) =>
  `${minor > 0 ? "+" : ""}${formatAmountText(minor, currency).replace("-", "−")}`;
const percentText = (value) =>
  `${formatNumber(Math.round(value * 100), appData.settings.numberFormat, false, 0, 2)}%`;

// Round bounds and step for an axis from `min` to `max` with about `count` intervals.
function niceScale(min, max, count) {
  const high = max > min ? max : min + 1;
  const raw = (high - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(high / step) * step, step };
}

// The layout of one report. `ctx` only measures text.
class Layout {
  constructor(ctx) {
    this.ctx = ctx;
    this.pages = [];
    this.appendix = [];
    this.palette = theme();
    this.newPage();
  }

  newPage() {
    this.pages.push([]);
    this.y = TOP;
  }

  get page() {
    return this.pages.at(-1);
  }

  add(command) {
    this.page.push(command);
  }

  // Room for `height` more points; a new page when there is not enough.
  ensure(height) {
    if (this.y + height > BOTTOM && this.y > TOP) this.newPage();
  }

  gap(height) {
    this.y += height;
  }

  font(size, weight = 400) {
    return `${weight} ${size}px ${FONT_FAMILY}`;
  }

  width(text, size, weight) {
    this.ctx.font = this.font(size, weight);
    return this.ctx.measureText(text).width;
  }

  // The lines `text` takes in `width`: words are kept whole unless one is wider than the line.
  wrap(text, size, weight, width, maxLines = Infinity) {
    this.ctx.font = this.font(size, weight);
    const lines = [];
    for (const paragraph of String(text ?? "").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(attempt).width <= width) {
          line = attempt;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        let rest = word;
        while (this.ctx.measureText(rest).width > width) {
          let cut = rest.length - 1;
          while (cut > 1 && this.ctx.measureText(rest.slice(0, cut)).width > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.length > 1 && this.ctx.measureText(`${last}…`).width > width)
        last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    return lines;
  }

  // Draws text at x, y (top of the line); returns the height it took.
  text(
    text,
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
    } = {},
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
  paragraph(text, options = {}) {
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
  flow(text, { size = 9, color = INK } = {}) {
    const step = size * 1.35;
    for (const line of this.wrap(text, size, 400, WIDTH)) {
      this.ensure(step);
      this.text(line, { size, color, width: WIDTH });
      this.y += step;
    }
  }

  rect(x, y, w, h, fill, radius = 0, stroke = null) {
    this.add({ t: "rect", x, y, w, h, fill, radius, stroke });
  }

  line(x1, y1, x2, y2, color = LINE, width = 0.75) {
    this.add({ t: "line", x1, y1, x2, y2, color, width });
  }

  // ---- Blocks ----

  // Heading of a part of the report.
  section(title, keepWith = 90) {
    this.gap(14);
    this.ensure(keepWith);
    this.rect(MARGIN, this.y + 1, 3, 15, this.palette.accent, 1.5);
    this.y += this.text(title, { x: MARGIN + 11, size: 14, weight: 600, color: INK }) + 8;
  }

  // The title block of the first page.
  cover(meta, extra = []) {
    const p = this.palette;
    const lines = [...meta.filters.map(([label, value]) => `${label}: ${value}`)];
    const detail = [`${translate("Period")}: ${meta.period}`, ...lines, ...extra];
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
  cards(items) {
    const gap = 10;
    const w = (WIDTH - gap * (items.length - 1)) / items.length;
    // Labels and notes take a second line when they do not fit, in every card of the row.
    const lines = (text, size) => (text ? this.wrap(text, size, 400, w - 20, 2).length : 0);
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
  table(columns, rows, { footer = null, fontSize = 9, pad = 5, appendix = null } = {}) {
    const total = columns.reduce((s, c) => s + c.weight, 0);
    const widths = columns.map((c) => (c.weight / total) * WIDTH);
    const xs = widths.reduce((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
    // A cell longer than LINE_CAP lines shows its start and points to the appendix, which holds the
    // whole text: nothing is cut, and one huge comment cannot take over the table.
    const LINE_CAP = 10;
    const cellLines = (cell, i, rowIndex) => {
      const inner = widths[i] - 12;
      const parts = typeof cell === "string" ? [{ text: cell }] : cell.lines || [cell];
      return parts.flatMap((part) => {
        const size = part.size ?? fontSize;
        const weight = part.weight ?? 400;
        let lines = this.wrap(part.text, size, weight, inner);
        if (appendix && lines.length > LINE_CAP) {
          const ref = this.appendix.push({ title: appendix(rowIndex), text: part.text });
          const mark = translateWith("… full text: appendix, note {n}", { n: ref });
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
          x: xs[i] + 6,
          y: this.y + 6,
          size: 8.5,
          weight: 600,
          color: this.palette.strong,
          width: widths[i] - 12,
          align,
          maxLines: 1,
        });
      });
      this.y += h + 2;
    };
    const lineHeight = (l) => l.size * 1.3;
    const heightOf = (cols) =>
      Math.max(0, ...cols.map((col) => col.reduce((sum, l) => sum + lineHeight(l), 0))) + pad * 2;
    // Draws the lines of a row (or of a part of it) at the cursor.
    const paint = (cols, index, bold) => {
      const height = heightOf(cols);
      if (index % 2 === 1) this.rect(MARGIN, this.y, WIDTH, height, this.palette.softer, 0);
      cols.forEach((col, i) => {
        let y = this.y + pad;
        for (const l of col) {
          this.add({
            t: "text",
            x: columns[i].align === "right" ? xs[i] + widths[i] - 6 : xs[i] + 6,
            y,
            s: l.text,
            font: this.font(l.size, bold ? 600 : l.weight),
            color: l.color,
            align: columns[i].align === "right" ? "right" : "left",
          });
          y += lineHeight(l);
        }
      });
      this.line(MARGIN, this.y + height, MARGIN + WIDTH, this.y + height);
      this.y += height;
    };
    // A row stays whole when it fits on a page; a taller one continues on the next pages.
    const drawRow = (cells, index, bold = false) => {
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
        const fits = (col) => {
          let used = 0;
          let n = 0;
          while (n < col.length && used + lineHeight(col[n]) <= room) used += lineHeight(col[n++]);
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
    rows.forEach((cells, i) => drawRow(cells, i));
    if (footer) {
      this.ensure(30);
      this.line(MARGIN, this.y, MARGIN + WIDTH, this.y, this.palette.accent, 1.2);
      drawRow(footer, 0, true);
    }
    this.gap(6);
  }

  // Bars for two series (income, expenses) over time.
  barChart(labels, series, { height = 150, title } = {}) {
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
      this.text(compact(tick), {
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
  lineChart(x, y, w, h, labels, values, color, zero = true) {
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
    const at = (v) => plotY + plotH - ((v - lo) / (hi - lo)) * plotH;
    for (let tick = lo; tick <= hi + step / 2; tick += step) {
      const gy = at(tick);
      this.line(plotX, gy, plotX + plotW, gy, tick === lo ? "#bdb5bf" : LINE);
      this.text(compact(tick), {
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
    const px = (i) => plotX + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const points = values.map((v, i) => [px(i), at(v)]);
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
  donut(slices, currency) {
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
    this.text(formatAmountText(total, currency), {
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
      this.text(percentText(s.share), {
        x: lx + legendWidth - 140,
        y,
        size: 9,
        color: MUTED,
        width: 50,
        align: "right",
        maxLines: 1,
      });
      this.text(formatAmountText(s.amount, currency), {
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
  meters(items) {
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

const money = (n, c) => formatAmountText(n, c);

// ---- The financial summary ----

export function layoutSummary(model, ctx) {
  const L = new Layout(ctx);
  const { meta, overview, shown } = model;
  const main = meta.mainCurrency;
  const counts = overview.counts;
  L.cover(meta, [
    translateWith(
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
  const label = (text) => (converted ? `${translate(text)} (${main})` : translate(text));
  const one = overview.byCurrency.length === 1 ? overview.byCurrency[0] : null;
  const cur = converted || !one ? main : one.currency;
  const [incomeValue, expenseValue, netValue] =
    converted || !one
      ? [overview.income, overview.expense, overview.net]
      : [one.income, one.expense, one.net];

  L.section(translate("Overview"));
  L.cards([
    { label: label("Income"), value: money(incomeValue, cur), tone: "good" },
    { label: label("Expenses"), value: money(expenseValue, cur), tone: "bad" },
    {
      label: label("Net cash flow"),
      value: signed(netValue, cur),
      tone: netValue < 0 ? "bad" : netValue > 0 ? "good" : "",
    },
    {
      label: translate("Operations"),
      value: String(counts.all),
      sub: translateWith("{n} incomes, {m} expenses", { n: counts.income, m: counts.expense }),
    },
  ]);
  const second = [];
  if (shown.accounts) {
    const total = model.total;
    second.push({
      label: `${translate("Balance at end")} (${main})`,
      value: money(total.closing, main),
      sub: `${translate("at the start")}: ${money(total.opening, main)}`,
    });
    second.push({
      label: `${translate("Change of balance")} (${main})`,
      value: signed(total.closing - total.opening, main),
      tone:
        total.closing - total.opening < 0 ? "bad" : total.closing - total.opening > 0 ? "good" : "",
    });
  }
  if (overview.cardSpend.length)
    second.push({
      label: translate("Spent on credit cards"),
      value: overview.cardSpend.map((x) => money(x.amount, x.currency)).join(" · "),
      sub: translate("part of the expenses"),
    });
  if (second.length) L.cards(second);
  if (
    overview.byCurrency.length > 1 ||
    (overview.byCurrency.length === 1 && overview.byCurrency[0].currency !== main)
  )
    L.table(
      [
        { label: translate("Currency"), weight: 1 },
        { label: translate("Income"), weight: 2, align: "right" },
        { label: translate("Expenses"), weight: 2, align: "right" },
        { label: translate("Net cash flow"), weight: 2, align: "right" },
      ],
      overview.byCurrency.map((c) => [
        c.currency,
        { text: money(c.income, c.currency), color: POSITIVE },
        { text: money(c.expense, c.currency), color: NEGATIVE },
        { text: signed(c.net, c.currency), color: c.net < 0 ? NEGATIVE : INK },
      ]),
    );

  if (shown.charts) {
    L.section(translate("Trends"), 230);
    const flow = model.flow.series;
    L.barChart(
      flow.map((s) => s.label),
      [
        { color: POSITIVE, label: translate("Income"), values: flow.map((s) => s.income) },
        { color: NEGATIVE, label: translate("Expenses"), values: flow.map((s) => s.expense) },
      ],
      {
        title: `${translate("Income and expenses")} (${main}) · ${translate({ day: "by day", week: "by week", month: "by month", year: "by year" }[model.flow.unit])}`,
        height: 130,
      },
    );
    L.ensure(108);
    const half = (WIDTH - 16) / 2;
    const y0 = L.y;
    L.text(`${translate("Net cash flow")} (${main})`, {
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
      L.text(`${translate("Balance")} (${main})`, {
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
      L.section(translate("Where the money went"), 170);
      const top = model.expenseCategories.slice(0, 7);
      const rest = model.expenseCategories.slice(7);
      const slices = rest.length
        ? [
            ...top,
            {
              name: translate("Other"),
              color: "#b6afb8",
              amount: rest.reduce((s, x) => s + x.amount, 0),
              share: rest.reduce((s, x) => s + x.share, 0),
            },
          ]
        : top;
      L.donut(slices, main);
    }
    if (model.incomeCategories.length) {
      L.section(translate("Where the income came from"), 120);
      L.table(
        [
          { label: translate("Category"), weight: 3 },
          { label: translate("Share of total"), weight: 1, align: "right" },
          { label: translate("Income"), weight: 2, align: "right" },
        ],
        model.incomeCategories
          .slice(0, 8)
          .map((c) => [
            c.name,
            percentText(c.share),
            { text: money(c.amount, main), color: POSITIVE },
          ]),
      );
    }
  }

  if (shown.accounts) {
    L.section(translate("Accounts"), 120);
    L.table(
      [
        { label: translate("Account"), weight: 3 },
        { label: translate("Type"), weight: 1.6 },
        { label: translate("At the start"), weight: 2, align: "right" },
        { label: translate("Change"), weight: 2, align: "right" },
        { label: translate("At the end"), weight: 2, align: "right" },
      ],
      model.accounts.map((a) => [
        { lines: [{ text: `${a.name}${a.counted ? "" : " *"}` }] },
        a.kind,
        money(a.opening, a.currency),
        {
          text: signed(a.change, a.currency),
          color: a.change < 0 ? NEGATIVE : a.change > 0 ? POSITIVE : MUTED,
        },
        { text: money(a.closing, a.currency), weight: 600 },
      ]),
      {
        footer: [
          translate("Total of the accounts counted"),
          "",
          money(model.total.opening, main),
          signed(model.total.closing - model.total.opening, main),
          money(model.total.closing, main),
        ],
      },
    );
    if (model.accounts.some((a) => !a.counted))
      L.paragraph(translate("* not counted in the total (excluded or archived)"), {
        size: 8,
        color: MUTED,
      });
  }

  if (model.movements.length) {
    L.section(translate("Other movements of money"), 110);
    L.table(
      [
        { label: translate("Kind"), weight: 3 },
        { label: translate("Operations"), weight: 1, align: "right" },
        { label: translate("Amount"), weight: 3, align: "right" },
      ],
      model.movements.map((m) => [
        m.label,
        String(m.count),
        m.amounts
          .map((a) => (a.amount < 0 ? signed(a.amount, a.currency) : money(a.amount, a.currency)))
          .join(" · "),
      ]),
    );
  }

  if (shown.savings) {
    L.section(translate("Savings"), 80);
    L.meters(
      model.savings.map((s) => ({
        name: s.name,
        figure: `${money(s.balance, s.currency)} / ${money(s.goal, s.currency)}`,
        ratio: s.ratio,
        caption: `${percentText(s.percent)} · ${s.left > 0 ? translateWith("{amount} to the goal", { amount: money(s.left, s.currency) }) : translate("goal reached")}`,
      })),
    );
  }
  if (shown.debts) {
    L.section(translate("Debts"), 80);
    L.meters(
      model.debts.map((d) => ({
        name: `${d.name} · ${d.direction}`,
        figure: d.total
          ? `${money(d.balance, d.currency)} / ${money(d.total, d.currency)}`
          : money(d.balance, d.currency),
        ratio: d.ratio ?? 0,
        caption:
          d.percent === null
            ? translate("No total amount set")
            : `${percentText(d.percent)} ${translate("settled")}${d.left > 0 ? ` · ${translateWith("{amount} left", { amount: money(d.left, d.currency) })}` : ""}`,
      })),
    );
  }
  if (shown.budgets) {
    L.section(translate("Budgets"), 80);
    L.meters(
      model.budgets.map((b) => ({
        name: `${b.name} · ${b.range}`,
        figure: `${money(b.used, b.currency)} / ${money(b.amount, b.currency)}`,
        ratio: b.ratio,
        over: b.left < 0,
        caption: `${percentText(b.percent)} · ${b.left >= 0 ? translateWith("{amount} left", { amount: money(b.left, b.currency) }) : translateWith("over by {amount}", { amount: money(-b.left, b.currency) })}`,
      })),
    );
  }

  L.section(translate("Notes"), 60);
  for (const note of model.notes)
    L.paragraph(`• ${note}`, { size: 8.5, color: MUTED, lineHeight: 1.4 });
  return finish(L, meta);
}

// ---- The detailed list ----

export function layoutDetail(model, ctx) {
  const L = new Layout(ctx);
  const { meta } = model;
  L.cover(meta, [translateCount("{n} operation", "{n} operations", model.counts.all)]);
  if (model.totals.length) {
    L.section(translate("Totals by currency"), 80);
    L.table(
      [
        { label: translate("Currency"), weight: 1 },
        { label: translate("Income"), weight: 2, align: "right" },
        { label: translate("Expenses"), weight: 2, align: "right" },
        { label: translate("Net cash flow"), weight: 2, align: "right" },
      ],
      model.totals.map((c) => [
        c.currency,
        { text: money(c.income, c.currency), color: POSITIVE },
        { text: money(c.expense, c.currency), color: NEGATIVE },
        { text: signed(c.net, c.currency), color: c.net < 0 ? NEGATIVE : INK },
      ]),
    );
  }
  L.section(translate("Operations"), 90);
  if (!model.rows.length)
    L.paragraph(translate("There are no operations in this scope."), { color: MUTED });
  else {
    const columns = model.columns.map((c) => ({
      label: c.label,
      weight: c.weight,
      align: c.align,
    }));
    const rows = model.rows.map((r) =>
      model.columns.map((c) => {
        const text = r.cells[c.key];
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
    L.table(columns, rows, {
      fontSize: 8.5,
      pad: 4.5,
      appendix: (i) =>
        [model.rows[i].cells.date, model.rows[i].cells.subject].filter(Boolean).join(" · "),
    });
  }
  for (const note of model.notes) L.paragraph(note, { size: 8, color: MUTED });
  if (L.appendix.length) {
    L.section(translate("Appendix: full texts"), 90);
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
function finish(L, meta) {
  const total = L.pages.length;
  L.pages.forEach((commands, index) => {
    const header = [
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
    const footer = [
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
        s: `${translate("Generated")}: ${meta.generated}`,
        font: L.font(8, 400),
        color: MUTED,
        align: "left",
      },
      {
        t: "text",
        x: PAGE.width - MARGIN,
        y: PAGE.height - 32,
        s: translateWith("Page {n} of {total}", { n: index + 1, total }),
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
