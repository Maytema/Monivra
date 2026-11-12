// The ledger: balances, cards, goals and debts, and the rows every report, budget and statistic
// counts. Balances are never stored: they follow from the opening balance and the operations, so
// editing or deleting any operation gives the same result as replaying everything.
import { convert, netAmount } from "./money.ts";
import type { Account, Category, LedgerData, Minor, Operation, Rates } from "./types.ts";

// ---- Lookups (cached per list; lists are replaced, never changed in place) -------------------

const accountMaps = new WeakMap<readonly Account[], Map<string, Account>>();
const categoryMaps = new WeakMap<readonly Category[], Map<string, Category>>();

export function accountById(data: Pick<LedgerData, "accounts">, id: string | null | undefined): Account | undefined {
  if (!id) return undefined;
  let map = accountMaps.get(data.accounts);
  if (!map) accountMaps.set(data.accounts, (map = new Map(data.accounts.map((a) => [a.id, a]))));
  return map.get(id);
}

export function categoryById(data: Pick<LedgerData, "categories">, id: string | null | undefined): Category | undefined {
  if (!id) return undefined;
  let map = categoryMaps.get(data.categories);
  if (!map) categoryMaps.set(data.categories, (map = new Map(data.categories.map((c) => [c.id, c]))));
  return map.get(id);
}

// ---- Balances -----------------------------------------------------------------------------------

// What one operation does to one account.
export const effectOn = (o: Operation, id: string): Minor =>
  (o.to === id ? (o.receive ?? o.amount) : 0) - (o.from === id ? o.amount : 0);

const balanceMaps = new WeakMap<readonly Operation[], Map<string, Minor>>();

// Balance of every account from all operations (one pass, cached per operation list).
function balanceChanges(ops: readonly Operation[]): Map<string, Minor> {
  let map = balanceMaps.get(ops);
  if (map) return map;
  map = new Map();
  for (const o of ops) {
    if (o.to) map.set(o.to, (map.get(o.to) ?? 0) + (o.receive ?? o.amount));
    if (o.from) map.set(o.from, (map.get(o.from) ?? 0) - o.amount);
  }
  balanceMaps.set(ops, map);
  return map;
}

export function accountBalance(data: Pick<LedgerData, "accounts" | "ops">, id: string): Minor {
  const a = accountById(data, id);
  return a ? a.opening + (balanceChanges(data.ops).get(id) ?? 0) : 0;
}

// The balance an account had at the end of `date`.
export function balanceOn(data: Pick<LedgerData, "ops">, a: Account, date: string): Minor {
  let n = a.opening;
  for (const o of data.ops) if (o.date <= date) n += effectOn(o, a.id);
  return n;
}

// Total of the accounts included in the total, in the main currency.
export function overallBalance(data: LedgerData): Minor {
  return data.accounts
    .filter((a) => a.include && !a.archived)
    .reduce((s, a) => s + convert(accountBalance(data, a.id), a.currency, data.settings.currency, data.rates), 0);
}

// The sign of a debt's balance decides its direction; a settled debt keeps the last one.
export function debtDirection(data: LedgerData, a: Account): Account["debt"] {
  const balance = accountBalance(data, a.id);
  return balance < 0 ? "I owe" : balance > 0 ? "Owe me" : a.debt;
}

// Account used by default in new operations: the favorite, else the first regular, else the first.
export function defaultAccountId(data: LedgerData, excludedId: string | null = null): string | null {
  const usable = data.accounts.filter((a) => !a.archived && a.id !== excludedId);
  return (usable.find((a) => a.favorite) ?? usable.find((a) => a.type === "Regular") ?? usable[0])?.id ?? null;
}

export interface Progress {
  kind: "limit" | "goal" | "debt";
  target: Minor;
  left: Minor;
  done: Minor;
  percent: number;
}

// Progress towards a savings goal, a debt repayment or the used part of a card limit.
export function progressForBalance(a: Account, balance: Minor): Progress | null {
  let kind: Progress["kind"], target: Minor, done: Minor;
  if (a.type === "Regular" && a.limit > 0) [kind, target, done] = ["limit", a.limit, -balance];
  else if (a.type === "Savings" && a.goal > 0) [kind, target, done] = ["goal", a.goal, balance];
  else if (a.type === "Debt" && (a.totalDebt ?? 0) > 0) {
    const total = a.totalDebt ?? 0;
    [kind, target, done] = ["debt", total, total - (a.debt === "I owe" ? -balance : balance)];
  } else return null;
  return {
    kind,
    target,
    left: target - done,
    done: Math.max(0, done),
    percent: ((kind === "limit" ? Math.max(0, done) : done) / target) * 100,
  };
}

export interface CardState {
  limit: Minor;
  own: Minor;
  creditUsed: Minor;
  available: Minor;
  utilization: number;
}

// The parts of a card's single balance (net ledger, docs/CREDIT_MODEL.md); null without a limit.
export function cardState(a: Account, balance: Minor): CardState | null {
  if (a.type !== "Regular" || !(a.limit > 0)) return null;
  const debt = Math.max(0, -balance);
  return {
    limit: a.limit,
    own: balance >= -a.limit ? Math.max(0, balance) : balance + a.limit,
    creditUsed: Math.min(debt, a.limit),
    available: Math.max(0, a.limit + balance),
    utilization: debt / a.limit,
  };
}

// ---- Report rows ------------------------------------------------------------------------------

// How a transfer also counts: money paid into a debt account that says so is an expense, money taken
// out of one an income; between two debt accounts it is only a move.
export function transferRoles(data: LedgerData, o: Operation): { expense: Account | null; income: Account | null } {
  if (o.type !== "transfer") return { expense: null, income: null };
  const source = accountById(data, o.from),
    dest = accountById(data, o.to);
  if (source?.type === "Debt" && dest?.type === "Debt") return { expense: null, income: null };
  return {
    expense: dest?.type === "Debt" && dest.considerExpense ? dest : null,
    income: source?.type === "Debt" && source.considerIncome ? source : null,
  };
}

export interface ReportRow extends Operation {
  reportType: "income" | "expense";
  reportAmount: Minor; // in the main currency at the current rate
  nativeAmount: Minor;
  nativeCurrency: string;
}

// The rows statistics, budgets and reports count: adjustments left out, expenses net of fees,
// transfers only through the debt switches.
export function reportRows(data: LedgerData, ops: readonly Operation[]): ReportRow[] {
  const main = data.settings.currency;
  const out: ReportRow[] = [];
  for (const o of ops) {
    if (o.type === "adjustment") continue;
    if (o.type !== "transfer") {
      const a = accountById(data, o.from || o.to);
      const nativeAmount = o.type === "expense" ? netAmount(o) : o.amount;
      const nativeCurrency = a?.currency ?? main;
      out.push({ ...o, reportType: o.type, reportAmount: convert(nativeAmount, nativeCurrency, main, data.rates), nativeAmount, nativeCurrency });
    } else {
      const { expense, income } = transferRoles(data, o);
      const source = accountById(data, o.from);
      const currency = source?.currency ?? main;
      for (const [debt, reportType] of [
        [expense, "expense"],
        [income, "income"],
      ] as const)
        if (debt)
          out.push({
            ...o,
            category: "debt:" + debt.id,
            reportType,
            reportAmount: convert(o.amount, currency, main, data.rates),
            nativeAmount: o.amount,
            nativeCurrency: currency,
          });
    }
  }
  return out;
}

export const totalByType = (rows: readonly ReportRow[], type: "income" | "expense"): Minor =>
  rows.filter((r) => r.reportType === type).reduce((s, r) => s + r.reportAmount, 0);

// Rows of a category with its subcategories, of the given type.
export function categoryRows(data: LedgerData, rows: readonly ReportRow[], id: string, type = categoryById(data, id)?.type): ReportRow[] {
  return rows.filter((r) => r.reportType === type && (r.category === id || categoryById(data, r.category)?.parent === id));
}

export const categoryTotal = (data: LedgerData, rows: readonly ReportRow[], id: string, type?: "income" | "expense"): Minor =>
  categoryRows(data, rows, id, type).reduce((s, r) => s + r.reportAmount, 0);

// A category's total in its own currency: an operation entered in that currency counts as entered.
export const categoryTotalIn = (data: LedgerData, rows: readonly ReportRow[], c: Category): Minor =>
  categoryRows(data, rows, c.id, c.type).reduce(
    (s, r) =>
      s +
      (r.categoryAmount?.currency === c.currency && !r.fees?.length
        ? r.categoryAmount.amount
        : convert(r.reportAmount, data.settings.currency, c.currency, data.rates)),
    0,
  );

// A category with its subcategories.
export const categoryFamily = (data: LedgerData, id: string): string[] => [
  id,
  ...data.categories.filter((c) => c.parent === id).map((c) => c.id),
];

// Newest first by day and time of day.
// Plain comparison: dates and times are ISO text and ids plain ASCII, and the platform's collation is slow on
// the phone's engine (one call through a bridge for each comparison).
const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const newestFirst = (a: Operation, b: Operation): number => order(b.date, a.date) || order(b.time ?? "", a.time ?? "") || order(b.id, a.id);

// Two amounts of a cross-currency operation, or null.
export function amountPair(data: LedgerData, o: Operation): [[Minor, string], [Minor, string]] | null {
  const account = accountById(data, o.from || o.to);
  if (!account || o.fees?.length) return null;
  const main = data.settings.currency;
  let own = account.currency;
  let other: Minor | undefined;
  let otherCurrency: string | undefined;
  if (o.type === "transfer") [other, otherCurrency] = [o.receive, accountById(data, o.to)?.currency];
  else if (o.type === "adjustment")
    [own, other, otherCurrency] = o.to ? [main, o.receive, account.currency] : [account.currency, o.receive, main];
  else {
    const c = categoryById(data, o.category);
    if (o.categoryAmount && o.categoryAmount.currency === c?.currency) [other, otherCurrency] = [o.categoryAmount.amount, c.currency];
  }
  return other === undefined || !otherCurrency || own === otherCurrency ? null : [[o.amount, own], [other, otherCurrency]];
}

// Does a pair differ from what the current rate gives by more than rounding?
export const offRate = ([[a, from], [b, to]]: [[Minor, string], [Minor, string]], rates: Rates): boolean =>
  Math.abs(convert(a, from, to, rates) - b) > 1;
