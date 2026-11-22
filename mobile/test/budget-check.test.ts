// Saving an expense that takes a budget over its limit is asked about (src/domain/budget-check.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetsCrossedBy } from "../src/domain/budget-check.ts";
import { budgetState } from "../src/domain/categories.ts";
import type { LedgerData, Operation } from "../src/domain/types.ts";
import { fixture, testEnv } from "./support/helpers.ts";

const withBudget = (amount: number, categories: string[] | null): LedgerData => {
  const data = fixture("sample");
  return { ...data, budgets: [{ id: "b1", name: "Transport", amount, currency: data.settings.currency, period: "month", categories }] };
};
const expense = (amount: number, date = "2026-11-10", category = "c1"): Operation => ({ id: "", type: "expense", from: "a0", category, amount, date, comment: "", tags: [] });

test("an expense that takes a budget over its limit is reported with how far over; one within it is not", () => {
  const env = testEnv();
  const data = withBudget(100000, ["c1"]);
  const spent = budgetState(data, data.budgets[0]!, "2026-11-10").used;
  const room = 100000 - spent;
  assert.ok(room > 0, "the sample leaves room in the budget");
  assert.deepEqual(budgetsCrossedBy(data, expense(room), env, false), []);
  const crossed = budgetsCrossedBy(data, expense(room + 500), env, false);
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0]?.over, 500);
  // Another category, a future date (it becomes a scheduled payment) or a scheduled payment asks nothing.
  assert.deepEqual(budgetsCrossedBy(data, expense(room + 500, "2026-11-10", "c2"), env, false), []);
  assert.deepEqual(budgetsCrossedBy(data, expense(room + 500, "2026-12-20"), env, false), []);
  assert.deepEqual(budgetsCrossedBy(data, expense(room + 500), env, true), []);
  // A budget of all expenses takes any expense category.
  assert.equal(budgetsCrossedBy(withBudget(100000, null), expense(10000000, "2026-11-10", "c2"), env, false).length, 1);
});
