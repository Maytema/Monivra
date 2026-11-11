// The application store over a real SQLite database: first start, commands, import, export, rates,
// and that what the screens see is what is stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/application/store.ts";
import { putOperation } from "../src/domain/operations.ts";
import { loadLedger, compareLedgers } from "../src/data/repository.ts";
import { DomainError } from "../src/domain/errors.ts";
import { fixtureText, memoryDb, testEnv } from "./support/helpers.ts";

test("first start: welcome, then a starter set that is stored", () => {
  const db = memoryDb();
  const store = createStore(db, testEnv(), () => "ru");
  store.open();
  assert.equal(store.getState().status, "welcome");
  store.begin("starter", (s) => (s === "Cash" ? "Наличные" : s));
  const state = store.getState();
  assert.equal(state.status, "ready");
  if (state.status !== "ready") return;
  assert.equal(state.data.accounts[0]?.name, "Наличные");
  assert.equal(state.data.settings.language, "ru");
  assert.deepEqual(compareLedgers(state.data, loadLedger(db)!), []);
});

test("a command is stored before the screens see it; a refused one changes nothing", () => {
  const db = memoryDb();
  const env = testEnv();
  const store = createStore(db, env, () => "en");
  store.open();
  store.begin("starter", (s) => s);
  const before = store.getState();
  assert.equal(before.status, "ready");
  if (before.status !== "ready") return;
  const account = before.data.accounts[0]!.id;
  const category = before.data.categories[0]!.id;
  store.run((tx) => putOperation(tx, { id: "", type: "expense", from: account, category, amount: 12345, date: "2026-11-10", comment: "", tags: [] }, env));
  const after = store.getState();
  assert.equal(after.status === "ready" && after.data.ops.length, 1);
  assert.throws(() => store.run((tx) => putOperation(tx, { id: "", type: "expense", from: account, category, amount: 0, date: "2026-11-10", comment: "", tags: [] }, env)), DomainError);
  const reopened = createStore(db, env, () => "en");
  reopened.open();
  const s = reopened.getState();
  assert.equal(s.status === "ready" && s.data.ops.length, 1);
});

test("importing a data file of the first application posts what came due, and exports back", () => {
  const db = memoryDb();
  const store = createStore(db, testEnv("2026-11-11", "12:00"), () => "en");
  store.open();
  const counts = store.importDataFile(fixtureText("withSchedules"));
  assert.ok(counts.ops > 0);
  const state = store.getState();
  assert.equal(state.status, "ready");
  if (state.status !== "ready") return;
  assert.ok(state.posted.length > 5, "due payments posted after the import");
  const text = store.exportDataFile();
  const again = createStore(memoryDb(), testEnv(), () => "en");
  again.open();
  again.importDataFile(text);
  const s2 = again.getState();
  assert.equal(s2.status === "ready" && s2.data.ops.length, state.data.ops.length);
});

test("rates: updated when switched on and due; a failing network changes nothing but the note", async () => {
  const db = memoryDb();
  const store = createStore(db, testEnv(), () => "en");
  store.open();
  store.begin("empty", (s) => s);
  const offline = async () => {
    throw new Error("offline");
  };
  assert.equal(await store.updateRates(offline), null, "automatic updates are off by default");
  const s0 = store.getState();
  const ratesBefore = s0.status === "ready" ? s0.data.rates : {};
  const note = await store.updateRates(offline, true);
  assert.equal(note?.ok, false);
  const s1 = store.getState();
  assert.deepEqual(s1.status === "ready" && s1.data.rates, ratesBefore);
  const answer = JSON.stringify({ result: "success", base_code: "USD", rates: { USD: 1, KGS: 87.45, EUR: 0.86 } });
  const online = async () => ({ ok: true, status: 200, text: async () => answer });
  const ok = await store.updateRates(online, true);
  assert.equal(ok?.ok, true);
  const s2 = store.getState();
  assert.equal(s2.status === "ready" && s2.data.rates.USD, 87.45);
  assert.equal(loadLedger(db)?.rates.USD, 87.45, "stored");
});
