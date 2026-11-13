// Restoring data from a saved backup or a data file: what a restore would do, worked out before anything
// is changed (port of the first application's js/domain/restore.js). One engine serves the backups and
// the data files, so they cannot disagree. Checked against the first application by test/parity.test.ts.
import { findDataProblem, type DataProblem } from "./datafile.ts";
import type { LedgerData } from "./types.ts";

type Loose = Record<string, unknown>;
type Rec = { id: string } & Loose;
const LISTS = ["accounts", "categories", "ops", "scheduled", "budgets"] as const;
type ListName = (typeof LISTS)[number];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// Records written the same way, whatever the order of their fields.
const stable = (x: unknown): string =>
  JSON.stringify(x, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Loose).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );

export interface Contents {
  accounts: number;
  regular: number;
  cards: number;
  savings: number;
  debts: number;
  categories: number;
  subcategories: number;
  ops: number;
  scheduled: number;
  budgets: number;
  tags: number;
  currencies: string[];
}

// What a dataset holds, counted the way the person thinks of it.
export function contentsOf(data: LedgerData): Contents {
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

// A category of the backup with the id of a category here but of the other kind cannot be the same
// category: in a merge it is kept under a new id made from the old one (so merging again finds it), and
// what points to it follows. No operation changes its kind, amount or date. Returns how many moved.
function separateCategories(current: LedgerData, source: LedgerData): number {
  const have = new Map(current.categories.map((c) => [c.id, c]));
  const moved = new Map<string, string>();
  for (const c of source.categories) {
    const there = have.get(c.id);
    if (there && there.type !== c.type) moved.set(c.id, `${c.id}~${c.type}`);
  }
  for (let more = true; more; ) {
    more = false;
    for (const c of source.categories)
      if (c.parent && moved.has(c.parent) && have.has(c.id) && !moved.has(c.id)) {
        moved.set(c.id, `${c.id}~${c.type}`);
        more = true;
      }
  }
  if (!moved.size) return 0;
  const to = (id: string) => moved.get(id) ?? id;
  source.categories = source.categories.map((c) => ({ ...c, id: to(c.id), ...(c.parent && { parent: to(c.parent) }) }));
  source.ops = source.ops.map((x) => (x.category ? { ...x, category: to(x.category) } : x));
  source.scheduled = source.scheduled.map((x) => (x.category ? { ...x, category: to(x.category) } : x));
  source.budgets = source.budgets.map((b) => (b.categories ? { ...b, categories: b.categories.map(to) } : b));
  return moved.size;
}

export interface ListReport {
  added: number;
  changed: number;
  same: number;
  items: { now: Rec; backup: Rec }[];
}

// The records of a list by id: the backup's version where both have the id (or the one here with
// `keepCurrent`); records only here stay.
function mergeList(current: readonly Rec[], incoming: readonly Rec[], keepCurrent: boolean): { merged: Rec[]; report: ListReport } {
  const byId = new Map(current.map((x) => [x.id, x]));
  const report: ListReport = { added: 0, changed: 0, same: 0, items: [] };
  for (const record of incoming) {
    const have = byId.get(record.id);
    if (!have) report.added++;
    else if (stable(have) === stable(record)) report.same++;
    else {
      report.changed++;
      report.items.push({ now: have, backup: record });
    }
  }
  const incomingIds = new Set(incoming.map((x) => x.id));
  const merged = keepCurrent ? [...current, ...incoming.filter((x) => !byId.has(x.id))] : [...current.filter((x) => !incomingIds.has(x.id)), ...incoming];
  return { merged, report };
}

// Operations that look like the same record under another id; added all the same, but reported.
const lookKey = (o: LedgerData["ops"][number]) => [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");

const missingReferences = (item: LedgerData["scheduled"][number], accountIds: Set<string>, categoryIds: Set<string>) =>
  (item.from && !accountIds.has(item.from)) || (item.to && !accountIds.has(item.to)) || (item.category && !categoryIds.has(item.category));

export type RestoreMode = "replace" | "merge";
export type ScheduledWay = "count" | "skip" | "none";
export type ConflictWay = "keep" | "backup";

export interface RestoreSummary {
  mode: RestoreMode;
  conflicts: ConflictWay;
  incoming: Contents;
  current: Contents;
  scheduledLetGo?: number;
  categoriesSeparated?: number;
  merge?: Partial<Record<ListName, ListReport>> & { tags?: { added: number } };
  lookAlike?: number;
  sameAccountNames?: number;
  after: Contents | null;
}

export interface RestorePlan {
  next: LedgerData;
  summary: RestoreSummary;
  problem: DataProblem | null;
}

// The dataset after a restore and what it changes, without touching `current`.
//   mode "replace": the data becomes the incoming data; "merge": the incoming data is added.
//   conflicts (merge only): which version stays where the same id is in both — a backup carries no time
//   of editing, so neither can be told to be newer.
//   scheduled "count" | "skip": the incoming scheduled payments are taken over; "none": the current ones
//   stay (those pointing to something that is gone are let go).
export function planRestore(current: LedgerData, incoming: LedgerData, options: { mode: RestoreMode; scheduled: ScheduledWay; conflicts?: ConflictWay }): RestorePlan {
  const { mode, scheduled } = options;
  const conflicts = options.conflicts ?? "backup";
  const source = clone(incoming);
  const summary: RestoreSummary = { mode, conflicts, incoming: contentsOf(source), current: contentsOf(current), after: null };
  let next: LedgerData;
  if (mode === "replace") {
    next = { ...source, scheduled: scheduled === "none" ? clone(current.scheduled) : source.scheduled };
    summary.scheduledLetGo = 0;
    if (scheduled === "none") {
      const accountIds = new Set(next.accounts.map((a) => a.id));
      const categoryIds = new Set(next.categories.map((c) => c.id));
      const kept = next.scheduled.filter((x) => !missingReferences(x, accountIds, categoryIds));
      summary.scheduledLetGo = next.scheduled.length - kept.length;
      next.scheduled = kept;
    }
  } else {
    const report: NonNullable<RestoreSummary["merge"]> = {};
    summary.categoriesSeparated = separateCategories(current, source);
    next = clone(current);
    for (const list of LISTS) {
      if (list === "scheduled" && scheduled === "none") continue;
      const { merged, report: counts } = mergeList(current[list] as unknown as Rec[], source[list] as unknown as Rec[], conflicts === "keep");
      (next as unknown as Record<ListName, Rec[]>)[list] = merged;
      report[list] = counts;
    }
    next.tags = [...new Set([...current.tags, ...source.tags])];
    report.tags = { added: next.tags.length - current.tags.length };
    // The rates here win; the backup only adds currencies this device lacks.
    next.rates = { ...source.rates, ...current.rates };
    summary.merge = report;
    const known = new Set(current.ops.map(lookKey));
    const knownIds = new Set(current.ops.map((o) => o.id));
    summary.lookAlike = source.ops.filter((o) => !knownIds.has(o.id) && known.has(lookKey(o))).length;
    const knownAccounts = new Set(current.accounts.map((a) => `${a.name}|${a.currency}`));
    const accountIds = new Set(current.accounts.map((a) => a.id));
    summary.sameAccountNames = source.accounts.filter((a) => !accountIds.has(a.id) && knownAccounts.has(`${a.name}|${a.currency}`)).length;
  }
  next.backups = [];
  const problem = findDataProblem(next);
  summary.after = problem ? null : contentsOf(next);
  return { next, summary, problem };
}

// ---- Deletion ---------------------------------------------------------------------------------

export type DeletionWay = "operations" | "partial" | "backups" | "everything";

// What each way of deleting removes (`kinds`), what the person is told, and the safeguards offered:
// `backup` a copy kept in the saved backups (offered switched on), `file` a data file saved outside,
// `typed` a word to write because nothing can bring the data back (js/domain/deletion.js).
export const DELETIONS: Record<DeletionWay, { title: string; note?: string; kinds: string[]; message: string; effects: string[]; backup?: boolean; file?: boolean; typed?: boolean; outside?: boolean; settings?: boolean }> = {
  operations: {
    title: "Delete operations",
    kinds: ["ops"],
    message: "All operations will be deleted. Balances go back to the opening balances.",
    effects: ["Accounts, categories, tags, budgets and scheduled payments stay, and so do the backups."],
    backup: true,
  },
  partial: {
    title: "Partial deletion",
    kinds: ["accounts", "categories", "ops", "tags", "scheduled", "budgets"],
    message: "Accounts, categories, operations, tags, budgets and scheduled payments will be deleted. Settings, exchange rates and backups stay.",
    effects: ["A backup that holds this data can bring it back."],
    backup: true,
    file: true,
  },
  backups: {
    title: "Delete backups",
    kinds: ["backups"],
    message: "The backups kept inside the app will be deleted. Your data stays.",
    outside: true,
    effects: [],
  },
  everything: {
    title: "Delete local data",
    note: "Everything: the data, backups, settings and reminders",
    kinds: ["accounts", "categories", "ops", "tags", "scheduled", "budgets", "backups"],
    settings: true,
    message: "All local app data, including internal backups, will be permanently deleted.",
    outside: true,
    effects: [],
    file: true,
    typed: true,
  },
};

// The ledger left by a deletion (the saved backups are kept apart, see the store).
export function afterDeletion(way: DeletionWay, data: LedgerData, empty: LedgerData): LedgerData {
  if (way === "operations") return { ...data, ops: [] };
  if (way === "partial") return { ...data, accounts: [], categories: [], ops: [], tags: [], scheduled: [], budgets: [] };
  if (way === "everything") return empty;
  return data;
}
