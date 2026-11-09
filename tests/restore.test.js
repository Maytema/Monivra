import { check } from "./harness.js";
import { createReportFixture } from "./report-fixture.js";
import { appData, setAppData } from "../js/core/state.js";
import { backupFileText, parseBackupFile } from "../js/data/backup-file.js";
import { findDataProblem } from "../js/data/storage.js";
import { createBackup, dataSnapshot, restoreData } from "../js/domain/backups.js";
import { planRestore } from "../js/domain/restore.js";

const stable = (x) => JSON.stringify(x, (k, v) => (k === "backups" ? undefined : v));
const refused = (text) => {
  try {
    parseBackupFile(text);
    return false;
  } catch (error) {
    return error.message.length > 0;
  }
};
// The text of a data file with something changed in the data first.
const fileWith = (change) => {
  const file = JSON.parse(backupFileText());
  change(file);
  return JSON.stringify(file);
};

check("A data file holds everything and reads back as exactly the same data", () => {
  for (const data of [appData, createReportFixture()]) {
    setAppData(data);
    const { data: read } = parseBackupFile(backupFileText());
    if (stable(read) !== stable(dataSnapshot())) return false;
  }
  return true;
});

check("A backup holds every list and the settings of the data it was made from", () => {
  const fixture = createReportFixture();
  fixture.scheduled = [
    { ...structuredClone(fixture.ops.find((o) => o.type === "expense")), id: "s1", recur: null },
  ];
  fixture.budgets = [
    {
      id: "b1",
      name: "Food",
      currency: "KGS",
      amount: 100000,
      period: "month",
      categories: ["food"],
    },
  ];
  fixture.tags = ["work", "долг"];
  setAppData(fixture);
  createBackup("manual");
  const kept = appData.backups[0].data;
  return (
    ["accounts", "categories", "ops", "tags", "scheduled", "budgets"].every(
      (list) => kept[list].length === appData[list].length && kept[list].length > 0,
    ) &&
    stable(kept.settings) === stable(appData.settings) &&
    stable(kept.rates) === stable(appData.rates) &&
    kept.backups.length === 0
  );
});

check("A file that is not a data file is refused, with a sentence for the person", () => {
  const deep = (n) => `{"a":${"[".repeat(n)}${"]".repeat(n)}}`;
  return [
    "",
    "   \n",
    "{",
    "[]",
    "null",
    "42",
    '"text"',
    "<html></html>",
    '{"schema":2}',
    '{"schema":1}',
    deep(40),
    fileWith((f) => delete f.accounts),
    fileWith((f) => (f.ops = {})),
    fileWith((f) => (f.settings = null)),
    fileWith((f) => (f.settings.language = "xx")),
    fileWith((f) => (f.settings.currency = "ZZZ")),
  ].every(refused);
});

check(
  "A file with a record that points to nothing, or a number that is not one, is refused",
  () => {
    const expense = (f) => f.ops.find((o) => o.type === "expense");
    return [
      fileWith((f) => (expense(f).from = "nowhere")),
      fileWith((f) => (expense(f).category = "nowhere")),
      fileWith((f) => (expense(f).amount = "12")),
      fileWith((f) => (expense(f).amount = 1.5)),
      fileWith((f) => (expense(f).amount = Number.MAX_SAFE_INTEGER + 2)),
      fileWith((f) => (expense(f).date = "2026-02-30")),
      fileWith((f) => f.ops.push({ ...expense(f) })),
      fileWith((f) => (f.accounts[0].opening = null)),
      fileWith((f) => (f.accounts[0].currency = "ZZZ")),
      fileWith((f) => (f.accounts[0].type = "Wallet")),
      fileWith((f) => (f.categories[0].parent = f.categories[0].id)),
      fileWith((f) =>
        f.budgets.push({
          id: "b",
          name: "x",
          amount: 0,
          currency: "KGS",
          period: "month",
          categories: null,
        }),
      ),
    ].every(refused);
  },
);

check("A file cannot reach the prototypes of objects, and nothing of it is run", () => {
  const poisoned = backupFileText().replace(
    '"schema": 1',
    '"schema": 1, "__proto__": {"polluted": 1}',
  );
  const nested = backupFileText().replace(
    '"accounts": [',
    '"accounts": [{"constructor": {"prototype": {"polluted": 1}}},',
  );
  const text = (key) =>
    backupFileText().replace('"schema": 1', `"schema": 1, "${key}": "alert(1)"`);
  return (
    refused(poisoned) &&
    refused(nested) &&
    // A name nobody knows is not taken over, and it does no harm.
    !("polluted" in {}) &&
    !("evil" in parseBackupFile(text("evil")).data)
  );
});

check("A file with more records than any real one is refused rather than worked through", () => {
  const many = `{"schema":1,"ops":[${"[],".repeat(4_000_001)}[]]}`;
  return refused(many);
});

check("Merging the same backup again adds nothing a second time", () => {
  const fixture = createReportFixture();
  const total = fixture.ops.length;
  setAppData(fixture);
  createBackup("manual");
  const [backup] = appData.backups;
  appData.ops = appData.ops.slice(0, 100);
  const options = { mode: "merge", scheduled: "count" };
  restoreData(backup.data, options);
  const once = stable(appData);
  const count = appData.ops.length;
  restoreData(backup.data, options);
  const lists = ["accounts", "categories", "ops", "tags", "scheduled", "budgets"];
  return (
    count === total &&
    stable(appData) === once &&
    lists.every((l) => new Set(appData[l].map((x) => x.id ?? x)).size === appData[l].length) &&
    !findDataProblem(appData)
  );
});

check("A merge that would leave data pointing to nothing is refused and changes nothing", () => {
  const fixture = createReportFixture();
  setAppData(fixture);
  const incoming = structuredClone(dataSnapshot());
  // In the file "food" is a subcategory of "transport"; here "market" is already a subcategory of
  // "food", so the merge would make a category with a category in between.
  incoming.categories.find((c) => c.id === "food").parent = "transport";
  const before = stable(appData);
  const plan = planRestore(appData, incoming, { mode: "merge", scheduled: "count" });
  let thrown = false;
  try {
    restoreData(incoming, { mode: "merge", scheduled: "count" });
  } catch {
    thrown = true;
  }
  return Boolean(plan.problem) && thrown && stable(appData) === before;
});

check("A replace makes a backup of the data first and a failed one changes nothing", () => {
  setAppData(createReportFixture());
  createBackup("manual");
  const [backup] = appData.backups;
  appData.ops = appData.ops.slice(0, 10);
  const held = appData.ops.length;
  const before = appData;
  const original = globalThis.Storage.prototype.setItem;
  globalThis.Storage.prototype.setItem = () => {
    throw Error("full");
  };
  let thrown = false;
  try {
    restoreData(backup.data, { mode: "replace", scheduled: "count", safety: true });
  } catch {
    thrown = true;
  } finally {
    globalThis.Storage.prototype.setItem = original;
  }
  const untouched = appData === before && appData.ops.length === held;
  restoreData(backup.data, { mode: "replace", scheduled: "count", safety: true });
  const safety = appData.backups.find((b) => b.reason === "safety");
  return thrown && untouched && safety?.data.ops.length === held && appData.ops.length > held;
});
