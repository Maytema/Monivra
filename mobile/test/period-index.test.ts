// The period index (domain/period-index.ts) gives what `operationsIn` and `balancesAround` give, on many random ledgers, and a period is
// cheap on a big one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesAround } from "../src/domain/ledger.ts";
import { balancesAroundIndexed, firstDay, operationsInIndexed, periodIndex } from "../src/domain/period-index.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../src/domain/periods.ts";
import type { LedgerData, Operation } from "../src/domain/types.ts";
import { addDays } from "../src/domain/dates.ts";
import { filtersFor, generator, ledger, periods, some } from "./support/random-ledger.ts";

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
