// Money rules of the new application, including the two defects of the first one that are fixed here
// (FINANCIAL_RULES_AUDIT F-1 and F-14) and the intended account deletion behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LedgerTx, applyChange } from "../src/domain/change.ts";
import { accountDeletionImpact, accountDraft, changeAccountCurrency, checkedAccountDraft, deleteAccount, storeAccount } from "../src/domain/accounts.ts";
import { accountBalance } from "../src/domain/ledger.ts";
import { convert, evaluateExpression, applyFees, shownPercent, typeKey } from "../src/domain/money.ts";
import { applyBulkChanges, emptyBulkChanges, putOperation } from "../src/domain/operations.ts";
import { processScheduled } from "../src/domain/scheduled.ts";
import type { LedgerData, Operation } from "../src/domain/types.ts";
import { fixture, testEnv } from "./support/helpers.ts";

// The sample with a USD account and a USD category.
function withDollars(): LedgerData {
  const data = fixture("sample");
  const kgs = data.accounts[0];
  assert.ok(kgs);
  return {
    ...data,
    accounts: [...data.accounts, { ...kgs, id: "usd", name: "USD", currency: "USD", opening: 0, favorite: false }],
    categories: [...data.categories, { id: "trip", name: "Trip", type: "expense", icon: "tag", color: "#123456", currency: "USD", parent: null, archived: false }],
  };
}
const transfer = (data: LedgerData, extra: Partial<Operation> = {}): Operation => ({
  id: "",
  type: "transfer",
  from: data.accounts[0]?.id,
  to: "usd",
  amount: 875000,
  date: "2026-11-01",
  comment: "",
  tags: [],
  ...extra,
});

test("calculator, fees and percent follow the first application", () => {
  assert.equal(evaluateExpression("2+3×4"), 1400);
  assert.equal(evaluateExpression("0,1+0,2"), 30);
  assert.throws(() => evaluateExpression("5÷0"), /divide by zero/);
  assert.equal(typeKey("12", "."), "12.");
  assert.equal(typeKey("1.5", "."), "1.5");
  assert.equal(applyFees(10000, [{ kind: "tax", percent: 10 }, { kind: "commission", percent: 10 }]).net, 8100);
  assert.equal(applyFees(10000, [{ kind: "tax", percent: 10, add: true }]).net, 11000);
  assert.equal(shownPercent(99.999), 99.99);
  assert.equal(convert(875000, "KGS", "USD", { KGS: 1, USD: 87.5 }), 10000);
});

test("F-1: editing a comment or tags never re-prices a transfer, even after the rate changed", () => {
  const env = testEnv();
  const tx = new LedgerTx(withDollars());
  const { saved } = putOperation(tx, transfer(tx.data), env);
  assert.equal(saved.receive, 10000);
  tx.setRates({ ...tx.data.rates, USD: 100 });
  applyBulkChanges(tx, [saved.id], { ...emptyBulkChanges(), addTags: ["trip"], comment: "hotel" }, env);
  const after = tx.get("ops", saved.id);
  assert.equal(after?.receive, 10000, "received amount kept");
  assert.deepEqual(after?.tags, ["trip"]);
  assert.equal(accountBalance(tx.data, "usd"), 10000, "USD balance unchanged");
  // The editor path: a transfer with a fee, comment edited.
  const withFee = putOperation(tx, transfer(tx.data, { fees: [{ kind: "commission", percent: 1 }] }), env).saved;
  const receiveBefore = withFee.receive;
  putOperation(tx, { ...withFee, comment: "edited" }, env);
  assert.equal(tx.get("ops", withFee.id)?.receive, receiveBefore);
});

test("F-1: a category amount in another currency is kept on unrelated edits and re-priced when the amount changes", () => {
  const env = testEnv();
  const tx = new LedgerTx(withDollars());
  const expense = putOperation(tx, { id: "", type: "expense", from: tx.data.accounts[0]?.id, category: "trip", amount: 875000, date: "2026-11-02", comment: "", tags: [] }, env).saved;
  assert.deepEqual(expense.categoryAmount, { currency: "USD", amount: 10000 });
  tx.setRates({ ...tx.data.rates, USD: 100 });
  putOperation(tx, { ...expense, comment: "dinner", tags: ["food"], date: "2026-11-03" }, env);
  assert.deepEqual(tx.get("ops", expense.id)?.categoryAmount, { currency: "USD", amount: 10000 }, "kept");
  putOperation(tx, { ...expense, amount: 1000000 }, env);
  assert.deepEqual(tx.get("ops", expense.id)?.categoryAmount, { currency: "USD", amount: 10000 }, "1,000,000 at 100 = 10,000.00");
  putOperation(tx, { ...expense, amount: 500000 }, env);
  assert.equal(tx.get("ops", expense.id)?.categoryAmount?.amount, 5000, "re-priced at the current rate");
});

test("explicit recalculation: a typed second amount is kept; a receiver in another currency is re-priced", () => {
  const env = testEnv();
  const data = withDollars();
  const eur = { ...data.accounts[0]!, id: "eur", name: "EUR", currency: "EUR", opening: 0, favorite: false };
  const tx = new LedgerTx({ ...data, accounts: [...data.accounts, eur] });
  const typed = putOperation(tx, transfer(tx.data, { receive: 9999, receiveManual: true }), env).saved;
  assert.equal(typed.receive, 9999);
  putOperation(tx, { ...typed, comment: "x" }, env);
  assert.equal(tx.get("ops", typed.id)?.receive, 9999);
  // Another receiver in the same currency: no new price.
  const plain = putOperation(tx, transfer(tx.data), env).saved;
  tx.setRates({ ...tx.data.rates, USD: 100 });
  // Another receiver in another currency: priced at today's rate.
  applyBulkChanges(tx, [plain.id], { ...emptyBulkChanges(), account: "eur", role: "receiver" }, env);
  assert.equal(tx.get("ops", plain.id)?.receive, convert(875000, "KGS", "EUR", tx.data.rates));
});

test("an operation dated after today becomes a one-time scheduled payment", () => {
  const env = testEnv("2026-11-11");
  const tx = new LedgerTx(withDollars());
  const r = putOperation(tx, { id: "", type: "expense", from: tx.data.accounts[0]?.id, category: tx.data.categories[0]?.id, amount: 100, date: "2026-11-20", comment: "", tags: [] }, env);
  assert.equal(r.planned, true);
  assert.equal(tx.data.ops.some((o) => o.id === r.saved.id), false);
  assert.equal(tx.data.scheduled.find((s) => s.id === r.saved.id)?.recur, null);
});

test("F-14: converting every amount of one account leaves other accounts alone and gives the exact balance", () => {
  const env = testEnv();
  const data = fixture("sample");
  const [a, b] = data.accounts;
  assert.ok(a && b);
  const tx = new LedgerTx({
    ...data,
    ops: [...data.ops, { id: "adjB", type: "adjustment", date: "2026-11-01", from: null, to: b.id, amount: 100000, comment: "", tags: [] }],
    scheduled: [{ id: "sA", type: "expense", amount: 50000, date: "2026-12-01", from: a.id, category: data.categories[0]!.id, comment: "", tags: [], recur: null, reminder: null }],
  });
  const bBefore = accountBalance(tx.data, b.id);
  const expected = convert(accountBalance(tx.data, a.id), "KGS", "USD", tx.data.rates);
  changeAccountCurrency(tx, a.id, "USD", "all");
  assert.equal(accountBalance(tx.data, b.id), bBefore, "other account unchanged (the first application changed it)");
  assert.equal(tx.get("ops", "adjB")?.amount, 100000, "other account's correction unchanged");
  assert.equal(accountBalance(tx.data, a.id), expected, "balance is exactly the old one converted");
  void env;
});

test("deleting an account deletes its operations and transfers; the other account's balance follows (intended)", () => {
  const env = testEnv();
  const tx = new LedgerTx(withDollars());
  const t = putOperation(tx, transfer(tx.data), env).saved;
  const kgs = tx.data.accounts[0]!.id;
  const before = accountBalance(tx.data, kgs);
  const impact = accountDeletionImpact(tx.data, "usd");
  assert.equal(impact.operations, 1);
  assert.equal(impact.otherBalances.get(kgs), 875000, "the KGS account gets the transfer back");
  const removed = deleteAccount(tx, "usd");
  assert.deepEqual(removed.operations, [t.id]);
  assert.equal(accountBalance(tx.data, kgs), before + 875000);
  assert.equal(tx.change.remove.accounts?.[0], "usd");
});

test("a new account with a balance starts with a correction; editing the balance adds one", () => {
  const env = testEnv();
  const data = fixture("sample");
  const tx = new LedgerTx(data);
  const draft = checkedAccountDraft(tx.data, { ...accountDraft(tx.data), name: "Wallet 2", balance: 5000 });
  const a = storeAccount(tx, draft, "spent", env);
  assert.equal(a.opening, 0);
  assert.equal(accountBalance(tx.data, a.id), 5000);
  const edit = checkedAccountDraft(tx.data, { ...accountDraft(tx.data, a), balance: 3000 });
  storeAccount(tx, edit, "spent", env);
  assert.equal(accountBalance(tx.data, a.id), 3000);
  assert.equal(tx.data.ops.filter((o) => o.type === "adjustment" && (o.to === a.id || o.from === a.id)).length, 2);
  // The change applied to the original data gives the same ledger.
  assert.deepEqual(applyChange(data, tx.change).ops.length, tx.data.ops.length);
});

test("Add now posts one occurrence today and moves the payment on; Skip posts nothing", () => {
  const env = testEnv("2026-11-11");
  const data = fixture("withSchedules");
  const tx = new LedgerTx({ ...data, scheduled: data.scheduled.map((s) => (s.id === "daily" ? { ...s, date: "2026-11-15" } : s)) });
  const op = processScheduled(tx, "daily", true, env);
  assert.equal(op?.date, "2026-11-11");
  assert.equal(op?.fromSchedule?.date, "2026-11-15");
  assert.equal(op?.fromSchedule?.byHand, true);
  assert.equal(tx.get("scheduled", "daily")?.date, "2026-11-16");
  const count = tx.data.ops.length;
  processScheduled(tx, "daily", false, env);
  assert.equal(tx.data.ops.length, count);
  assert.equal(tx.get("scheduled", "daily")?.date, "2026-11-17");
});
