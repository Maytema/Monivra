// The page of a period (features/period-page.ts) shows what the screen showed before it was a function: the operations of the period newest first,
// grouped by day, the places of the day heads, the balances. On 200 random ledgers; and the kept pages answer the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { narrowed, operationsPage, type PageItem } from "../src/features/period-page.ts";
import { balancesAround, newestFirst } from "../src/domain/ledger.ts";
import { emptyFilters, operationsIn, periodBounds } from "../src/domain/periods.ts";
import type { Operation } from "../src/domain/types.ts";
import { filtersFor, generator, ledger, periods } from "./support/random-ledger.ts";

// The screen as it was: the operations of the period by the plain scan, sorted, grouped by day.
function before(data: Parameters<typeof operationsPage>[0], period: Parameters<typeof operationsPage>[1], filters: Parameters<typeof operationsPage>[2], query: string) {
  const ops = operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst);
  const days = new Map<string, Operation[]>();
  for (const o of ops) {
    const day = days.get(o.date);
    if (day) day.push(o);
    else days.set(o.date, [o]);
  }
  const items: PageItem[] = [];
  for (const [date, dayOps] of days) items.push({ kind: "day", date, ops: dayOps }, ...dayOps.map((op): PageItem => ({ kind: "op", op })));
  const sticky = items.flatMap((x, i) => (x.kind === "day" ? [i] : []));
  const [from, to] = periodBounds(period, data.settings);
  const balances = data.settings.opening && ops.length > 0 && !narrowed(filters, query) ? balancesAround(data, filters.accounts, from, to) : null;
  return { items, sticky, balances };
}

test("the page of a period equals the plain reading on 200 random ledgers, also from the kept pages", () => {
  const random = generator(20261127);
  for (let n = 0; n < 200; n++) {
    const count = n % 17 === 0 ? 0 : 1 + Math.floor(random() * 120);
    const base = ledger(random, count, (["up", "down", "mixed"] as const)[n % 3]!);
    const data = { ...base, settings: { ...base.settings, opening: n % 2 === 0 } };
    for (const period of periods(random, data)) {
      for (const f of filtersFor(random, data)) {
        const query = f.comment ?? "";
        const want = before(data, period, f, query);
        for (let again = 0; again < 2; again++) assert.deepEqual(operationsPage(data, period, f, query), want, `ledger ${n} ${period.mode} ${period.anchor} (read ${again + 1})`);
      }
    }
  }
});

test("a page kept for a ledger is not given for another one, and the oldest pages leave", () => {
  const random = generator(5);
  const a = ledger(random, 40, "mixed");
  const b = { ...a, ops: a.ops.slice(1) };
  const month = { mode: "month", anchor: "2025-03-10" } as const;
  const first = operationsPage(a, month, emptyFilters(), "");
  assert.equal(operationsPage(a, month, emptyFilters(), ""), first);
  assert.notEqual(operationsPage(b, month, emptyFilters(), ""), first);
  assert.notEqual(operationsPage(a, month, emptyFilters(), ""), first);
  const mid = operationsPage(a, month, emptyFilters(), "");
  for (let i = 0; i < 20; i++) operationsPage(a, { mode: "day", anchor: `2025-04-${String(i + 1).padStart(2, "0")}` }, emptyFilters(), "");
  assert.notEqual(operationsPage(a, month, emptyFilters(), ""), mid);
});
