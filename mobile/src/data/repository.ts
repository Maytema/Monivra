// Reading the ledger from the database and writing changes to it. Every write is one transaction: a
// change is stored whole or not at all, and the database's constraints are checked before it ends.
import { LIST_KEYS, type Change, type ListKey } from "../domain/change.ts";
import { accountBalance } from "../domain/ledger.ts";
import type { Account, Budget, Category, LedgerData, Operation, ScheduledPayment, Settings } from "../domain/types.ts";
import { inTransaction, type SqlDriver, type SqlValue } from "./schema.ts";

type Row = Record<string, SqlValue>;
type Loose = Record<string, unknown>;

const bool = (v: unknown): number => (v ? 1 : 0);
const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
const parse = <T>(v: SqlValue | undefined): T | undefined => (typeof v === "string" ? (JSON.parse(v) as T) : undefined);
const num = (v: SqlValue | undefined): number => Number(v ?? 0);

// Fields of a record that have no column are kept in `extra_json`, so nothing of a file is lost.
function extraOf(record: object, known: readonly string[]): string | null {
  const rest: Loose = {};
  for (const [key, value] of Object.entries(record)) if (!known.includes(key) && value !== undefined) rest[key] = value;
  return Object.keys(rest).length ? JSON.stringify(rest) : null;
}

// ---- Accounts and categories -------------------------------------------------------------------

const ACCOUNT_FIELDS = ["id", "name", "type", "currency", "opening", "goal", "limit", "totalDebt", "debt", "include", "archived", "favorite", "description", "icon", "color", "considerExpense", "considerIncome", "showExpense", "showIncome"];

const accountRow = (a: Account, sort: number, now: string): SqlValue[] => [
  a.id, a.name, a.type, a.currency, a.opening, a.goal ?? 0, a.limit ?? 0, a.totalDebt ?? null, a.debt ?? "Owe me",
  bool(a.include), bool(a.archived), bool(a.favorite), a.description ?? "", a.icon, a.color,
  bool(a.considerExpense), bool(a.considerIncome), bool(a.showExpense), bool(a.showIncome), sort, extraOf(a, ACCOUNT_FIELDS), now,
];
const ACCOUNT_SQL = `INSERT INTO account (id, name, type, currency, opening, goal, limit_amount, total_debt, debt, include_total, archived, favorite, description, icon, color, consider_expense, consider_income, show_expense, show_income, sort_index, extra_json, updated_at)
VALUES (${Array(22).fill("?").join(",")})
ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, currency=excluded.currency, opening=excluded.opening, goal=excluded.goal, limit_amount=excluded.limit_amount, total_debt=excluded.total_debt, debt=excluded.debt, include_total=excluded.include_total, archived=excluded.archived, favorite=excluded.favorite, description=excluded.description, icon=excluded.icon, color=excluded.color, consider_expense=excluded.consider_expense, consider_income=excluded.consider_income, show_expense=excluded.show_expense, show_income=excluded.show_income, sort_index=excluded.sort_index, extra_json=excluded.extra_json, updated_at=excluded.updated_at`;

function accountOf(r: Row): Account {
  const a: Account = {
    ...(parse<Loose>(r.extra_json) ?? {}),
    id: String(r.id), name: String(r.name), type: r.type as Account["type"], opening: num(r.opening), icon: String(r.icon),
    color: String(r.color), currency: String(r.currency), goal: num(r.goal), limit: num(r.limit_amount), include: !!r.include_total,
    archived: !!r.archived, favorite: !!r.favorite, description: String(r.description ?? ""), debt: r.debt as Account["debt"],
    considerExpense: !!r.consider_expense, considerIncome: !!r.consider_income, showExpense: !!r.show_expense, showIncome: !!r.show_income,
  };
  if (r.total_debt !== null && r.total_debt !== undefined) a.totalDebt = num(r.total_debt);
  return a;
}

const CATEGORY_FIELDS = ["id", "name", "type", "parent", "currency", "icon", "color", "archived"];
const CATEGORY_SQL = `INSERT INTO category (id, name, type, parent_id, currency, icon, color, archived, sort_index, extra_json, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, parent_id=excluded.parent_id, currency=excluded.currency, icon=excluded.icon, color=excluded.color, archived=excluded.archived, sort_index=excluded.sort_index, extra_json=excluded.extra_json, updated_at=excluded.updated_at`;
const categoryRow = (c: Category, sort: number, now: string): SqlValue[] => [
  c.id, c.name, c.type, c.parent ?? null, c.currency, c.icon, c.color, bool(c.archived), sort, extraOf(c, CATEGORY_FIELDS), now,
];
const categoryOf = (r: Row): Category => ({
  ...(parse<Loose>(r.extra_json) ?? {}),
  id: String(r.id), name: String(r.name), type: r.type as Category["type"], parent: (r.parent_id as string | null) ?? null,
  currency: String(r.currency), icon: String(r.icon), color: String(r.color), archived: !!r.archived,
});

// ---- Operations and scheduled payments ---------------------------------------------------------

const RECORD_FIELDS = ["id", "type", "date", "time", "amount", "from", "to", "receive", "category", "categoryAmount", "fees", "comment", "tags", "photos", "recalculated"];
const RECORD_COLUMNS = "id, type, date, time, amount, from_account, to_account, receive, category_id, category_amount, category_currency, fees_json, comment, tags_json, photos_json, recalculated_json, extra_json, updated_at";

// A stale category on a transfer or a correction (older data) has no column there: it stays in extra.
function recordValues(o: Operation, known: readonly string[], now: string): SqlValue[] {
  const moves = o.type === "transfer" || o.type === "adjustment";
  const extra = extraOf(moves ? o : { ...o, category: undefined }, moves ? known.filter((k) => k !== "category") : known);
  return [
    o.id, o.type, o.date, o.time ?? null, o.amount, o.from ?? null, o.to ?? null, o.receive ?? null,
    moves ? null : (o.category ?? null), o.categoryAmount?.amount ?? null, o.categoryAmount?.currency ?? null, json(o.fees),
    o.comment ?? "", JSON.stringify(o.tags ?? []), json(o.photos), json(o.recalculated), extra, now,
  ];
}

function recordOf(r: Row): Operation {
  const o: Operation = {
    ...(parse<Loose>(r.extra_json) ?? {}),
    id: String(r.id), type: r.type as Operation["type"], amount: num(r.amount), date: String(r.date),
    comment: String(r.comment ?? ""), tags: parse<string[]>(r.tags_json) ?? [],
  };
  if (r.time !== null && r.time !== undefined) o.time = String(r.time);
  if (r.from_account !== null && r.from_account !== undefined) o.from = String(r.from_account);
  if (r.to_account !== null && r.to_account !== undefined) o.to = String(r.to_account);
  if (r.receive !== null && r.receive !== undefined) o.receive = num(r.receive);
  if (r.category_id !== null && r.category_id !== undefined) o.category = String(r.category_id);
  if (r.category_amount !== null && r.category_amount !== undefined) o.categoryAmount = { currency: String(r.category_currency), amount: num(r.category_amount) };
  const fees = parse<Operation["fees"]>(r.fees_json);
  if (fees) o.fees = fees;
  const photos = parse<string[]>(r.photos_json);
  if (photos) o.photos = photos;
  const recalculated = parse<Operation["recalculated"]>(r.recalculated_json);
  if (recalculated) o.recalculated = recalculated;
  return o;
}

const OP_FIELDS = [...RECORD_FIELDS, "fromSchedule"];
// An insert that updates the row with the same id, and fails (rather than replaces) on any other
// conflict — above all a second record of the same scheduled occurrence.
const upsertSql = (table: string, columns: string): string => {
  const names = columns.split(",").map((c) => c.trim());
  const updates = names.filter((c) => c !== "id").map((c) => `${c}=excluded.${c}`).join(", ");
  return `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
};
const OP_SQL = upsertSql("operation", `${RECORD_COLUMNS}, schedule_id, occurrence_date, posted_at, posted_by_hand`);
const opRow = (o: Operation, now: string): SqlValue[] => [
  ...recordValues(o, OP_FIELDS, now),
  o.fromSchedule?.id ?? null, o.fromSchedule?.date ?? null, o.fromSchedule?.postedAt ?? null, bool(o.fromSchedule?.byHand),
];
function opOf(r: Row): Operation {
  const o = recordOf(r);
  if (r.schedule_id !== null && r.schedule_id !== undefined)
    o.fromSchedule = {
      id: String(r.schedule_id), date: String(r.occurrence_date),
      ...(r.posted_at ? { postedAt: String(r.posted_at) } : {}),
      ...(r.posted_by_hand ? { byHand: true } : {}),
    };
  return o;
}

const SCHEDULED_FIELDS = [...RECORD_FIELDS, "receiveManual", "recur", "reminder", "anchorDay"];
const SCHEDULED_SQL = upsertSql("scheduled_payment", `${RECORD_COLUMNS}, receive_manual, recur_json, reminder_json, anchor_day`);
const scheduledRow = (s: ScheduledPayment, now: string): SqlValue[] => [
  ...recordValues(s, SCHEDULED_FIELDS, now), bool(s.receiveManual), json(s.recur), json(s.reminder), s.anchorDay ?? null,
];
function scheduledOf(r: Row): ScheduledPayment {
  const s = { ...recordOf(r), recur: parse<ScheduledPayment["recur"]>(r.recur_json) ?? null, reminder: parse<ScheduledPayment["reminder"]>(r.reminder_json) ?? null } as ScheduledPayment;
  if (r.receive_manual) s.receiveManual = true;
  if (r.anchor_day !== null && r.anchor_day !== undefined) s.anchorDay = num(r.anchor_day);
  return s;
}

const BUDGET_SQL = upsertSql("budget", "id, name, amount, currency, period, categories_json, sort_index, updated_at");
const budgetRow = (b: Budget, sort: number, now: string): SqlValue[] => [b.id, b.name, b.amount, b.currency, b.period, json(b.categories), sort, now];
const budgetOf = (r: Row): Budget => ({
  id: String(r.id), name: String(r.name), amount: num(r.amount), currency: String(r.currency),
  period: r.period as Budget["period"], categories: parse<string[]>(r.categories_json) ?? null,
});

const TABLE_OF: Record<ListKey, string> = { accounts: "account", categories: "category", ops: "operation", scheduled: "scheduled_payment", budgets: "budget" };

// ---- Reading -------------------------------------------------------------------------------------

export function loadLedger(db: SqlDriver): LedgerData | null {
  const settingsRows = db.all<{ key: string; value_json: string }>("SELECT key, value_json FROM setting");
  if (!settingsRows.length) return null;
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, JSON.parse(r.value_json) as unknown])) as Settings;
  return {
    schema: 1,
    // One favourite at most (a data file made elsewhere may name several): the first one stays.
    accounts: db.all<Row>("SELECT * FROM account ORDER BY sort_index, rowid").map(accountOf).map((a, i, all) => (a.favorite && all.findIndex((x) => x.favorite) !== i ? { ...a, favorite: false } : a)),
    categories: db.all<Row>("SELECT * FROM category ORDER BY sort_index, rowid").map(categoryOf),
    ops: db.all<Row>("SELECT * FROM operation ORDER BY rowid").map(opOf),
    scheduled: db.all<Row>("SELECT * FROM scheduled_payment ORDER BY rowid").map(scheduledOf),
    budgets: db.all<Row>("SELECT * FROM budget ORDER BY sort_index, rowid").map(budgetOf),
    tags: db.all<{ name: string }>("SELECT name FROM tag ORDER BY sort_index").map((r) => r.name),
    backups: [],
    settings,
    rates: Object.fromEntries(db.all<{ code: string; kgs_per_unit: number }>("SELECT code, kgs_per_unit FROM rate").map((r) => [r.code, r.kgs_per_unit])),
  };
}

// ---- Writing -------------------------------------------------------------------------------------

function writeTags(db: SqlDriver, tags: readonly string[]): void {
  db.run("DELETE FROM tag");
  tags.forEach((name, i) => db.run("INSERT OR IGNORE INTO tag (name, sort_index) VALUES (?, ?)", [name, i]));
}

function writeSettings(db: SqlDriver, settings: Partial<Settings>): void {
  for (const [key, value] of Object.entries(settings))
    if (value !== undefined) db.run("INSERT OR REPLACE INTO setting (key, value_json) VALUES (?, ?)", [key, JSON.stringify(value)]);
}

function writeRates(db: SqlDriver, rates: LedgerData["rates"]): void {
  db.run("DELETE FROM rate");
  for (const [code, value] of Object.entries(rates)) db.run("INSERT INTO rate (code, kgs_per_unit) VALUES (?, ?)", [code, value]);
}

// Writes a change in one transaction. `next` is the data after the change (it gives list order). As steps (see replaceSteps): it
// yields after every 250 rows, so a big change (an import) can be written a chunk at a time.
function* persistSteps(db: SqlDriver, change: Change, next: LedgerData, now: string, chunk = CHUNK): Generator<Step, void> {
  let written = 0;
  const total =
    LIST_KEYS.reduce((n, key) => n + (change.remove[key]?.length ?? 0), 0) + (change.put.accounts?.length ?? 0) + (change.put.categories?.length ?? 0) + (change.put.ops?.length ?? 0) + (change.put.scheduled?.length ?? 0) + (change.put.budgets?.length ?? 0);
  function* count(what: Step["what"]): Generator<Step> {
    written += 1;
    if (written % chunk === 0 && written < total) yield { what, done: written, total };
  }
  for (const key of LIST_KEYS)
    for (const id of change.remove[key] ?? []) {
      db.run(`DELETE FROM ${TABLE_OF[key]} WHERE id = ?`, [id]);
      db.run("INSERT OR REPLACE INTO tombstone (table_name, row_id, deleted_at) VALUES (?, ?, ?)", [TABLE_OF[key], id, now]);
      yield* count("clearing");
    }
  const position = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x, i) => [x.id, i]));
  const accountPos = position(next.accounts);
  const accounts = change.order.accounts ? next.accounts : (change.put.accounts ?? []);
  for (const a of accounts) {
    db.run(ACCOUNT_SQL, accountRow(a, accountPos.get(a.id) ?? 0, now));
    yield* count("accounts");
  }
  const categoryPos = position(next.categories);
  const categories = change.order.categories ? next.categories : (change.put.categories ?? []);
  for (const c of categories) {
    db.run(CATEGORY_SQL, categoryRow(c, categoryPos.get(c.id) ?? 0, now));
    yield* count("categories");
  }
  for (const o of change.put.ops ?? []) {
    db.run(OP_SQL, opRow(o, now));
    yield* count("operations");
  }
  for (const s of change.put.scheduled ?? []) {
    db.run(SCHEDULED_SQL, scheduledRow(s, now));
    yield* count("scheduled");
  }
  const budgetPos = position(next.budgets);
  for (const b of change.put.budgets ?? []) {
    db.run(BUDGET_SQL, budgetRow(b, budgetPos.get(b.id) ?? 0, now));
    yield* count("budgets");
  }
  if (change.tags) writeTags(db, change.tags);
  if (change.settings) writeSettings(db, change.settings);
  if (change.rates) writeRates(db, change.rates);
}

export function persistChange(db: SqlDriver, change: Change, next: LedgerData, now: string): void {
  inTransaction(db, () => drain(persistSteps(db, change, next, now)));
}

class ImportMismatch extends Error {}

// A restore is written as steps: a generator that yields between chunks of rows, so that the same code runs in one go
// (replaceLedger, inside one transaction) and, on the phone, chunk by chunk with the screen drawn in between and the person able
// to cancel (replaceLedgerAsync). `what` says what is being written, `done` of `total` rows of it.
export interface Step {
  what: "clearing" | "accounts" | "categories" | "operations" | "scheduled" | "budgets" | "settings" | "checking";
  done: number;
  total: number;
}
export interface Stored {
  accounts: number;
  ops: number;
  scheduled: number;
  back: LedgerData;
}
const CHUNK = 250;

function drain<T>(steps: Generator<unknown, T>): T {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

function* replaceSteps(db: SqlDriver, data: LedgerData, now: string, chunk = CHUNK): Generator<Step, Stored> {
  yield { what: "clearing", done: 0, total: 1 };
  for (const table of ["operation", "scheduled_payment", "budget", "category", "account", "tag", "setting", "rate", "tombstone"]) db.run(`DELETE FROM ${table}`);
  function* rows<T>(what: Step["what"], list: readonly T[], write: (item: T, i: number) => void): Generator<Step> {
    for (let i = 0; i < list.length; i++) {
      write(list[i]!, i);
      if ((i + 1) % chunk === 0 && i + 1 < list.length) yield { what, done: i + 1, total: list.length };
    }
    yield { what, done: list.length, total: list.length };
  }
  yield* rows("accounts", data.accounts, (a, i) => db.run(ACCOUNT_SQL, accountRow(a, i, now)));
  yield* rows("categories", data.categories, (c, i) => db.run(CATEGORY_SQL, categoryRow(c, i, now)));
  yield* rows("operations", data.ops, (o) => db.run(OP_SQL, opRow(o, now)));
  yield* rows("scheduled", data.scheduled, (s) => db.run(SCHEDULED_SQL, scheduledRow(s, now)));
  yield* rows("budgets", data.budgets, (b, i) => db.run(BUDGET_SQL, budgetRow(b, i, now)));
  writeTags(db, data.tags);
  writeSettings(db, data.settings);
  writeRates(db, data.rates);
  yield { what: "settings", done: 1, total: 1 };
  yield { what: "checking", done: 0, total: 1 };
  const back = loadLedger(db);
  if (!back) throw new ImportMismatch("nothing was stored");
  yield { what: "checking", done: 1, total: 2 };
  const problems = yield* compareSteps(data, back);
  const sqlBalances = new Map(db.all<{ account_id: string; balance: number }>("SELECT account_id, balance FROM account_balance").map((r) => [r.account_id, r.balance]));
  for (const a of data.accounts) if (sqlBalances.get(a.id) !== accountBalance(data, a.id)) problems.push(`balance of ${a.id} differs in the database`);
  if (problems.length) throw new ImportMismatch(problems.slice(0, 5).join("; "));
  return { accounts: back.accounts.length, ops: back.ops.length, scheduled: back.scheduled.length, back };
}

// Replaces everything with `data` (a data file being brought in) and checks, before the transaction
// ends, that what reads back is the same ledger: the same records and the same balance of every
// account. Any difference rolls everything back.
export function replaceLedger(db: SqlDriver, data: LedgerData, now: string): { accounts: number; ops: number; scheduled: number } {
  return inTransaction(db, () => {
    const { accounts, ops, scheduled } = drain(replaceSteps(db, data, now));
    return { accounts, ops, scheduled };
  });
}

// Runs steps in one transaction, a chunk at a time (shared by the restore and by an import).
async function runSteps<T>(db: SqlDriver, steps: Generator<Step, T>, { signal, progress, pause = yieldToScreen }: { signal?: AbortSignal; progress?: (step: Step) => void; pause?: () => Promise<void> }): Promise<T> {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (;;) {
      if (signal?.aborted) throw new Cancelled();
      const next = steps.next();
      if (next.done) {
        db.exec("COMMIT");
        return next.value;
      }
      progress?.(next.value);
      await pause();
    }
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // the transaction was already gone (a failed COMMIT ends it)
    }
    throw error;
  }
}

// The same for a change (an import of many operations): rolled back whole on cancel.
export function persistChangeAsync(db: SqlDriver, change: Change, next: LedgerData, now: string, control: { signal?: AbortSignal; progress?: (step: Step) => void; pause?: () => Promise<void>; chunk?: number } = {}): Promise<void> {
  return runSteps(db, persistSteps(db, change, next, now, control.chunk), control);
}

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}
const yieldToScreen = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// The same, a chunk at a time: between chunks the screen is drawn and touches are handled (`pause`), `progress` is told what is being
// written, and `signal` stops it: the transaction is rolled back and nothing has changed. The caller must keep every other write to
// the database away while it runs (the store does).
export function replaceLedgerAsync(
  db: SqlDriver,
  data: LedgerData,
  now: string,
  control: { signal?: AbortSignal; progress?: (step: Step) => void; pause?: () => Promise<void>; chunk?: number } = {},
): Promise<Stored> {
  return runSteps(db, replaceSteps(db, data, now, control.chunk), control);
}

const canonical = (x: unknown): string =>
  JSON.stringify(x, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Loose).filter(([, v]) => v !== undefined && v !== null).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );

// Differences between two ledgers, record by record (null and missing fields count as the same). As steps: it yields after every
// list and every 50 records, so a long comparison can be paused between them.
function* compareSteps(a: LedgerData, b: LedgerData): Generator<Step, string[]> {
  const problems: string[] = [];
  for (const key of LIST_KEYS) {
    const left = a[key] as { id: string }[],
      right = new Map((b[key] as { id: string }[]).map((x) => [x.id, x]));
    if (left.length !== right.size) problems.push(`${key}: ${left.length} ≠ ${right.size}`);
    for (let i = 0; i < left.length; i++) {
      const x = left[i]!;
      if (canonical(x) !== canonical(right.get(x.id))) problems.push(`${key} ${x.id} differs`);
      if ((i + 1) % 250 === 0) yield { what: "checking", done: 1, total: 2 };
    }
  }
  if (canonical(a.tags) !== canonical(b.tags)) problems.push("tags differ");
  yield { what: "checking", done: 1, total: 2 };
  for (let i = 0; i < a.accounts.length; i++) {
    const a2 = a.accounts[i]!;
    if (accountBalance(a, a2.id) !== accountBalance(b, a2.id)) problems.push(`balance of ${a2.id} differs`);
    if ((i + 1) % 10 === 0) yield { what: "checking", done: 1, total: 2 };
  }
  return problems;
}
export function compareLedgers(a: LedgerData, b: LedgerData): string[] {
  return drain(compareSteps(a, b));
}
