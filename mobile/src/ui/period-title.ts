// The text of a period ("October 2026", "October 30, 2026", "Oct 25 – 31"), as js/domain/finance.js periodTitle.
import { periodBounds, type Period } from "../domain/periods.ts";
import type { Translator } from "../i18n/index.ts";

export function periodTitle(p: Period, t: Translator, settings: { weekStart: number; monthStart: number }): string {
  if (p.mode === "all") return t.t("All time");
  const [a, b] = periodBounds(p, settings);
  if (p.mode === "month") return t.monthYear(a);
  if (p.mode === "year") return a.slice(0, 4);
  if (p.mode === "day") return t.day(a);
  return t.range(a, b);
}

