// The text of a period ("October 2026", "30 October 2026", "25 Oct – 31 Oct").
import { periodBounds, type Period } from "../domain/periods.ts";
import type { Translator } from "../i18n/index.ts";

export function periodTitle(p: Period, t: Translator, settings: { weekStart: number; monthStart: number }): string {
  if (p.mode === "all") return t.t("All time");
  const [a, b] = periodBounds(p, settings);
  if (p.mode === "month") return t.monthYear(a);
  if (p.mode === "year") return a.slice(0, 4);
  if (p.mode === "day") return t.day(a);
  return `${t.day(a, a.slice(0, 4) !== b.slice(0, 4))} – ${t.day(b)}`;
}

