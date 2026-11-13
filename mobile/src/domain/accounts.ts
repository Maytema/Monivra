// Accounts: the form, storing, favorite, archive, deletion and currency changes.
import { DomainError } from "./errors.ts";
import type { LedgerTx } from "./change.ts";
import type { Env } from "./env.ts";
import { accountBalance, accountById, debtDirection } from "./ledger.ts";
import { convert } from "./money.ts";
import { lookupOf, putOperation, validateOp } from "./operations.ts";
import type { Account, LedgerData, Minor, Operation } from "./types.ts";

export const ACCOUNT_TYPES: readonly Account["type"][] = ["Regular", "Savings", "Debt"];

export function blankAccount(fields: Partial<Account> & { id: string }): Account {
  return {
    name: "",
    type: "Regular",
    opening: 0,
    icon: "wallet",
    color: "#a000b8",
    currency: "KGS",
    goal: 0,
    limit: 0,
    include: true,
    archived: false,
    favorite: false,
    description: "",
    debt: "Owe me",
    considerExpense: false,
    considerIncome: false,
    showExpense: false,
    showIncome: false,
    ...fields,
  };
}

// The form of an account: the record plus the balance shown and the debt operation switch.
export interface AccountDraft extends Omit<Account, "id"> {
  id: string | null;
  balance: Minor;
  createOperation: boolean;
  counterpart: string | null;
}

export function accountDraft(data: LedgerData, account?: Account): AccountDraft {
  const base = account ?? blankAccount({ id: "", color: "#9d00b5", currency: data.settings.currency });
  const draft: AccountDraft = {
    ...base,
    id: account ? account.id : null,
    balance: account ? accountBalance(data, account.id) : 0,
    createOperation: false,
    counterpart: data.accounts.find((x) => !x.archived && x.id !== account?.id && x.type === "Regular")?.id ?? null,
  };
  if (account?.type === "Debt") draft.debt = debtDirection(data, account);
  if (draft.type === "Debt" && draft.totalDebt === undefined) draft.totalDebt = Math.abs(account?.opening || draft.balance);
  return draft;
}

// A normalised copy of the form; throws a message for the person when it is invalid.
export function checkedAccountDraft(data: LedgerData, source: AccountDraft): AccountDraft {
  const draft: AccountDraft = { ...source, name: String(source.name || "").trim() };
  if (!draft.name) throw new DomainError("Enter a name");
  if (draft.name.length > 64) throw new DomainError("Name is too long");
  if (!ACCOUNT_TYPES.includes(draft.type)) throw new DomainError("Select account type");
  if (!((data.rates[draft.currency] ?? 0) > 0)) throw new DomainError("Select account currency");
  for (const value of [draft.balance, draft.goal, draft.limit])
    if (!Number.isSafeInteger(value || 0)) throw new DomainError("Invalid amount");
  if (draft.type === "Savings" && draft.goal < 0) throw new DomainError("Goal cannot be negative");
  if (draft.type === "Regular" && draft.limit < 0) throw new DomainError("Credit limit cannot be negative");
  if (draft.type === "Debt") {
    draft.balance = (draft.debt === "I owe" ? -1 : 1) * Math.abs(draft.balance);
    if (draft.totalDebt === undefined) draft.totalDebt = Math.abs(draft.balance);
    if (!Number.isSafeInteger(draft.totalDebt) || draft.totalDebt < 0) throw new DomainError("Invalid total debt");
  }
  return draft;
}

// Does anything refer to the account?
export function accountHasRecords(data: LedgerData, a: Account): boolean {
  const used = (o: Operation) => o.from === a.id || o.to === a.id;
  return !!(a.opening || a.goal || a.limit || data.ops.some(used) || data.scheduled.some(used));
}

export function changesCurrencyOfUsedAccount(data: LedgerData, draft: AccountDraft): boolean {
  const existing = accountById(data, draft.id);
  return Boolean(existing && existing.currency !== draft.currency && accountHasRecords(data, existing));
}

export type CurrencyChangeMode = "spent" | "all";

interface PlannedOpChange {
  op: Operation;
  amount?: Minor;
  receive?: Minor;
}

// What a currency change does, without doing it:
// "spent" recalculates what left the account (expenses, transfers out; a transfer out also changes
// what the other side received); "all" converts every amount kept in the account's currency, so the
// balance follows the rate (the rounding remainder goes into the opening balance).
export function planCurrencyChange(data: LedgerData, id: string, currency: string, mode: CurrencyChangeMode) {
  const a = accountById(data, id);
  if (!a) throw new DomainError("Select an account");
  const conv = (n: Minor) => convert(n, a.currency, currency, data.rates);
  const changes: PlannedOpChange[] = [];
  for (const o of [...data.ops, ...data.scheduled]) {
    const out = o.from === id,
      into = o.to === id;
    const change: PlannedOpChange = { op: o };
    if (mode === "spent") {
      if (!out || o.type === "adjustment") continue;
      change.amount = conv(o.amount);
      if (o.receive) change.receive = conv(o.receive);
    } else if (o.type === "adjustment") {
      if (into && o.receive !== undefined) change.receive = conv(o.receive);
      else if (out || into) change.amount = conv(o.amount);
      else continue;
    } else if (out || (into && o.type !== "transfer")) {
      change.amount = conv(o.amount);
      if (into && o.receive) change.receive = conv(o.receive);
    } else if (into && o.receive) change.receive = conv(o.receive);
    else continue;
    changes.push(change);
  }
  const taken = changes.filter((c) => c.op.from === id && data.ops.includes(c.op));
  const counted = changes.filter((c) => data.ops.includes(c.op));
  const delta = counted.reduce((n, c) => {
    const o = c.op;
    if (o.from === id) return n - ((c.amount ?? o.amount) - o.amount);
    return n + ((c.receive ?? c.amount ?? o.amount) - (o.receive ?? o.amount));
  }, 0);
  // What the other accounts of the transfers out receive differently ("spent" only; "all" keeps their amounts).
  const others = new Map<string, Minor>();
  if (mode === "spent")
    for (const c of counted)
      if (c.op.from === id && c.receive !== undefined && c.op.to) others.set(c.op.to, (others.get(c.op.to) ?? 0) + c.receive - (c.op.receive ?? c.op.amount));
  const before = accountBalance(data, id);
  let openingAfter = a.opening || 0,
    opening = 0;
  if (mode === "all") {
    const exact = conv(before);
    openingAfter = conv(a.opening || 0) + (exact - (before + delta + (conv(a.opening || 0) - (a.opening || 0))));
    opening = openingAfter - (a.opening || 0);
  }
  return {
    openingAfter,
    changes,
    taken: taken.length,
    spentBefore: taken.reduce((n, c) => n + c.op.amount, 0),
    spentAfter: taken.reduce((n, c) => n + (c.amount ?? c.op.amount), 0),
    before,
    after: before + delta + opening,
    others,
  };
}

export function changeAccountCurrency(tx: LedgerTx, id: string, currency: string, mode: CurrencyChangeMode): void {
  const a = accountById(tx.data, id);
  if (!a) throw new DomainError("Select an account");
  const plan = planCurrencyChange(tx.data, id, currency, mode);
  const conv = (n: Minor) => convert(n, a.currency, currency, tx.data.rates);
  const account: Account = { ...a, currency };
  if (mode === "all") {
    if (a.goal) account.goal = conv(a.goal);
    if (a.limit) account.limit = conv(a.limit);
    if (a.totalDebt) account.totalDebt = conv(a.totalDebt);
    account.opening = plan.openingAfter;
  }
  const isOp = new Set(tx.data.ops.map((o) => o.id));
  for (const { op, amount, receive } of plan.changes) {
    const o: Operation & Record<string, unknown> = { ...op };
    const was = o.from === id || (o.type !== "transfer" && !(o.type === "adjustment" && o.receive)) ? o.amount : (o.receive ?? o.amount);
    if (amount !== undefined) {
      if (o.from === id && o.fees)
        o.fees = o.fees.map((fee) => ((fee.value ?? 0) > 0 ? { ...fee, value: conv(Math.round((fee.value ?? 0) * 100)) / 100 } : fee));
      o.amount = amount;
    }
    if (receive !== undefined) o.receive = receive;
    if (!o.recalculated) o.recalculated = { amount: was, currency: a.currency };
    if (o.recalculated.currency === currency) delete o.recalculated;
    if (isOp.has(o.id)) tx.put("ops", o);
    else tx.put("scheduled", o as never);
  }
  tx.put("accounts", account);
}

// The main currency: categories and budgets in the old main currency follow it.
export function changeMainCurrency(tx: LedgerTx, currency: string): void {
  const old = tx.data.settings.currency;
  if (old === currency) return;
  tx.put("categories", ...tx.data.categories.filter((c) => c.currency === old).map((c) => ({ ...c, currency })));
  tx.put(
    "budgets",
    ...tx.data.budgets
      .filter((b) => b.currency === old)
      .map((b) => ({ ...b, amount: convert(b.amount, old, currency, tx.data.rates), currency })),
  );
  tx.setSettings({ currency });
}

// Stores a checked form. `mode` says how a currency change treats the operations.
export function storeAccount(tx: LedgerTx, source: AccountDraft, mode: CurrencyChangeMode, env: Env): Account {
  const draft = { ...source };
  const old = accountById(tx.data, draft.id);
  if (old && old.currency !== draft.currency) {
    const keys = ["balance", "goal", "limit", "totalDebt"] as const;
    const read = (a: Account) => ({ ...a, balance: accountBalance(tx.data, a.id) });
    const before = read(old);
    changeAccountCurrency(tx, old.id, draft.currency, mode);
    const after = read(accountById(tx.data, old.id) as Account);
    for (const key of keys) if (draft[key] === before[key]) (draft as Record<string, unknown>)[key] = after[key];
  }
  const current = accountById(tx.data, draft.id);
  const change = draft.balance - (current ? accountBalance(tx.data, current.id) : 0);
  const withDebtOperation = draft.createOperation && draft.type === "Debt";
  if (withDebtOperation) checkDebtOperation(tx.data, draft, change);

  const startsWithAdjustment = !current && draft.type !== "Debt" && draft.balance !== 0;
  const { balance: _b, createOperation: _c, counterpart, ...fields } = draft;
  const stored: Account = {
    ...fields,
    id: draft.id || env.newId(),
    opening: current ? current.opening : startsWithAdjustment ? 0 : draft.balance,
  };
  if (stored.type !== "Debt") delete stored.totalDebt;
  if (stored.favorite) tx.put("accounts", ...tx.data.accounts.filter((a) => a.favorite && a.id !== stored.id).map((a) => ({ ...a, favorite: false })));
  tx.put("accounts", stored);

  if ((current && change && !withDebtOperation) || startsWithAdjustment)
    tx.put("ops", {
      id: env.newId(),
      type: "adjustment",
      date: env.clock.today(),
      from: change < 0 ? stored.id : null,
      to: change > 0 ? stored.id : null,
      amount: Math.abs(change),
      comment: "Manual balance adjustment",
      tags: [],
    });
  if (withDebtOperation && change && counterpart) recordDebtOperation(tx, stored.id, counterpart, change, env);
  return accountById(tx.data, stored.id) as Account;
}

function checkDebtOperation(data: LedgerData, draft: AccountDraft, change: Minor): void {
  const other = accountById(data, draft.counterpart);
  if (!other || draft.counterpart === draft.id) throw new DomainError("Select a different account");
  if (!change) return;
  const amount = change > 0 ? convert(change, draft.currency, other.currency, data.rates) : -change;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError("Invalid debt transfer amount");
  const received =
    change > 0 ? convert(amount, other.currency, draft.currency, data.rates) : convert(amount, draft.currency, other.currency, data.rates);
  if (!Number.isSafeInteger(received) || received <= 0) throw new DomainError("Converted debt amount is too small");
}

// The transfer that records a new debt; the opening balance is corrected so the transfer brings the
// account to the typed balance.
function recordDebtOperation(tx: LedgerTx, accountId: string, counterpartId: string, change: Minor, env: Env): void {
  const account = accountById(tx.data, accountId) as Account;
  const other = accountById(tx.data, counterpartId) as Account;
  const draft: Operation = { id: env.newId(), type: "transfer", amount: 0, date: env.clock.today(), comment: "Debt balance adjustment", tags: [] };
  if (change > 0) {
    draft.from = other.id;
    draft.to = account.id;
    draft.amount = convert(change, account.currency, other.currency, tx.data.rates);
  } else {
    draft.from = account.id;
    draft.to = other.id;
    draft.amount = -change;
  }
  const op = validateOp(draft, lookupOf(tx.data));
  const opening = account.opening - (op.to === account.id ? (op.receive ?? op.amount) : -op.amount);
  tx.put("accounts", { ...account, opening });
  putOperation(tx, op, env);
}

// One favorite at most.
export function toggleFavoriteAccount(tx: LedgerTx, id: string): void {
  const was = accountById(tx.data, id)?.favorite;
  tx.put(
    "accounts",
    ...tx.data.accounts.filter((a) => a.favorite !== (!was && a.id === id)).map((a) => ({ ...a, favorite: !was && a.id === id })),
  );
}

export function setArchived(tx: LedgerTx, id: string, archived: boolean): void {
  const a = accountById(tx.data, id);
  if (a) tx.put("accounts", { ...a, archived });
}

// What deleting an account takes with it: its operations (transfers included) and scheduled
// payments; other accounts' balances change by the transfers that disappear. This is the intended
// behaviour, and the interface says it before asking.
export function accountDeletionImpact(data: LedgerData, id: string) {
  const linked = (o: Operation) => o.from === id || o.to === id;
  const ops = data.ops.filter(linked);
  const others = new Map<string, Minor>();
  for (const o of ops)
    for (const side of [o.from, o.to])
      if (side && side !== id) others.set(side, (others.get(side) ?? 0) - (o.to === side ? (o.receive ?? o.amount) : -o.amount));
  return { operations: ops.length, scheduled: data.scheduled.filter(linked).length, otherBalances: others };
}

export function deleteAccount(tx: LedgerTx, id: string): { operations: string[]; accounts: string[] } {
  if (!accountById(tx.data, id)) return { operations: [], accounts: [] };
  const linked = (o: Operation) => o.from === id || o.to === id;
  const operations = tx.data.ops.filter(linked).map((o) => o.id);
  tx.remove("ops", ...operations);
  tx.remove("scheduled", ...tx.data.scheduled.filter(linked).map((o) => o.id));
  tx.remove("accounts", id);
  return { operations, accounts: [id] };
}

// Puts the items of one group (`ids`, in their new order) back into the places the group held in the
// whole list, so the other groups keep their places (js/domain/ordering.js `reorderedList`).
export function moveInOrder(tx: LedgerTx, key: "accounts" | "categories", ids: string[]): void {
  const all = tx.data[key].map((x) => x.id);
  const known = ids.filter((id) => all.includes(id));
  let next = 0;
  tx.order(
    key,
    all.map((id) => (known.includes(id) ? known[next++]! : id)),
  );
}
