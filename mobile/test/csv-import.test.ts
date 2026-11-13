// CSV import: every step gives what the first application's gives on the same files
// (test/fixtures/old-import.json, written by test/parity/run-old.mjs), and adding and undoing an import
// go through the store as one change each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/application/store.ts";
import { LedgerTx } from "../src/domain/change.ts";
import { applyImport, categoryPath, guessColumns, guessFormats, guessLinks, planImport, readRecords, readTable, referencesOf, undoImport } from "../src/domain/csv-import.ts";
import { csvText } from "../src/domain/csv.ts";
import type { LedgerData } from "../src/domain/types.ts";
import { compareLedgers } from "../src/data/repository.ts";
import { fixture, fixtureText, memoryDb, testEnv } from "./support/helpers.ts";

const cases = JSON.parse(fixtureText("old-import")) as Record<string, any>;

function steps(data: LedgerData, text: string) {
  const table = readTable(text);
  const mapping = guessColumns(table.headers);
  const formats = guessFormats(table, mapping);
  const records = readRecords(table, mapping, formats);
  const links = guessLinks(data, referencesOf(records));
  const plan = planImport(data, records, links, testEnv("2026-11-11", "12:00"));
  return { mapping, formats, records, links, plan };
}

for (const [name, c] of Object.entries(cases))
  test(`parity: CSV import "${name}" reads, links and plans as the first application`, () => {
    const sample = fixture("sample");
    const data: LedgerData = c.base === "sample" ? sample : { ...sample, accounts: [], categories: [], ops: [], scheduled: [], budgets: [], tags: [] };
    const { mapping, formats, records, links, plan } = steps(data, c.text);
    assert.deepEqual(mapping, c.mapping);
    assert.deepEqual(formats, c.formats);
    assert.deepEqual(records.map((r) => (r.problem ? r.problem.text.replace("{type}", String(r.problem.params?.type)) : null)), c.problems);
    const accountName = (id?: string | null) => data.accounts.find((a) => a.id === id)?.name ?? plan.created.accounts.find((a) => a.id === id)?.name ?? "";
    const all = [...data.categories, ...plan.created.categories];
    const categoryName = (id?: string | null) => {
      const found = all.find((x) => x.id === id);
      return found ? categoryPath(found, all) : "";
    };
    assert.deepEqual([...links.accounts].map(([k, v]) => [k, v === "new" ? "new" : accountName(v)]), c.links.accounts);
    assert.deepEqual([...links.categories].map(([k, v]) => [k, v === "new" ? "new" : categoryName(v)]), c.links.categories);
    const mine = {
      total: plan.total,
      duplicates: plan.duplicates,
      repeated: plan.repeated,
      ignoredSigns: plan.ignoredSigns,
      future: plan.future,
      newTags: plan.newTags,
      lines: plan.lines,
      invalid: plan.invalid.map((x) => x.line),
      created: { accounts: plan.created.accounts.map((a) => `${a.name}:${a.currency}`), categories: plan.created.categories.map((x) => `${x.type}:${categoryName(x.id)}`) },
      ops: plan.ops.map((o) => [o.type, o.date, o.amount, accountName(o.from), accountName(o.to), categoryName(o.category), o.receive ?? null, o.comment, (o.tags ?? []).join("|")].join(";")),
    };
    assert.deepEqual(mine, c.plan);
  });

test("an exported CSV imported again adds nothing; importing into an empty ledger adds every row; undo takes it away", () => {
  // A cell is read trimmed (as in the first application), so comments are compared trimmed.
  const raw = fixture("report");
  const data = { ...raw, ops: raw.ops.map((o) => ({ ...o, comment: o.comment.trim() })) };
  const text = csvText(data, data.ops);
  assert.equal(steps(data, text).plan.ops.length, 0, "every row is already there");
  assert.equal(steps(data, text).plan.duplicates, data.ops.length);
  const db = memoryDb();
  const env = testEnv("2026-11-11", "12:00");
  const store = createStore(db, env, () => "en");
  store.open();
  store.begin("empty", (s) => s);
  const state = () => {
    const s = store.getState();
    if (s.status !== "ready") throw new Error("not ready");
    return s.data;
  };
  const before = state();
  const { plan } = steps(before, text);
  assert.equal(plan.invalid.length, 0);
  const added = store.run((tx) => applyImport(tx, plan, env));
  assert.equal(state().ops.length + state().scheduled.length, data.ops.length);
  store.run((tx) => undoImport(tx, added));
  assert.deepEqual(compareLedgers(before, state()), []);
  // A plan is worked out without changing anything.
  const tx = new LedgerTx(before);
  assert.equal(tx.data, before);
});

test("file text: UTF-8, UTF-16 with its mark and Windows-1251 read as the platform's decoder reads them", async () => {
  const { decodeText } = await import("../src/domain/text-decode.ts");
  const text = "дата;сумма;Ёлка № 5 — «тест» €\r\nemoji 😀 ok";
  assert.equal(decodeText(new TextEncoder().encode(text), "utf-8"), text);
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(decodeText(all, "windows-1251"), new TextDecoder("windows-1251").decode(all));
  const le = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((ch) => { const c = ch.charCodeAt(0); return [c & 255, c >> 8]; })]);
  assert.equal(decodeText(le, "utf-8"), [...text].map((ch) => String.fromCharCode(ch.charCodeAt(0))).join(""));
  assert.equal(decodeText(new Uint8Array([0x61, 0xc3, 0x28, 0xe2, 0x82]), "utf-8"), new TextDecoder("utf-8").decode(new Uint8Array([0x61, 0xc3, 0x28, 0xe2, 0x82])));
});
