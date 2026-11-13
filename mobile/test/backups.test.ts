// Saved backups, restoring (merge and replace) and deleting data: the plans equal the first
// application's (test/fixtures/old-restore.json, written by test/parity/run-old.mjs), and the store
// keeps the money rules while it applies them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, type Store } from "../src/application/store.ts";
import { completeData } from "../src/domain/datafile.ts";
import { accountBalance } from "../src/domain/ledger.ts";
import { planRestore } from "../src/domain/restore.ts";
import type { LedgerData } from "../src/domain/types.ts";
import { MAX_BACKUPS } from "../src/data/backups.ts";
import { compareLedgers, loadLedger } from "../src/data/repository.ts";
import { fixture, fixtureText, memoryDb, testEnv } from "./support/helpers.ts";

const plans = JSON.parse(fixtureText("old-restore")) as Record<string, any>[];
const ledger = (raw: unknown): LedgerData => completeData(JSON.parse(JSON.stringify(raw)), "en");

for (const p of plans)
  test(`parity: restore plan "${p.name}" is the first application's`, () => {
    const { next, summary, problem } = planRestore(ledger(p.current), ledger(p.incoming), p.options);
    assert.equal(problem && { what: problem.what, number: problem.number }, p.problem);
    const merge = summary.merge && Object.fromEntries(Object.entries(summary.merge).map(([k, r]) => [k, (r as any).items ? { ...r, items: (r as any).items.map((x: any) => x.now.id) } : r]));
    for (const key of ["mode", "conflicts", "scheduledLetGo", "categoriesSeparated", "lookAlike", "sameAccountNames", "incoming", "current", "after"])
      assert.deepEqual((summary as any)[key], p.summary[key], key);
    assert.deepEqual(merge, p.summary.merge);
    assert.deepEqual(next.accounts.map((a) => a.id), p.next.accounts);
    assert.deepEqual(next.categories.map((c) => `${c.id}:${c.type}:${c.parent ?? ""}`), p.next.categories);
    assert.deepEqual(next.ops.map((o) => `${o.id}:${o.amount}:${o.category ?? ""}:${o.comment}`), p.next.ops);
    assert.deepEqual(next.scheduled.map((x) => x.id), p.next.scheduled);
    assert.deepEqual(next.budgets.map((b) => b.id), p.next.budgets);
    assert.deepEqual(next.tags, p.next.tags);
    for (const [code, rate] of Object.entries(p.next.rates)) assert.equal(next.rates[code], rate, `rate ${code}`);
  });

function openWith(name: "sample" | "report" | "withSchedules", day = "2026-11-11"): { store: Store; db: ReturnType<typeof memoryDb> } {
  const db = memoryDb();
  const store = createStore(db, testEnv(day, "12:00"), () => "en");
  store.open();
  store.importDataFile(fixtureText(name));
  return { store, db };
}
const data = (store: Store): LedgerData => {
  const s = store.getState();
  if (s.status !== "ready") throw new Error("not ready");
  return s.data;
};

test("backups: newest first, at most ten, each the whole ledger; the daily one once a day and only when switched on", () => {
  const { store } = openWith("sample");
  assert.equal(store.dailyBackup(), null, "Save locally is off");
  for (let i = 0; i < MAX_BACKUPS + 3; i++) store.createBackup("manual");
  const list = store.backups();
  assert.equal(list.length, MAX_BACKUPS);
  assert.equal(list[0]!.ops, data(store).ops.length);
  assert.deepEqual(compareLedgers(data(store), store.backupData(list[0]!.id)!), []);
  store.run((tx) => tx.setSettings({ autoBackup: true }));
  // Backups made today already count as today's copy.
  assert.equal(store.dailyBackup(), null);
  const db = memoryDb();
  const fresh = createStore(db, testEnv("2026-11-12", "08:00"), () => "en");
  fresh.open();
  fresh.importDataFile(fixtureText("sample"));
  fresh.run((tx) => tx.setSettings({ autoBackup: true }));
  assert.equal(fresh.dailyBackup()?.reason, "auto");
  assert.equal(fresh.dailyBackup(), null);
  assert.equal(fresh.backups().length, 1);
});

test("replace: the ledger becomes the backup's, a safety backup of the data before is kept, the lock settings stay", () => {
  const { store, db } = openWith("report");
  store.run((tx) => tx.setSettings({ pin: true, lockDelay: 60 }));
  const before = data(store);
  const incoming = fixture("sample");
  store.restore(incoming, { mode: "replace", scheduled: "count", conflicts: "keep" });
  const after = data(store);
  assert.deepEqual(compareLedgers(incoming, after), []);
  assert.equal(after.settings.pin, true);
  assert.equal(after.settings.lockDelay, 60);
  const safety = store.backups()[0]!;
  assert.equal(safety.reason, "safety");
  assert.deepEqual(compareLedgers(before, store.backupData(safety.id)!), []);
  assert.deepEqual(compareLedgers(after, loadLedger(db)!), []);
  // The safety backup brings everything back.
  store.restore(store.backupData(safety.id)!, { mode: "replace", scheduled: "count", conflicts: "keep" });
  assert.deepEqual(compareLedgers(before, data(store)), []);
});

test("merge: keeps what is here, adds what only the backup has; merging the same backup twice changes nothing", () => {
  const { store } = openWith("sample");
  const here = data(store);
  const backup = JSON.parse(JSON.stringify(here)) as LedgerData;
  backup.ops[0]!.comment = "edited in the backup";
  backup.ops.push({ ...backup.ops[1]!, id: "only-in-backup", amount: 777 });
  const summary = store.restore(backup, { mode: "merge", scheduled: "count", conflicts: "keep", safety: false });
  assert.equal(summary.merge?.ops?.added, 1);
  assert.equal(summary.merge?.ops?.changed, 1);
  const once = data(store);
  assert.equal(once.ops.find((o) => o.id === here.ops[0]!.id)?.comment, here.ops[0]!.comment, "the version here stays");
  assert.equal(once.ops.length, here.ops.length + 1);
  store.restore(backup, { mode: "merge", scheduled: "count", conflicts: "keep", safety: false });
  assert.deepEqual(compareLedgers(once, data(store)), []);
  store.restore(backup, { mode: "merge", scheduled: "count", conflicts: "backup", safety: false });
  assert.equal(data(store).ops.find((o) => o.id === here.ops[0]!.id)?.comment, "edited in the backup");
});

test("restoring with 'skip' lets the payments that came due go and moves them on; 'count' posts them once", () => {
  const counted = openWith("sample");
  const incoming = fixture("withSchedules");
  counted.store.restore(incoming, { mode: "replace", scheduled: "count", conflicts: "keep", safety: false });
  const posted = data(counted.store).ops.filter((o) => o.fromSchedule).length;
  assert.ok(posted > 0);
  const skipped = openWith("sample");
  skipped.store.restore(incoming, { mode: "replace", scheduled: "skip", conflicts: "keep", safety: false });
  const after = data(skipped.store);
  assert.equal(after.ops.filter((o) => o.fromSchedule).length, 0);
  assert.ok(after.scheduled.every((x) => x.date > "2026-11-11" || (x.date === "2026-11-11" && (x.time ?? "00:00") > "12:00")));
});

test("deleting: operations only (balances go back to the opening), partial, backups, everything", () => {
  const { store } = openWith("sample");
  store.createBackup("manual");
  const before = data(store);
  store.deleteData("operations", { backup: true });
  const after = data(store);
  assert.equal(after.ops.length, 0);
  assert.equal(after.accounts.length, before.accounts.length);
  for (const a of after.accounts) assert.equal(accountBalance(after, a.id), a.opening);
  assert.equal(store.backups()[0]!.reason, "safety");
  assert.equal(store.backups()[0]!.ops, before.ops.length);
  store.deleteData("partial", { backup: false });
  assert.equal(data(store).accounts.length, 0);
  assert.equal(data(store).settings.currency, before.settings.currency);
  assert.equal(store.backups().length, 2);
  store.deleteData("backups");
  assert.equal(store.backups().length, 0);
  store.createBackup("manual");
  store.deleteData("everything");
  assert.equal(store.backups().length, 0);
  assert.equal(data(store).ops.length + data(store).accounts.length + data(store).categories.length, 0);
});
