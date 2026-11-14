// What the category donut draws (js/domain/chart.js): the narrow slices are gathered into one, so
// every slice can be tapped.
export const OTHER_SLICE = "other";
// A slice under this share of the circle is too narrow for a finger.
const NARROW_SHARE = 0.04;
// The biggest categories always keep a slice of their own.
const KEPT_APART = 6;

export interface Group {
  id: string;
  name: string;
  color: string;
  icon?: string;
  total: number;
  members?: Group[];
}

// `all` are the category totals, the biggest first. A category with nothing in the period has no
// slice. Two or more narrow ones become one slice ("Other") that lists them in `members`; a single
// narrow one stays as it is.
export function donutSlices(all: readonly Group[]): Group[] {
  const groups = all.filter((g) => g.total > 0);
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  const narrow = groups.filter((g, i) => i >= KEPT_APART && g.total / total < NARROW_SHARE);
  if (narrow.length < 2) return groups;
  const other: Group = { id: OTHER_SLICE, name: "Other", color: "#9b9bab", total: narrow.reduce((sum, g) => sum + g.total, 0), members: narrow };
  return [...groups.filter((g) => !narrow.includes(g)), other];
}

// The bars of the day chart: how much came in and went out in each of at most 30 equal parts of the
// period (js/screens/statistics.js `chartBars`).
export function chartBins(rows: readonly { date: string; reportType: "income" | "expense"; reportAmount: number }[], start: string, end: string): { income: number[]; expense: number[]; days: number } {
  const day = (d: string) => Date.parse(d + "T00:00:00Z");
  const days = Math.max(1, Math.round((day(end) - day(start)) / 86400000) + 1);
  const bins = Math.min(30, days);
  const income: number[] = Array(bins).fill(0);
  const expense: number[] = Array(bins).fill(0);
  for (const o of rows) {
    const i = Math.min(bins - 1, Math.floor(((day(o.date) - day(start)) / 86400000 / days) * bins));
    if (i >= 0) (o.reportType === "income" ? income : expense)[i]! += o.reportAmount;
  }
  return { income, expense, days };
}

// ---- The ring of the donut ---------------------------------------------------------------------------

// A slice as a part of the circle: from `start` to `end`, in turns (0 at twelve o'clock, clockwise, 1 a full circle).
export interface Arc {
  id: string;
  start: number;
  end: number;
}

// The slices one after another around the circle, each as wide as its share.
export function donutArcs(slices: readonly Group[]): Arc[] {
  const total = slices.reduce((sum, g) => sum + g.total, 0);
  if (total <= 0) return [];
  let at = 0;
  return slices.map((g) => ({ id: g.id, start: at, end: (at += g.total / total) }));
}

// The slice under a touch at (dx, dy) from the centre of the ring, or null when the touch is not on the band
// between `inner` and `outer` (a band wider than the drawn ring, so a finger does not have to be exact).
// The angle alone decides which slice: nothing depends on how the ring is painted.
export function sliceAt(arcs: readonly Arc[], dx: number, dy: number, inner: number, outer: number): string | null {
  const distance = Math.hypot(dx, dy);
  if (distance < inner || distance > outer || !arcs.length) return null;
  const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
  return (arcs.find((a) => turn >= a.start && turn < a.end) ?? arcs[arcs.length - 1]!).id;
}
