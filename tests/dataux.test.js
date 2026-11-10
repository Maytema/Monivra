/* The Data section: the merge of a backup whose categories clash with the ones here, the prepared
   exports (what makes one out of date), the CSV column names and the deletion safeguards. The asynchronous
   behaviour (one print dialog per request, no stale dialogs) is checked in the browser scenarios. */
import { check } from "./harness.js";
import { today, deepClone } from "../js/core/constants.js";
import { appData, emptyFilters } from "../js/core/state.js";
import { COLUMN_LABELS, csvExample, csvTable, csvTemplate } from "../js/data/csv.js";
import { signatureOf } from "../js/data/report-cache.js";
import { findDataProblem, save } from "../js/data/storage.js";
import { planRestore } from "../js/domain/restore.js";

// An income category of the backup that has the id of an expense category here.
function clashingBackup() {
  const category = appData.categories.find((c) => c.type === "expense" && !c.parent);
  const incoming = deepClone(appData);
  incoming.categories = incoming.categories.map((c) =>
    c.id === category.id ? { ...c, type: "income", name: "Bonus" } : c,
  );
  const account = incoming.accounts[0];
  incoming.ops = incoming.ops
    .filter(
      (o) =>
        o.category !== category.id &&
        !incoming.categories.some((c) => c.parent === category.id && c.id === o.category),
    )
    .concat({
      id: "clash-op",
      type: "income",
      amount: 12345,
      date: today(),
      comment: "",
      tags: [],
      to: account.id,
      category: category.id,
    });
  incoming.categories = incoming.categories.filter((c) => c.parent !== category.id);
  return { category, incoming };
}

check(
  "Restore: a backup category with the id of another kind here is added as its own category",
  () => {
    const { category, incoming } = clashingBackup();
    if (findDataProblem(incoming)) return false; // the backup itself is sound
    const plan = planRestore(appData, incoming, { mode: "merge", scheduled: "count" });
    const added = plan.next.ops.find((o) => o.id === "clash-op");
    const moved = plan.next.categories.find((c) => c.id === added?.category);
    return (
      plan.problem === null &&
      plan.summary.categoriesSeparated === 1 &&
      added.type === "income" &&
      added.amount === 12345 &&
      moved.type === "income" &&
      moved.id !== category.id &&
      plan.next.categories.find((c) => c.id === category.id).type === "expense" &&
      // nothing here changed its kind, amount or category
      appData.ops.every((o) => {
        const now = plan.next.ops.find((x) => x.id === o.id);
        return now && now.type === o.type && now.amount === o.amount && now.category === o.category;
      }) &&
      plan.next.ops.length === appData.ops.length + 1
    );
  },
);

check("Restore: merging the same clashing backup twice adds nothing the second time", () => {
  const { incoming } = clashingBackup();
  const once = planRestore(appData, incoming, { mode: "merge", scheduled: "count" });
  const twice = planRestore(once.next, incoming, { mode: "merge", scheduled: "count" });
  return (
    twice.problem === null &&
    twice.next.ops.length === once.next.ops.length &&
    twice.next.categories.length === once.next.categories.length
  );
});

check("Restore: a backup that is not valid cannot be merged or replace the data", () => {
  const { incoming } = clashingBackup();
  const broken = deepClone(incoming);
  broken.ops.find((o) => o.id === "clash-op").type = "expense"; // an expense with an income category
  const merge = planRestore(appData, broken, { mode: "merge", scheduled: "count" });
  const replace = planRestore(appData, broken, { mode: "replace", scheduled: "count" });
  return Boolean(merge.problem) && Boolean(replace.problem);
});

check("Export: a prepared file is out of date when anything it is made from changes", () => {
  const base = {
    mode: "summary",
    filters: emptyFilters(),
    period: { mode: "all" },
    sections: { charts: true, accounts: true },
    parts: { type: true, amount: true },
  };
  const same = signatureOf(base) === signatureOf(deepClone(base));
  const changes = [
    { ...base, mode: "detail" },
    { ...base, period: { mode: "year", date: "2026-01-01" } },
    { ...base, filters: { ...base.filters, types: ["expense"] } },
    { ...base, sections: { ...base.sections, accounts: false } },
  ].every((config) => signatureOf(config) !== signatureOf(base));
  // A part of the fields does not make another summary; for a CSV it does.
  const summaryIgnoresParts =
    signatureOf({ ...base, parts: { type: false } }) === signatureOf(base);
  const csv = { ...base, mode: "csv" };
  const csvUsesParts = signatureOf({ ...csv, parts: { type: false } }) !== signatureOf(csv);
  const before = signatureOf(base);
  save(); // any change of the data is saved
  const dataChanges = signatureOf(base) !== before;
  const language = appData.settings.language;
  const afterSave = signatureOf(base);
  appData.settings.language = language === "ru" ? "en" : "ru";
  const languageChanges = signatureOf(base) !== afterSave;
  appData.settings.language = language;
  return same && changes && summaryIgnoresParts && csvUsesParts && dataChanges && languageChanges;
});

check("CSV: every column has a plain name and the example rows have every column", () => {
  const columns = csvTemplate().split(",");
  const cells = csvExample().split("\r\n");
  return (
    columns.every((c) => COLUMN_LABELS[c]) &&
    cells.every((row) => row.split(",").length === columns.length) &&
    csvTable(appData.ops).columns.every((c) => columns.includes(c))
  );
});
