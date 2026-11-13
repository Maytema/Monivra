// The database: migration, import of a data file with verification, changes in one transaction,
// constraints that make a second record of one scheduled occurrence impossible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LedgerTx, applyChange } from "../src/domain/change.ts";
import { readDataFile, writeDataFile } from "../src/domain/datafile.ts";
import { accountBalance } from "../src/domain/ledger.ts";
import { putOperation } from "../src/domain/operations.ts";
import { postDue } from "../src/domain/scheduled.ts";
import { compareLedgers, loadLedger, persistChange, replaceLedger } from "../src/data/repository.ts";
import { inTransaction, migrate, MIGRATIONS, SCHEMA_VERSION, DatabaseTooNew } from "../src/data/schema.ts";
import { fixture, fixtureText, memoryDb, testEnv } from "./support/helpers.ts";

const NOW = "2026-11-11T06:00:00.000Z";

test("a data file of the first application imports whole and reads back the same", () => {
  for (const name of ["sample", "report", "withSchedules"] as const) {
    const db = memoryDb();
    migrate(db);
    const data = fixture(name);
    const counts = replaceLedger(db, data, NOW);
    assert.equal(counts.ops, data.ops.length);
    const back = loadLedger(db);
    assert.ok(back);
    assert.deepEqual(compareLedgers(data, back), [], name);
    for (const a of data.accounts) assert.equal(accountBalance(back, a.id), accountBalance(data, a.id));
  }
});

test("exporting writes a data file that reads back as the same ledger (round trip)", () => {
  const data = fixture("report");
  const text = writeDataFile(data, { app: "Monivra", build: "test" });
  const again = readDataFile(text, "en").data;
  assert.deepEqual(compareLedgers(data, again), []);
  // The original file of the first application and our export agree record by record.
  const original = JSON.parse(fixtureText("report")) as { ops: unknown[] };
  assert.equal(again.ops.length, original.ops.length);
});

test("a damaged or foreign file is refused with a reason and changes nothing", () => {
  assert.throws(() => readDataFile("{not json", "en"), /damaged/);
  assert.throws(() => readDataFile(JSON.stringify({ schema: 2 }), "en"), (e: Error & { problem?: { reason: string } }) => /version/.test(e.problem?.reason ?? ""));
  assert.throws(() => readDataFile('{"schema":1,"__proto__":{"x":1}}', "en"), /names that a backup never has/);
  const broken = JSON.parse(fixtureText("sample")) as { ops: { amount: number }[] };
  broken.ops[0]!.amount = -5;
  assert.throws(() => readDataFile(JSON.stringify(broken), "en"), (e: Error & { problem?: { what: string } }) => e.problem?.what === "Operation");
});

test("a change is written in one transaction and the database follows the memory", () => {
  const db = memoryDb();
  migrate(db);
  const env = testEnv();
  let data = fixture("withSchedules");
  replaceLedger(db, data, NOW);
  const tx = new LedgerTx(data);
  const { posted } = postDue(tx, env);
  assert.ok(posted.length > 5);
  const next = applyChange(data, tx.change);
  persistChange(db, tx.change, next, NOW);
  data = next;
  const back = loadLedger(db);
  assert.ok(back);
  assert.deepEqual(compareLedgers(data, back), []);
  // Deleting records writes tombstones (for undo and, later, sync).
  const one = new LedgerTx(data);
  one.remove("ops", posted[0]!);
  persistChange(db, one.change, applyChange(data, one.change), NOW);
  assert.equal(db.all("SELECT * FROM tombstone").length, 1);
});

test("the database refuses a second record of the same occurrence and an invalid row, and keeps everything else", () => {
  const db = memoryDb();
  migrate(db);
  const env = testEnv();
  const data = fixture("withSchedules");
  replaceLedger(db, data, NOW);
  const tx = new LedgerTx(data);
  postDue(tx, env);
  const next = applyChange(data, tx.change);
  persistChange(db, tx.change, next, NOW);
  const first = next.ops.find((o) => o.fromSchedule)!;
  const before = db.all("SELECT COUNT(*) AS n FROM operation")[0];
  const twin = new LedgerTx(next);
  twin.put("ops", { ...first, id: "another-id" });
  assert.throws(() => persistChange(db, twin.change, applyChange(next, twin.change), NOW), /UNIQUE/);
  const bad = new LedgerTx(next);
  bad.put("ops", { ...first, id: "x", fromSchedule: undefined, from: "no-such-account" } as never);
  assert.throws(() => persistChange(db, bad.change, applyChange(next, bad.change), NOW), /FOREIGN KEY/);
  assert.deepEqual(db.all("SELECT COUNT(*) AS n FROM operation")[0], before);
});

test("a failed import leaves the stored ledger as it was", () => {
  const db = memoryDb();
  migrate(db);
  const data = fixture("sample");
  replaceLedger(db, data, NOW);
  const broken = { ...fixture("report") };
  broken.ops = [...broken.ops, { ...broken.ops[0]!, id: "dangling", from: "missing", to: undefined, type: "expense" }];
  assert.throws(() => replaceLedger(db, broken, NOW));
  const back = loadLedger(db);
  assert.ok(back);
  assert.deepEqual(compareLedgers(data, back), []);
});

test("migrations: a fresh database gets the newest schema; a newer one is not touched", () => {
  const db = memoryDb();
  assert.equal(migrate(db), SCHEMA_VERSION);
  assert.equal(migrate(db), SCHEMA_VERSION);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  assert.throws(() => migrate(db), DatabaseTooNew);
});

test("the SQL view and the application compute the same balances", () => {
  const db = memoryDb();
  migrate(db);
  const env = testEnv();
  const data = fixture("report");
  replaceLedger(db, data, NOW);
  const tx = new LedgerTx(data);
  putOperation(tx, { id: "", type: "transfer", from: data.accounts[0]!.id, to: data.accounts[1]!.id, amount: 12345, date: "2026-11-10", comment: "", tags: [] }, env);
  const next = applyChange(data, tx.change);
  persistChange(db, tx.change, next, NOW);
  for (const row of db.all<{ account_id: string; balance: number }>("SELECT account_id, balance FROM account_balance"))
    assert.equal(row.balance, accountBalance(next, row.account_id));
});

test("migration 2 (saved backups): a database of version 1 keeps every record and balance and gains the backup table", () => {
  const db = memoryDb();
  db.exec("PRAGMA foreign_keys = ON");
  inTransaction(db, () => {
    db.exec(MIGRATIONS[0]!.sql);
    db.exec("PRAGMA user_version = 1");
  });
  const data = fixture("report");
  replaceLedger(db, data, "2026-11-11T12:00:00.000Z");
  migrate(db);
  assert.equal(Number(db.all<{ user_version: number }>("PRAGMA user_version")[0]?.user_version), SCHEMA_VERSION);
  assert.deepEqual(compareLedgers(data, loadLedger(db)!), []);
  assert.deepEqual(db.all("SELECT * FROM backup"), []);
});
