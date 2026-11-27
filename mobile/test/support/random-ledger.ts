// Random ledgers for the tests that compare a quick way of reading a period with the plain one.
import { addDays } from "../../src/domain/dates.ts";
import { emptyFilters, type Filters, type Period } from "../../src/domain/periods.ts";
import type { LedgerData, Operation } from "../../src/domain/types.ts";
import { fixture } from "./helpers.ts";

const base = fixture("sample");
export function generator(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ledger(random: () => number, count: number, order: "up" | "down" | "mixed"): LedgerData {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const accounts = base.accounts;
  const categories = base.categories;
  const ops: Operation[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(["expense", "income", "transfer", "adjustment"] as const);
    const date = addDays("2025-01-01", Math.floor(random() * 700));
    const from = pick(accounts).id;
    const to = pick(accounts).id;
    const amount = 1 + Math.floor(random() * 500000);
    const o: Operation = { id: `o${i}`, type: kind, amount, date, comment: random() < 0.3 ? "Weekly groceries" : "", tags: random() < 0.4 ? [pick(["home", "work", "trip"])] : [] };
    if (kind === "expense") Object.assign(o, { from, category: pick(categories).id });
    if (kind === "income") Object.assign(o, { to, category: pick(categories).id });
    if (kind === "transfer") Object.assign(o, { from, to, ...(random() < 0.5 ? { receive: 1 + Math.floor(random() * 500000) } : {}) });
    if (kind === "adjustment") Object.assign(o, random() < 0.5 ? { from } : { to });
    if (random() < 0.1) Object.assign(o, { fromSchedule: { id: "s1", date } });
    ops.push(o);
  }
  if (order !== "mixed") ops.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (order === "down") ops.reverse();
  return { ...base, ops, settings: { ...base.settings, weekStart: Math.floor(random() * 7), monthStart: 1 + Math.floor(random() * 28) } };
}

export function periods(random: () => number, data: LedgerData): Period[] {
  const out: Period[] = [{ mode: "all", anchor: "2026-06-01" }];
  for (let i = 0; i < 12; i++) {
    const anchor = addDays("2024-12-01", Math.floor(random() * 800));
    const mode = (["day", "week", "month", "year"] as const)[i % 4]!;
    out.push({ mode, anchor });
    const to = addDays(anchor, Math.floor(random() * 90) - 20);
    out.push({ mode: "range", anchor, from: anchor, to });
  }
  void data;
  return out;
}

export function filtersFor(random: () => number, data: LedgerData): Filters[] {
  const some = <T,>(list: readonly T[]): T[] => list.filter(() => random() < 0.4);
  return [
    emptyFilters(),
    { ...emptyFilters(), accounts: some(data.accounts.map((a) => a.id)) },
    { ...emptyFilters(), types: ["expense"] },
    { ...emptyFilters(), categories: some(data.categories.map((c) => c.id)), tags: ["home"] },
    { ...emptyFilters(), comment: "grocer", origin: ["manual"] },
  ];
}

export function some(random: () => number, data: LedgerData): string[] {
  return data.accounts.map((a) => a.id).filter(() => random() < 0.5);
}

