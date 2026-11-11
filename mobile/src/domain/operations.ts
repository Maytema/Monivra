// Operations: checking, storing, deleting and changing many at once.
//
// Second amounts (what a transfer's destination received, the amount in a category's currency, the
// received side of a cross-currency adjustment) follow these rules, the same for the editor, bulk
// edits and scheduled payments:
//   1. An edit that changes nothing financial (comment, tags, photos, date, time) never changes an
//      amount: the stored second amount is a fact of the past, not something re-derived from today's
//      rate. (The first application re-priced it on such edits: FINANCIAL_RULES_AUDIT F-1.)
//   2. A second amount the person typed is stored as typed.
//   3. When an input of the price changes — the amount, the fees, or the currency of a side (another
//      account or category in another currency) — and the second amount was not typed, it is
//      converted at the current rate, exactly as when the operation was created.
//   Replacing an account or category by one in the same currency changes no price.
import { DomainError } from "./errors.ts";
import { addDays, isValidDate, parseDate } from "./dates.ts";
import type { Env } from "./env.ts";
import { accountById, categoryById } from "./ledger.ts";
import type { LedgerTx } from "./change.ts";
import { convert, netAmount } from "./money.ts";
import type { Account, Category, LedgerData, LocalDate, Minor, Operation, ScheduledPayment } from "./types.ts";

export interface Lookup {
  account(id: string | null | undefined): Account | undefined;
  category(id: string | null | undefined): Category | undefined;
  main: string;
  rates: LedgerData["rates"];
}

export const lookupOf = (data: LedgerData): Lookup => ({
  account: (id) => accountById(data, id),
  category: (id) => categoryById(data, id),
  main: data.settings.currency,
  rates: data.rates,
});

const typedSecond = (d: Operation): Minor | null =>
  d.receiveManual === true && Number.isSafeInteger(d.receive) && (d.receive ?? 0) > 0 ? (d.receive as Minor) : null;

const sameFees = (a: Operation, b: Operation): boolean => JSON.stringify(a.fees ?? []) === JSON.stringify(b.fees ?? []);

// What the price of the second amount depends on.
function priceInputs(o: Operation, lk: Lookup): string {
  const currencyOf = (id: string | null | undefined) => lk.account(id)?.currency ?? "";
  const base = [o.type, o.amount, JSON.stringify(o.fees ?? [])];
  if (o.type === "transfer") return JSON.stringify([...base, currencyOf(o.from), currencyOf(o.to)]);
  if (o.type === "adjustment") return JSON.stringify([...base, o.from ? "out" : "in", currencyOf(o.from || o.to), lk.main]);
  return JSON.stringify([...base, currencyOf(o.from || o.to), lk.category(o.category)?.currency ?? ""]);
}

const tooSmall = () => new DomainError("Converted amount is too small or too large for the destination currency");

// A checked and normalised copy of an operation draft. `previous` is the stored version when an
// existing operation is edited; it decides whether second amounts are kept (rules above).
export function validateOp(draft: Operation, lk: Lookup, previous?: Operation): Operation {
  const d: Operation = { ...draft, tags: [...(draft.tags ?? [])], comment: draft.comment ?? "" };
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0) throw new DomainError("Enter an amount greater than zero");
  if (!isValidDate(d.date)) throw new DomainError("Choose a valid date");
  const unchangedPrice = previous !== undefined && typedSecond(d) === null && priceInputs(d, lk) === priceInputs(previous, lk);

  if (d.type === "transfer") {
    const from = lk.account(d.from),
      to = lk.account(d.to);
    if (!from || !to || d.from === d.to) throw new DomainError("Choose two different accounts");
    const kept = unchangedPrice && previous?.receive !== undefined ? previous.receive : null;
    d.receive = typedSecond(d) ?? kept ?? convert(netAmount(d), from.currency, to.currency, lk.rates);
    if (!Number.isSafeInteger(d.receive) || d.receive <= 0) throw tooSmall();
    delete d.category;
    delete d.categoryAmount;
  } else if (d.type === "adjustment") {
    const account = lk.account(d.from || d.to);
    if (!account || !!d.from === !!d.to) throw new DomainError("Select an account");
    const [sent, got] = d.to ? [lk.main, account.currency] : [account.currency, lk.main];
    if (sent === got) delete d.receive;
    else {
      const kept = unchangedPrice && previous?.receive !== undefined ? previous.receive : null;
      d.receive = typedSecond(d) ?? kept ?? convert(d.amount, sent, got, lk.rates);
      if (!Number.isSafeInteger(d.receive) || d.receive <= 0) throw tooSmall();
    }
    delete d.category;
    delete d.categoryAmount;
  } else if (d.type === "expense" || d.type === "income") {
    const category = lk.category(d.category);
    if (!category) throw new DomainError("Select a category");
    if (category.type !== d.type) throw new DomainError("Category does not match operation type");
    const accountId = d.type === "expense" ? d.from || d.to : d.to || d.from;
    const account = lk.account(accountId);
    if (!account) throw new DomainError("Select an account");
    if (d.type === "expense") {
      d.from = accountId;
      delete d.to;
    } else {
      d.to = accountId;
      delete d.from;
    }
    if (category.currency === account.currency) delete d.categoryAmount;
    else {
      const stored = previous?.categoryAmount;
      const kept = unchangedPrice && stored?.currency === category.currency ? stored.amount : null;
      const own = typedSecond(d) ?? kept ?? convert(d.amount, account.currency, category.currency, lk.rates);
      if (!Number.isSafeInteger(own) || own <= 0) throw tooSmall();
      d.categoryAmount = { currency: category.currency, amount: own };
    }
    // Income: the account gets what is left after fees; expense: the account pays in full.
    if (d.type === "income" && d.fees?.length) d.receive = netAmount(d);
    else delete d.receive;
  } else throw new DomainError("Unsupported operation type");
  delete d.receiveManual;
  if (!d.fees?.length) delete d.fees;
  return d;
}

// More than a year from today either way: perhaps a slip of the finger.
export const isFarDate = (date: LocalDate, today: LocalDate): boolean =>
  date < addDays(today, -365) || date > addDays(today, 365);

// A date after today (not a correction of a balance) has not happened yet.
export const isPlanned = (d: Operation, today: LocalDate): boolean => d.type !== "adjustment" && d.date > today;

export const earliestScheduleDate = (today: LocalDate): LocalDate => addDays(today, 1);

// An operation as a one-time scheduled payment.
export function scheduledForm(op: Operation, time: string): ScheduledPayment {
  const d: ScheduledPayment = { ...op, recur: null, reminder: null, time: op.time ?? time };
  delete d.fromSchedule;
  return d;
}

// A month or year rule keeps the day it began on; editing the date starts it from the new day.
function keepRuleDay(d: ScheduledPayment, previous: ScheduledPayment | undefined): void {
  const rule = d.recur && (d.recur.unit === "Months" || d.recur.unit === "Years");
  if (!rule) delete d.anchorDay;
  else if (previous?.date === d.date && previous.anchorDay) d.anchorDay = previous.anchorDay;
  else d.anchorDay = parseDate(d.date).getUTCDate();
}

const FORM_ONLY = ["expr", "editing", "origin", "error", "fresh"];

// Store an operation (or, with `schedule`, a scheduled payment). An operation dated after today
// becomes a one-time scheduled payment instead. Returns what was stored and where it went.
export function putOperation(
  tx: LedgerTx,
  draft: Operation | ScheduledPayment,
  env: Env,
  schedule = false,
): { saved: Operation; planned: boolean } {
  const clean = { ...draft } as Record<string, unknown>;
  for (const key of FORM_ONLY) delete clean[key];
  const lk = lookupOf(tx.data);
  const today = env.clock.today();
  const previous = draft.id ? (schedule ? tx.get("scheduled", draft.id) : tx.get("ops", draft.id)) : undefined;
  const d = validateOp(clean as unknown as Operation, lk, previous) as ScheduledPayment;
  // A scheduled payment keeps a typed second amount, so it is posted as typed.
  if (schedule && typedSecond(draft)) d.receiveManual = true;
  if (!d.id) d.id = env.newId();
  if (!schedule && isPlanned(d, today)) {
    tx.remove("ops", d.id);
    tx.put("scheduled", scheduledForm(d, env.clock.time()));
    return { saved: d, planned: true };
  }
  if (schedule) {
    const stored = tx.get("scheduled", d.id);
    if (d.date < earliestScheduleDate(today) && (!stored || stored.date !== d.date))
      throw new DomainError("A scheduled payment starts tomorrow at the earliest");
    if (d.recur === undefined) d.recur = null;
    if (d.reminder === undefined) d.reminder = null;
    keepRuleDay(d, stored);
    tx.put("scheduled", d);
  } else {
    if (!d.fromSchedule) delete d.time;
    const op: Operation = { ...d };
    delete (op as Partial<ScheduledPayment>).recur;
    delete (op as Partial<ScheduledPayment>).reminder;
    delete (op as Partial<ScheduledPayment>).anchorDay;
    tx.put("ops", op);
    return { saved: op, planned: false };
  }
  return { saved: d, planned: false };
}

export function deleteOperations(tx: LedgerTx, ids: string[], scheduled = false): void {
  tx.remove(scheduled ? "scheduled" : "ops", ...ids);
}

// Operations dated ahead that arrived from a file wait among the scheduled payments.
export function planFutureOperations(tx: LedgerTx, env: Env): number {
  const today = env.clock.today();
  const future = tx.data.ops.filter((o) => isPlanned(o, today));
  if (!future.length) return 0;
  const taken = new Set(tx.data.scheduled.map((o) => o.id));
  tx.remove("ops", ...future.map((o) => o.id));
  for (const op of future) {
    const item = scheduledForm(op, env.clock.time());
    if (taken.has(item.id)) item.id = env.newId();
    taken.add(item.id);
    tx.put("scheduled", item);
  }
  return future.length;
}

// ---- Bulk changes ---------------------------------------------------------------------------------

export interface BulkChanges {
  category: string | null;
  account: string | null;
  role: "sender" | "receiver";
  comment: string | null;
  addTags: string[];
  removeTags: string[];
  clearTags: boolean;
  date: LocalDate | null;
}

export const emptyBulkChanges = (): BulkChanges => ({
  category: null,
  account: null,
  role: "sender",
  comment: null,
  addTags: [],
  removeTags: [],
  clearTags: false,
  date: null,
});

// The account an operation's amount is counted in.
const amountAccountId = (op: Operation): string | null | undefined =>
  op.type === "transfer" ? op.from : op.type === "income" ? op.to : op.type === "adjustment" ? op.to || op.from : op.from;

// Moving an operation's amount to an account of another currency would create or lose money.
export function bulkAccountProblem(data: LedgerData, ids: string[], accountId: string, role: BulkChanges["role"]): string | null {
  const target = accountById(data, accountId);
  if (!target) return "Select an account";
  const wanted = new Set(ids);
  const clash = data.ops.some(
    (op) =>
      wanted.has(op.id) &&
      !(op.type === "transfer" && role === "receiver") &&
      accountById(data, amountAccountId(op))?.currency !== target.currency,
  );
  return clash ? "Operations in another currency cannot be moved to this account. Choose an account in the same currency." : null;
}

// Apply the same changes to many operations; nothing changes if one of them turns out invalid.
// Returns how many moved to the scheduled payments (a date in the future).
export function applyBulkChanges(tx: LedgerTx, ids: string[], changes: BulkChanges, env: Env): number {
  if (changes.account) {
    const problem = bulkAccountProblem(tx.data, ids, changes.account, changes.role);
    if (problem) throw new DomainError(problem);
  }
  const lk = lookupOf(tx.data);
  const wanted = new Set(ids);
  const replacements = tx.data.ops
    .filter((op) => wanted.has(op.id))
    .map((original) => {
      const op: Operation = { ...original, tags: [...(original.tags ?? [])] };
      const adjustment = op.type === "adjustment";
      if (changes.category && op.type !== "transfer" && !adjustment) {
        const account = op.from || op.to;
        const type = lk.category(changes.category)?.type;
        if (!type) throw new DomainError("Select a category");
        op.category = changes.category;
        op.type = type;
        op.from = type === "expense" ? account : null;
        op.to = type === "income" ? account : null;
      }
      if (changes.account) {
        if (op.type === "transfer") op[changes.role === "receiver" ? "to" : "from"] = changes.account;
        else if (adjustment) op[op.to ? "to" : "from"] = changes.account;
        else if (op.type === "income") op.to = changes.account;
        else op.from = changes.account;
      }
      if (changes.date) op.date = changes.date;
      if (changes.comment !== null) op.comment = changes.comment;
      op.tags = changes.clearTags
        ? []
        : [...new Set([...op.tags, ...changes.addTags])].filter((tag) => !changes.removeTags.includes(tag));
      return adjustment ? op : validateOp(op, lk, original);
    });
  let planned = 0;
  const today = env.clock.today();
  for (const op of replacements)
    if (isPlanned(op, today)) {
      tx.remove("ops", op.id);
      tx.put("scheduled", scheduledForm(op, env.clock.time()));
      planned++;
    } else tx.put("ops", op);
  return planned;
}

// Adds tag names that are not known yet to the list of tags.
export function rememberTags(tx: LedgerTx, names: readonly string[]): void {
  const fresh = names.filter((n) => n && !tx.data.tags.includes(n));
  if (fresh.length) tx.setTags([...tx.data.tags, ...fresh]);
}

// A tag renamed everywhere: in the list and in every operation and scheduled payment that carries it.
export function renameTag(tx: LedgerTx, from: string, to: string): void {
  if (!to || (to !== from && tx.data.tags.includes(to))) throw new DomainError("Tag already exists");
  tx.setTags(tx.data.tags.map((t) => (t === from ? to : t)));
  for (const key of ["ops", "scheduled"] as const) {
    const changed = tx.data[key].filter((op) => op.tags.includes(from)).map((op) => ({ ...op, tags: op.tags.map((t) => (t === from ? to : t)) }));
    tx.put(key, ...(changed as never[]));
  }
}

// A tag removed from the list and from every operation and scheduled payment.
export function deleteTag(tx: LedgerTx, name: string): void {
  tx.setTags(tx.data.tags.filter((t) => t !== name));
  for (const key of ["ops", "scheduled"] as const) {
    const changed = tx.data[key].filter((op) => op.tags.includes(name)).map((op) => ({ ...op, tags: op.tags.filter((t) => t !== name) }));
    tx.put(key, ...(changed as never[]));
  }
}

export { sameFees };
