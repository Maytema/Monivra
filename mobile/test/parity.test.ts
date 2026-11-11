// The new domain must compute what the first application computes on the same data
// (test/fixtures/old-observations.json is written by test/parity/run-old.mjs running the old code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LedgerTx } from "../src/domain/change.ts";
import { budgetState } from "../src/domain/categories.ts";
import { accountBalance, cardState, categoryTotal, categoryTotalIn, overallBalance, progressForBalance, reportRows, totalByType } from "../src/domain/ledger.ts";
import { emptyFilters, operationsIn, periodBounds, type Period } from "../src/domain/periods.ts";
import { missedPayments, postDue } from "../src/domain/scheduled.ts";
import { fixture, oldObservations, testEnv } from "./support/helpers.ts";

const old = oldObservations();

for (const name of ["sample", "report"] as const) {
  test(`parity: balances, periods, categories and budgets of the ${name} fixture`, () => {
    const data = fixture(name);
    const expected = old.observations[name];
    assert.equal(overallBalance(data), expected.overall, "overall balance");
    for (const a of expected.accounts) {
      const account = data.accounts.find((x) => x.id === a.id);
      assert.ok(account, a.id);
      const balance = accountBalance(data, a.id);
      assert.equal(balance, a.balance, `balance ${a.id}`);
      assert.deepEqual(progressForBalance(account, balance), a.progress, `progress ${a.id}`);
      assert.deepEqual(cardState(account, balance), a.card, `card ${a.id}`);
    }
    for (const p of expected.byPeriod) {
      const period = p.period as Period;
      assert.deepEqual(periodBounds(period, data.settings), p.bounds, `bounds ${period.mode}`);
      const ops = operationsIn(data, period, emptyFilters());
      assert.equal(ops.length, p.count, `count ${period.mode} ${period.anchor}`);
      const rows = reportRows(data, ops);
      assert.equal(totalByType(rows, "income"), p.income, `income ${period.mode}`);
      assert.equal(totalByType(rows, "expense"), p.expense, `expense ${period.mode}`);
      for (const c of p.categories) {
        const category = data.categories.find((x) => x.id === c.id);
        assert.ok(category);
        assert.equal(categoryTotal(data, rows, c.id), c.total, `category ${c.id}`);
        assert.equal(categoryTotalIn(data, rows, category), c.own, `category own ${c.id}`);
      }
      for (const b of p.budgets) {
        const budget = data.budgets.find((x) => x.id === b.id);
        assert.ok(budget);
        const s = budgetState(data, budget, period.anchor);
        assert.equal(s.used, b.used, `budget ${b.id}`);
      }
    }
  });
}

test("parity: posting due scheduled payments (daily, monthly on the 31st, weekly, today later, far behind)", () => {
  const data = fixture("withSchedules");
  const env = testEnv("2026-11-11", "12:00");
  const tx = new LedgerTx(data);
  const { posted, failed } = postDue(tx, env);
  assert.deepEqual(failed, []);
  const expected = old.postDue;
  const mine = tx.data.ops
    .filter((o) => posted.includes(o.id))
    .map((o) => ({ schedule: o.fromSchedule?.id, occurrence: o.fromSchedule?.date, date: o.date, time: o.time ?? null, amount: o.amount, receive: o.receive ?? null }))
    .sort((a, b) => (String(a.schedule) + a.occurrence).localeCompare(String(b.schedule) + b.occurrence));
  assert.deepEqual(mine, expected.posted);
  assert.deepEqual(
    tx.data.scheduled.map((s) => ({ id: s.id, date: s.date, remaining: s.recur?.remaining ?? null })),
    expected.scheduled,
  );
  assert.deepEqual(
    tx.data.accounts.map((a) => ({ id: a.id, balance: accountBalance(tx.data, a.id) })),
    expected.balances,
  );
  assert.deepEqual(missedPayments(tx.data.scheduled, env).map((e) => ({ id: e.item.id, count: e.count })), expected.missed);
  // A second run posts nothing more.
  const again = postDue(tx, env);
  assert.deepEqual(again.posted, []);
});

test("parity: reminders planned for the system (periodic on weekdays, payment reminders days and weeks ahead)", async () => {
  const { upcomingReminders } = await import("../src/domain/reminders.ts");
  const data = fixture("withReminders");
  const mine = upcomingReminders(data, "2026-11-11", "12:00", { days: 40, limit: 60 }).map((r) => ({ key: r.key, day: r.day, time: r.time }));
  assert.deepEqual(mine, old.reminders);
});

test("parity: the CSV of all operations is the same text as the first application's", async () => {
  const { csvText } = await import("../src/domain/csv.ts");
  const data = fixture("report");
  assert.equal(csvText(data, data.ops), old.csvReport);
});
