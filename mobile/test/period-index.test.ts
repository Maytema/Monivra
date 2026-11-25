// The period index (domain/period-index.ts) gives what `operationsIn` and `balancesAround` give, on many random ledgers, and a period is
// cheap on a big one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesAround } from "../src/domain/ledger.ts";
import { balancesAroundIndexed, firstDay, operationsInIndexed, periodIndex } from "../src/domain/period-index.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../src/domain/periods.ts";
import type { LedgerData, Operation } from "../src/domain/types.ts";
import { addDays } from "../src/domain/dates.ts";
import { fixture } from "./support/helpers.ts";

function generator(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = fixture("sample");
function ledger(random: () => number, count: number, order: "up" | "down" | "mixed"): LedgerData {
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

function periods(random: () => number, data: LedgerData): Period[] {
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

function filtersFor(random: () => number, data: LedgerData): Filters[] {
  const some = <T,>(list: readonly T[]): T[] => list.filter(() => random() < 0.4);
  return [
    emptyFilters(),
    { ...emptyFilters(), accounts: some(data.accounts.map((a) => a.id)) },
    { ...emptyFilters(), types: ["expense"] },
    { ...emptyFilters(), categories: some(data.categories.map((c) => c.id)), tags: ["home"] },
    { ...emptyFilters(), comment: "grocer", origin: ["manual"] },
  ];
}

test("the index gives the same operations and balances as the plain functions on 200 random ledgers", () => {
  const random = generator(20261125);
  for (let n = 0; n < 200; n++) {
    const order = (["up", "down", "mixed"] as const)[n % 3]!;
    const count = n % 17 === 0 ? 0 : 1 + Math.floor(random() * 120);
    const data = ledger(random, count, order);
    const filters = filtersFor(random, data);
    for (const period of periods(random, data)) {
      for (const f of filters) assert.deepEqual(operationsInIndexed(data, period, f), operationsIn(data, period, f), `ledger ${n} ${order} ${period.mode} ${period.anchor}`);
      const [from, to] = periodBounds(period, data.settings);
      for (const accounts of [null, some(random, data)]) assert.deepEqual(balancesAroundIndexed(data, accounts, from, to), balancesAround(data, accounts, from, to), `balances ${n} ${from} ${to}`);
    }
    // Edges: an empty period (from after to), one day, before and after everything.
    for (const [from, to] of [["2026-01-10", "2026-01-01"], ["2025-03-03", "2025-03-03"], ["0000-01-01", "2000-01-01"], ["3000-01-01", "9999-12-31"], ["0000-01-01", "9999-12-31"]] as const)
      assert.deepEqual(balancesAroundIndexed(data, null, from, to), balancesAround(data, null, from, to), `edge ${n} ${from} ${to}`);
    assert.equal(firstDay(periodIndex(data.ops)), data.ops.length ? data.ops.reduce((s, o) => (o.date < s ? o.date : s), "9999-12-31") : null);
  }
});
function some(random: () => number, data: LedgerData): string[] {
  return data.accounts.map((a) => a.id).filter(() => random() < 0.5);
}

test("a period of a ledger of 10000 operations: 1000 queries in under 50 ms", () => {
  const random = generator(7);
  const data = ledger(random, 10000, "down");
  periodIndex(data.ops);
  const list = periods(random, data).filter((p) => p.mode === "month");
  const started = performance.now();
  let total = 0;
  for (let i = 0; i < 1000; i++) total += operationsInIndexed(data, list[i % list.length]!, emptyFilters()).length;
  const spent = performance.now() - started;
  console.log("# 1000 periods ms", spent.toFixed(1), "ops returned", total);
  assert.ok(total > 0);
  assert.ok(spent < 50, `1000 periods took ${spent.toFixed(1)} ms`);
});
