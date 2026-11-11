// Filters of the history: OR inside a field, AND between fields; a subcategory as chosen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFilters, operationMatchesFilters, operationsIn } from "../src/domain/periods.ts";
import { fixture } from "./support/helpers.ts";

test("filters combine: type OR, account AND type, a subcategory alone, tags and comment", () => {
  const data = fixture("report");
  const all = { mode: "all" as const, anchor: "2026-11-11" };
  const total = operationsIn(data, all, emptyFilters()).length;
  const expenses = operationsIn(data, all, { ...emptyFilters(), types: ["expense"] });
  const incomes = operationsIn(data, all, { ...emptyFilters(), types: ["income"] });
  const both = operationsIn(data, all, { ...emptyFilters(), types: ["expense", "income"] });
  assert.ok(expenses.length > 0 && incomes.length > 0);
  assert.equal(both.length, new Set([...expenses, ...incomes].map((o) => o.id)).size, "OR inside a field");
  const account = data.accounts[0]!.id;
  const narrowed = operationsIn(data, all, { ...emptyFilters(), types: ["expense"], accounts: [account] });
  assert.ok(narrowed.every((o) => (o.from === account || o.to === account) && operationMatchesFilters(data, o, { ...emptyFilters(), types: ["expense"] })), "AND between fields");
  const sub = data.categories.find((c) => c.parent);
  if (sub) {
    const onlySub = operationsIn(data, all, { ...emptyFilters(), categories: [sub.id] });
    assert.ok(onlySub.every((o) => o.category === sub.id), "a subcategory alone, not its parent");
  }
  assert.ok(total >= both.length);
});
