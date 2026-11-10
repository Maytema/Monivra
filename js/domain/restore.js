/* Restoring data from a backup or a data file: what a restore would do, worked out before anything is
   changed. One engine serves the saved backups and the data files, so they cannot disagree. */
import { deepClone } from "../core/constants.js";
import { findDataProblem } from "../data/storage.js";

// The lists of records, with the key that makes two records "the same" across devices.
const LISTS = ["accounts", "categories", "ops", "scheduled", "budgets"];

// Records written the same way, whatever the order of their fields.
const stable = (x) =>
  JSON.stringify(x, (key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

// What a dataset holds, counted the way the person thinks of it.
export function contentsOf(data) {
  const accounts = data.accounts;
  return {
    accounts: accounts.length,
    regular: accounts.filter((a) => a.type === "Regular" && !(a.limit > 0)).length,
    cards: accounts.filter((a) => a.type === "Regular" && a.limit > 0).length,
    savings: accounts.filter((a) => a.type === "Savings").length,
    debts: accounts.filter((a) => a.type === "Debt").length,
    categories: data.categories.filter((c) => !c.parent).length,
    subcategories: data.categories.filter((c) => c.parent).length,
    ops: data.ops.length,
    scheduled: data.scheduled.length,
    budgets: data.budgets.length,
    tags: data.tags.length,
    currencies: [...new Set(accounts.map((a) => a.currency))].sort(),
  };
}

// A category of the backup that has the id of a category here but is the other kind (an income
// category where this device has an expense one, say) cannot be the same category: taking either
// would leave operations with a category that does not fit them. In a merge it is kept as a category
// of its own under a new id, and what points to it (operations, scheduled payments, budgets, its
// subcategories) follows. The new id is made from the old one, so merging the same backup again finds
// it and adds nothing twice. No operation changes its kind, amount or date. Returns how many moved.
function separateCategories(current, source) {
  const have = new Map(current.categories.map((c) => [c.id, c]));
  const moved = new Map();
  for (const c of source.categories) {
    const there = have.get(c.id);
    if (there && there.type !== c.type) moved.set(c.id, `${c.id}~${c.type}`);
  }
  // A subcategory of a category that moved moves too when its own id is taken here.
  for (let more = true; more; ) {
    more = false;
    for (const c of source.categories)
      if (c.parent && moved.has(c.parent) && have.has(c.id) && !moved.has(c.id)) {
        moved.set(c.id, `${c.id}~${c.type}`);
        more = true;
      }
  }
  if (!moved.size) return 0;
  const to = (id) => moved.get(id) ?? id;
  source.categories = source.categories.map((c) => ({
    ...c,
    id: to(c.id),
    ...(c.parent && { parent: to(c.parent) }),
  }));
  for (const list of ["ops", "scheduled"])
    source[list] = source[list].map((x) => (x.category ? { ...x, category: to(x.category) } : x));
  source.budgets = source.budgets.map((b) =>
    b.categories ? { ...b, categories: b.categories.map(to) } : b,
  );
  return moved.size;
}

// The records of a list by id: the backup's version where both have the id (or the current one
// with `keepCurrent`), and the records only the current data has stay. `report` counts what happened to the backup's records.
function mergeList(current, incoming, keepCurrent = false) {
  const byId = new Map(current.map((x) => [x.id, x]));
  const report = { added: 0, changed: 0, same: 0, items: [] };
  for (const record of incoming) {
    const have = byId.get(record.id);
    if (!have) report.added++;
    else if (stable(have) === stable(record)) report.same++;
    else {
      report.changed++;
      report.items.push({ now: have, backup: record });
    }
  }
  // Where both have the id, one version stays: the backup's, or the one here when asked.
  const merged = keepCurrent
    ? [...current, ...incoming.filter((x) => !byId.has(x.id))]
    : [...current.filter((x) => !incoming.some((y) => y.id === x.id)), ...incoming];
  return { merged, report };
}

// Operations that look like the same record under another id: same kind, day, amount, accounts,
// category and comment. They are added all the same (nothing is dropped silently) but reported.
const lookKey = (o) => [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");

// Ids of the records a scheduled payment points to that `data` does not have.
function missingReferences(item, accountIds, categoryIds) {
  return (
    (item.from && !accountIds.has(item.from)) ||
    (item.to && !accountIds.has(item.to)) ||
    (item.category && !categoryIds.has(item.category))
  );
}

// Works out the dataset after a restore, and what it changes, without touching `current`.
//   mode "replace": the data becomes the incoming data; "merge": the incoming data is added.
//   conflicts "backup" | "keep" (merge only): which version stays where the same id is in both; the
//   backup carries no time of editing, so neither can be told to be the newer one.
//   scheduled "count" | "skip": the scheduled payments of the incoming data are taken over;
//   "none": the current scheduled payments stay (those that point to something that is gone are let go).
// Returns { next, summary, problem }: `problem` is set when the result would not be valid data, and
// then nothing may be applied.
export function planRestore(current, incoming, { mode, scheduled, conflicts = "backup" }) {
  const source = deepClone(incoming);
  const summary = { mode, conflicts, incoming: contentsOf(source), current: contentsOf(current) };
  let next;
  if (mode === "replace") {
    next = {
      ...source,
      scheduled: scheduled === "none" ? deepClone(current.scheduled) : source.scheduled,
    };
    summary.scheduledLetGo = 0;
    if (scheduled === "none") {
      const accountIds = new Set(next.accounts.map((a) => a.id));
      const categoryIds = new Set(next.categories.map((c) => c.id));
      const kept = next.scheduled.filter((x) => !missingReferences(x, accountIds, categoryIds));
      summary.scheduledLetGo = next.scheduled.length - kept.length;
      next.scheduled = kept;
    }
  } else {
    const report = {};
    summary.categoriesSeparated = separateCategories(current, source);
    next = deepClone(current);
    for (const list of LISTS) {
      if (list === "scheduled" && scheduled === "none") continue;
      const { merged, report: counts } = mergeList(
        current[list],
        source[list],
        conflicts === "keep",
      );
      next[list] = merged;
      report[list] = counts;
    }
    next.tags = [...new Set([...current.tags, ...source.tags])];
    report.tags = { added: next.tags.length - current.tags.length };
    // The rates of the current data win; the backup only adds currencies this device lacks.
    next.rates = { ...source.rates, ...current.rates };
    summary.merge = report;
    const known = new Set(current.ops.map(lookKey));
    const knownIds = new Set(current.ops.map((o) => o.id));
    summary.lookAlike = source.ops.filter(
      (o) => !knownIds.has(o.id) && known.has(lookKey(o)),
    ).length;
    const knownAccounts = new Set(current.accounts.map((a) => `${a.name}|${a.currency}`));
    const accountIds = new Set(current.accounts.map((a) => a.id));
    summary.sameAccountNames = source.accounts.filter(
      (a) => !accountIds.has(a.id) && knownAccounts.has(`${a.name}|${a.currency}`),
    ).length;
  }
  next.backups = current.backups;
  const problem = findDataProblem(next);
  summary.after = problem ? null : contentsOf(next);
  return { next, summary, problem };
}
