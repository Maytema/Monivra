// The Categories screen hides the Expenses / Incomes switch when there are no categories: at the first start and after
// the owner created categories and deleted them all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/application/store.ts";
import { blankCategory, categoriesEmptyOf, categoriesNone, deleteCategory } from "../src/domain/categories.ts";
import { loadLedger } from "../src/data/repository.ts";
import { memoryDb, testEnv } from "./support/helpers.ts";

function ready(start: "empty" | "starter") {
  const db = memoryDb();
  const env = testEnv();
  const store = createStore(db, env, () => "en");
  store.open();
  store.begin(start, (s) => s);
  const data = () => {
    const s = store.getState();
    assert.equal(s.status, "ready");
    return s.status === "ready" ? s.data : (undefined as never);
  };
  return { db, env, store, data };
}

test("empty profile: the switch is hidden; a category shows it; deleting it hides it again", () => {
  const { store, data } = ready("empty");
  assert.equal(categoriesNone(data()), true);
  store.run((tx) => tx.put("categories", blankCategory({ id: "c1", name: "Food" }), blankCategory({ id: "c2", name: "Cafe", parent: "c1" })));
  assert.equal(categoriesEmptyOf(data(), "expense"), false);
  assert.equal(categoriesNone(data()), false);
  store.run((tx) => deleteCategory(tx, "c1"));
  assert.equal(data().categories.length, 0);
  assert.equal(categoriesNone(data()), true);
});

test("starter set: deleting every category (with subcategories) leaves none", () => {
  const { db, store, data } = ready("starter");
  assert.equal(categoriesNone(data()), false);
  for (const c of data().categories.filter((x) => !x.parent)) store.run((tx) => deleteCategory(tx, c.id));
  assert.deepEqual(data().categories, []);
  assert.equal(categoriesNone(data()), true);
  assert.equal(categoriesNone(loadLedger(db)!), true);
  console.log("debt accounts:", JSON.stringify(data().accounts.filter((a) => a.type === "Debt").map((a) => [a.showExpense, a.showIncome, a.archived])));
});

test("a debt account does not bring the switch back: no categories, a Debt account with showIncome", () => {
  const { store, data } = ready("empty");
  store.run((tx) => tx.put("categories", blankCategory({ id: "c1", name: "Food" })));
  store.run((tx) => tx.put("accounts", { id: "d1", name: "Loan", type: "Debt", currency: "KGS", opening: 0, include: true, archived: false, favorite: false, description: "", icon: "tag", color: "#a5a3c8", showExpense: false, showIncome: true } as never));
  store.run((tx) => deleteCategory(tx, "c1"));
  assert.equal(data().accounts.length, 1);
  assert.equal(categoriesNone(data()), true);
  // The page still has its tile for the income kind and the empty picture for the expense kind; neither breaks.
  assert.equal(categoriesEmptyOf(data(), "income"), false);
  assert.equal(categoriesEmptyOf(data(), "expense"), true);
});
