// A restore chunk by chunk: the result equals the one-go restore, a cancel in the middle leaves the data as it was, a second restore
// while one runs is refused, and a big file goes through in many chunks with the screen given back between them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/application/store.ts";
import { Cancelled, compareLedgers, loadLedger, type Step } from "../src/data/repository.ts";
import { putOperation } from "../src/domain/operations.ts";
import { DomainError } from "../src/domain/errors.ts";
import type { LedgerData } from "../src/domain/types.ts";
import { fixture, memoryDb, testEnv } from "./support/helpers.ts";

const options = { mode: "replace", scheduled: "restore", conflicts: "incoming" } as never;

function start() {
  const db = memoryDb();
  const env = testEnv();
  const store = createStore(db, env, () => "en");
  store.open();
  store.begin("starter", (s) => s);
  const data = (): LedgerData => {
    const s = store.getState();
    assert.equal(s.status, "ready");
    return s.status === "ready" ? s.data : (undefined as never);
  };
  return { db, env, store, data };
}

// A bigger ledger: the starter's account and category with `n` operations.
function bigger(n: number): LedgerData {
  const { store, env, data } = start();
  const account = data().accounts[0]!.id;
  const category = data().categories.find((c) => c.type === "expense" && !c.parent)!.id;
  for (let i = 0; i < n; i++) {
    const day = `2026-${String(1 + (i % 10)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`;
    store.run((tx) => putOperation(tx, { id: "", type: "expense", from: account, category, amount: 100 + i, date: day, comment: "", tags: [] }, env));
  }
  return data();
}

test("chunked restore gives the same ledger as the one-go restore", async () => {
  const incoming = fixture("sample");
  const a = start();
  a.store.restore(incoming, options);
  const b = start();
  const steps: Step[] = [];
  await b.store.restoreAsync(incoming, options, { progress: (s) => steps.push(s), chunk: 3 });
  assert.deepEqual(compareLedgers(a.data(), b.data()), []);
  assert.deepEqual(compareLedgers(b.data(), loadLedger(b.db)!), []);
  assert.ok(steps.length > 5 && steps.some((s) => s.what === "operations"));
});

test("cancelled in the middle: the database and the screens' data stay as they were", async () => {
  const { store, db, data } = start();
  const before = data();
  const stop = new AbortController();
  const incoming = fixture("sample");
  await assert.rejects(
    store.restoreAsync(incoming, options, {
      signal: stop.signal,
      chunk: 2,
      progress: (s) => {
        if (s.what === "operations") stop.abort();
      },
    }),
    (e) => e instanceof Cancelled,
  );
  assert.deepEqual(compareLedgers(before, loadLedger(db)!), []);
  assert.deepEqual(compareLedgers(before, data()), []);
  assert.equal(store.busy(), false);
  // and the store is usable afterwards
  await store.restoreAsync(incoming, options, { chunk: 50 });
  assert.equal(data().ops.length, incoming.ops.length);
  assert.deepEqual(compareLedgers(data(), loadLedger(db)!), []);
});

test("a second restore while one runs is refused, and so is any other command", async () => {
  const { store, data } = start();
  const incoming = fixture("sample");
  let second: unknown = null;
  let command: unknown = null;
  await store.restoreAsync(incoming, options, {
    chunk: 2,
    pause: async () => {
      await Promise.resolve();
      if (second === null) {
        second = await store.restoreAsync(incoming, options).catch((e) => e);
        try {
          store.run(() => undefined);
        } catch (e) {
          command = e;
        }
      }
    },
  });
  assert.ok(second instanceof DomainError);
  assert.ok(command instanceof DomainError);
  assert.equal(data().ops.length, incoming.ops.length);
});

test("a big ledger (3000 operations) is written in many chunks", async () => {
  const big = bigger(3000);
  const { store, db, data } = start();
  let pauses = 0;
  await store.restoreAsync(big, options, { pause: async () => void pauses++ });
  assert.equal(data().ops.length, 3000);
  assert.deepEqual(compareLedgers(big, loadLedger(db)!).filter((x) => !x.startsWith("settings")), []);
  assert.ok(pauses >= 12, `${pauses} pauses`);
});

test("an import written in chunks: cancel rolls the whole change back, a finished one equals the one-go run", async () => {
  const { store, env, db, data } = start();
  const account = data().accounts[0]!.id;
  const category = data().categories.find((c) => c.type === "expense" && !c.parent)!.id;
  const many = (tx: Parameters<Parameters<typeof store.run>[0]>[0]) => {
    for (let i = 0; i < 700; i++) putOperation(tx, { id: "", type: "expense", from: account, category, amount: 100 + i, date: "2026-11-05", comment: "", tags: [] }, env);
    return 700;
  };
  const before = data();
  const stop = new AbortController();
  await assert.rejects(store.runAsync(many, { signal: stop.signal, chunk: 100, progress: (s) => s.done >= 300 && stop.abort() }), (e) => e instanceof Cancelled);
  assert.equal(data().ops.length, before.ops.length);
  assert.deepEqual(compareLedgers(before, loadLedger(db)!), []);
  assert.equal(store.busy(), false);
  let pauses = 0;
  assert.equal(await store.runAsync(many, { chunk: 100, pause: async () => void pauses++ }), 700);
  assert.equal(data().ops.length, before.ops.length + 700);
  assert.deepEqual(compareLedgers(data(), loadLedger(db)!), []);
  assert.ok(pauses >= 6);
});
