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
