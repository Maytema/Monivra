// Periods of the period bar and filters of the history (js/domain/finance.js of the first application).
import { addDays, parseDate, toIsoDate } from "./dates.ts";
import { transferRoles } from "./ledger.ts";
import type { LedgerData, LocalDate, Operation } from "./types.ts";

export type PeriodMode = "day" | "week" | "month" | "year" | "range" | "all";

export interface Period {
  mode: PeriodMode;
  anchor: LocalDate;
  from?: LocalDate;
  to?: LocalDate;
}

export interface PeriodSettings {
  weekStart: number;
  monthStart: number;
}

// First and last day of a period. A month starts on the chosen day of the month.
export function periodBounds(p: Period, s: PeriodSettings): [LocalDate, LocalDate] {
  if (p.mode === "all") return ["0000-01-01", "9999-12-31"];
  if (p.mode === "range") return [p.from ?? p.anchor, p.to ?? p.anchor];
  if (p.mode === "day") return [p.anchor, p.anchor];
  const d = parseDate(p.anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (p.mode === "week") {
    const a = addDays(p.anchor, -((d.getUTCDay() - s.weekStart + 7) % 7));
    return [a, addDays(a, 6)];
  }
  if (p.mode === "year") return [`${y}-01-01`, `${y}-12-31`];
  const start = (month: number): LocalDate => {
    const z = new Date(Date.UTC(y, month, 1, 12));
    const last = new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate();
    z.setUTCDate(Math.min(s.monthStart, last));
    return toIsoDate(z);
  };
  const month = p.anchor < start(m) ? m - 1 : m;
  return [start(month), addDays(start(month + 1), -1)];
}

export const canShiftPeriod = (p: Period): boolean => p.mode !== "all";

// The neighbouring period of the same kind; a range moves by its own length.
export function shiftPeriod(p: Period, n: 1 | -1, s: PeriodSettings): Period {
  if (!canShiftPeriod(p)) return p;
  if (p.mode === "range") {
    const from = p.from ?? p.anchor,
      to = p.to ?? p.anchor;
    const days = Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000) + 1;
    return { ...p, from: addDays(from, n * days), to: addDays(to, n * days), anchor: addDays(from, n * days) };
  }
  const [from, to] = periodBounds(p, s);
  return { ...p, anchor: n > 0 ? addDays(to, 1) : addDays(from, -1) };
}

// The period that shows the given days: the chosen one, else the month of the first, else a range.
export function periodAround(days: LocalDate[], period: Period, s: PeriodSettings): Period {
  const first = days.reduce((a, b) => (a < b ? a : b));
  const last = days.reduce((a, b) => (a > b ? a : b));
  const shows = (p: Period) => {
    const [from, to] = periodBounds(p, s);
    return from <= first && last <= to;
  };
  if (shows(period)) return period;
  const month: Period = { mode: "month", anchor: first };
  return shows(month) ? month : { mode: "range", from: first, to: last, anchor: first };
}

export interface Filters {
  accounts: string[] | null;
  categories: string[] | null;
  types: string[] | null;
  tags: string[] | null;
  comment: string;
  origin: ("manual" | "schedule")[] | null;
}

export const emptyFilters = (): Filters => ({ accounts: null, categories: null, types: null, tags: null, comment: "", origin: null });

// A field is an OR over its choices; fields are ANDed. Categories match exactly as chosen.
export function operationMatchesFilters(data: LedgerData, o: Operation, f: Filters): boolean {
  const roles = transferRoles(data, o);
  return (
    (!f.accounts || f.accounts.includes(o.from ?? "") || f.accounts.includes(o.to ?? "")) &&
    (!f.categories ||
      f.categories.includes(o.category ?? "") ||
      (roles.expense !== null && f.categories.includes("debt:" + roles.expense.id)) ||
      (roles.income !== null && f.categories.includes("debt:" + roles.income.id))) &&
    (!f.types ||
      o.type === "adjustment" ||
      f.types.includes(o.type) ||
      (roles.expense !== null && f.types.includes("expense")) ||
      (roles.income !== null && f.types.includes("income"))) &&
    (!f.tags || f.tags.some((v) => (o.tags ?? []).includes(v))) &&
    (!f.comment || (o.comment ?? "").toLowerCase().includes(f.comment.toLowerCase())) &&
    (!f.origin || f.origin.includes(o.fromSchedule ? "schedule" : "manual"))
  );
}

// Operations of a period that pass the filters (unsorted).
export function operationsIn(data: LedgerData, period: Period, filters: Filters): Operation[] {
  const [a, b] = periodBounds(period, data.settings);
  return data.ops.filter((o) => o.date >= a && o.date <= b && operationMatchesFilters(data, o, filters));
}
