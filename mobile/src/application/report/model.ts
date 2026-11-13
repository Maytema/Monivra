// The model of an exported report (port of js/domain/report-model.js): everything a report says, worked
// out from the data and the chosen scope, as plain values. The preview and the PDF are drawn from it.
// Rules (docs/EXPORT_RULES.md): income and expenses follow the whole scope; balances follow only the
// account filter; income and expenses are the rows of the statistics; amounts are kept per currency and
// one converted figure in the main currency is marked as converted.
import { budgetState } from "../../domain/categories.ts";
import { addDays, parseDate, toIsoDate } from "../../domain/dates.ts";
import { accountById, categoryById, newestFirst, progressForBalance, reportRows, transferRoles } from "../../domain/ledger.ts";
import { convert, formatAmount, shownPercent } from "../../domain/money.ts";
import { operationMatchesFilters, periodBounds, type Filters, type Period } from "../../domain/periods.ts";
import type { Account, LedgerData, Minor, Operation } from "../../domain/types.ts";
import type { Translator } from "../../i18n/index.ts";

// What the report needs of the language: the translator, the title of a period, today and now.
export interface ReportWords {
  t: Translator;
  periodTitle(p: Period): string;
  today: string;
  now: Date;
}

export type Amounts = { currency: string; amount: Minor }[];
export interface Meta {
  title: string;
  generated: string;
  period: string;
  periodShort: string;
  filters: [string, string][];
  mainCurrency: string;
}

const two = (n: number) => String(n).padStart(2, "0");
// "Nov 4, 2026" / "4 нояб. 2026": the date of a table.
export function compactDate(w: ReportWords, data: LedgerData, s: string): string {
  if (data.settings.dateFormat === "iso") return s;
  return w.t.locale.startsWith("ru") ? `${w.t.dayMonth(s)} ${s.slice(0, 4)}` : `${w.t.dayMonth(s)}, ${s.slice(0, 4)}`;
}
const longDate = (w: ReportWords, data: LedgerData, s: string) => (data.settings.dateFormat === "iso" ? s : w.t.day(s));

export const money = (data: LedgerData, n: Minor, currency: string | undefined): string => formatAmount(n, currency ?? data.settings.currency, data.settings);

export function scopeOperations(data: LedgerData, filters: Filters, period: Period): Operation[] {
  const [from, to] = periodBounds(period, data.settings);
  return data.ops.filter((o) => o.date >= from && o.date <= to && operationMatchesFilters(data, o, filters)).sort(newestFirst);
}

// Balance of an account at the end of a day.
export const balanceOn = (data: LedgerData, a: Account, date: string): Minor =>
  a.opening + data.ops.reduce((n, o) => (o.date > date ? n : n + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0)), 0);

const addTo = (map: Map<string, number>, currency: string, amount: number) => map.set(currency, (map.get(currency) || 0) + amount);
const perCurrency = (map: Map<string, number>): Amounts =>
  [...map.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));

const names = (items: string[], limit = 6) => (items.length > limit ? `${items.slice(0, limit).join(", ")} +${items.length - limit}` : items.join(", "));

export function filterLines(w: ReportWords, data: LedgerData, filters: Filters): [string, string][] {
  const { t } = w;
  const lines: [string, string][] = [];
  if (filters.accounts) lines.push([t.t("Accounts"), names(filters.accounts.map((id) => accountById(data, id)?.name ?? "").filter(Boolean))]);
  if (filters.categories)
    lines.push([t.t("Categories"), names(filters.categories.map((id) => (id.startsWith("debt:") ? accountById(data, id.slice(5))?.name : categoryById(data, id)?.name) ?? "").filter(Boolean))]);
  if (filters.types) lines.push([t.t("Type"), filters.types.map((x) => t.t({ expense: "Expenses", income: "Incomes", transfer: "Transfers" }[x] ?? x)).join(", ")]);
  if (filters.tags) lines.push([t.t("Tags"), names(filters.tags)]);
  if (filters.comment) lines.push([t.t("Comment"), `“${filters.comment}”`]);
  return lines;
}

function metaOf(w: ReportWords, data: LedgerData, title: string, filters: Filters, period: Period): Meta {
  const [from, to] = periodBounds(period, data.settings);
  const d = w.now;
  const day = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  return {
    title: w.t.t(title),
    generated: `${compactDate(w, data, day)}, ${two(d.getHours())}:${two(d.getMinutes())}`,
    period: period.mode === "all" ? w.t.t("All time") : `${w.periodTitle(period)} (${longDate(w, data, from)} – ${longDate(w, data, to)})`,
    periodShort: period.mode === "all" ? w.t.t("All time") : w.periodTitle(period),
    filters: filterLines(w, data, filters),
    mainCurrency: data.settings.currency,
  };
}

function rateNote(w: ReportWords, data: LedgerData, currencies: Set<string>): string {
  const main = data.settings.currency;
  const others = [...currencies].filter((c) => c !== main);
  if (!others.length) return "";
  const rates = others
    .sort()
    .map((c) => `1 ${c} = ${money(data, convert(100, c, main, data.rates), main)}`)
    .join(", ");
  return w.t.t("Figures in {currency} are converted at the exchange rates set in the application: {rates}.", { currency: main, rates });
}

// ---- Time buckets for the charts ----

function bucketing(w: ReportWords, data: LedgerData, from: string, to: string) {
  const days = Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000) + 1;
  const unit: "day" | "week" | "month" | "year" = days <= 40 ? "day" : days <= 140 ? "week" : days <= 1100 ? "month" : "year";
  const startOf = (date: string) => {
    if (unit === "day") return date;
    if (unit === "week") return addDays(date, -((parseDate(date).getUTCDay() - data.settings.weekStart + 7) % 7));
    return unit === "month" ? date.slice(0, 7) + "-01" : date.slice(0, 4) + "-01-01";
  };
  const next = (key: string) => {
    if (unit === "day") return addDays(key, 1);
    if (unit === "week") return addDays(key, 7);
    const d = parseDate(key);
    if (unit === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    return toIsoDate(d);
  };
  const label = (key: string) => {
    if (unit === "day") return String(Number(key.slice(8, 10)));
    if (unit === "week") return w.t.dayMonth(key);
    return unit === "month" ? w.t.shortMonth(Number(key.slice(5, 7)) - 1) : key.slice(0, 4);
  };
  const keys: string[] = [];
  for (let key = startOf(from); key <= to; key = next(key)) keys.push(key);
  return { unit, startOf, keys, label, end: (key: string) => addDays(next(key), -1) };
}

// ---- The financial summary ----

export interface Sections {
  charts: boolean;
  accounts: boolean;
  savings: boolean;
  debts: boolean;
  budgets: boolean;
}

const kindOf = (a: Account) => (a.type === "Regular" && a.limit > 0 ? "Credit card" : a.type);

export function summaryModel(w: ReportWords, data: LedgerData, { filters, period, sections }: { filters: Filters; period: Period; sections: Partial<Sections> }) {
  const { t } = w;
  const main = data.settings.currency;
  const today = w.today;
  const meta = metaOf(w, data, "Financial summary", filters, period);
  const ops = scopeOperations(data, filters, period);
  const rows = reportRows(data, ops);
  const [bound, boundEnd] = periodBounds(period, data.settings);
  const dates = ops.map((o) => o.date);
  const from = period.mode === "all" ? (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today) : bound;
  const to = period.mode === "all" ? (dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : today) : boundEnd;
  const currencies = new Set(rows.map((r) => r.nativeCurrency));

  const flow = { income: new Map<string, number>(), expense: new Map<string, number>() };
  let income = 0;
  let expense = 0;
  const cardSpend = new Map<string, number>();
  let debtExpense = 0;
  let debtIncome = 0;
  for (const r of rows) {
    addTo(flow[r.reportType], r.nativeCurrency, r.nativeAmount);
    if (r.reportType === "income") income += r.reportAmount;
    else expense += r.reportAmount;
    if (String(r.category).startsWith("debt:")) {
      if (r.reportType === "expense") debtExpense += r.reportAmount;
      else debtIncome += r.reportAmount;
    }
    if (r.reportType === "expense" && r.type === "expense" && (accountById(data, r.from)?.limit ?? 0) > 0) addTo(cardSpend, r.nativeCurrency, r.nativeAmount);
  }
  const codes = [...new Set([...flow.income.keys(), ...flow.expense.keys()])].sort();
  const byCurrency = codes.map((currency) => {
    const i = flow.income.get(currency) || 0;
    const e = flow.expense.get(currency) || 0;
    return { currency, income: i, expense: e, net: i - e };
  });
  const counts = {
    all: ops.length,
    income: rows.filter((r) => r.reportType === "income" && r.type !== "transfer").length,
    expense: rows.filter((r) => r.reportType === "expense" && r.type !== "transfer").length,
    transfers: ops.filter((o) => o.type === "transfer").length,
    adjustments: ops.filter((o) => o.type === "adjustment").length,
  };

  // Other movements: transfers and adjustments, which are not income or expenses.
  const selected = filters.accounts ? new Set(filters.accounts) : null;
  const inScope = (id: string | null | undefined) => !selected || selected.has(id ?? "");
  const KEYS = ["inside", "savingsIn", "savingsOut", "debtsIn", "debtsOut", "across", "adjustments"] as const;
  type Key = (typeof KEYS)[number];
  const movement = Object.fromEntries(KEYS.map((k) => [k, new Map<string, number>()])) as Record<Key, Map<string, number>>;
  const movementCount = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<Key, number>;
  const move = (key: Key, currency: string | undefined, amount: number) => {
    addTo(movement[key], currency ?? main, amount);
    movementCount[key]++;
  };
  for (const o of ops) {
    if (o.type === "adjustment") {
      const a = accountById(data, o.from || o.to);
      move("adjustments", a?.currency || main, o.to ? (o.receive ?? o.amount) : -o.amount);
      continue;
    }
    if (o.type !== "transfer") continue;
    const roles = transferRoles(data, o);
    if (roles.expense || roles.income) continue;
    const source = accountById(data, o.from);
    const target = accountById(data, o.to);
    if (!(inScope(o.from) && inScope(o.to))) move("across", source?.currency || main, o.amount);
    else if (target?.type === "Savings" && source?.type !== "Savings") move("savingsIn", source?.currency, o.amount);
    else if (source?.type === "Savings" && target?.type !== "Savings") move("savingsOut", source?.currency, o.amount);
    else if (target?.type === "Debt") move("debtsIn", source?.currency, o.amount);
    else if (source?.type === "Debt") move("debtsOut", source?.currency, o.amount);
    else move("inside", source?.currency, o.amount);
  }
  const LABELS: Record<Key, string> = {
    inside: "Transfers between your accounts",
    savingsIn: "Paid into savings",
    savingsOut: "Taken from savings",
    debtsIn: "Paid into debt accounts",
    debtsOut: "Taken from debt accounts",
    across: "Transfers across the chosen accounts",
    adjustments: "Balance adjustments",
  };
  const movements = KEYS.filter((key) => movementCount[key]).map((key) => ({ label: t.t(LABELS[key]), count: movementCount[key], amounts: perCurrency(movement[key]) }));

  // Balances at the start and the end of the period for the accounts the report speaks about.
  const end = boundEnd > today ? today : boundEnd;
  const beforeStart = period.mode === "all" ? null : addDays(bound, -1);
  const listed = data.accounts.filter((a) => (filters.accounts ? filters.accounts.includes(a.id) : !a.archived));
  const accounts = listed.map((a) => {
    const closing = balanceOn(data, a, end);
    const opening = beforeStart ? balanceOn(data, a, beforeStart) : a.opening;
    return { id: a.id, name: a.name, kind: t.t(kindOf(a)), currency: a.currency, opening, closing, change: closing - opening, counted: a.include && !a.archived, archived: a.archived, color: a.color };
  });
  const countedAccounts = accounts.filter((a) => a.counted);
  const total = {
    opening: countedAccounts.reduce((s, a) => s + convert(a.opening, a.currency, main, data.rates), 0),
    closing: countedAccounts.reduce((s, a) => s + convert(a.closing, a.currency, main, data.rates), 0),
  };
  accounts.forEach((a) => a.currency && currencies.add(a.currency));

  const buckets = bucketing(w, data, from, to);
  const series = buckets.keys.map((key) => ({ key, label: buckets.label(key), income: 0, expense: 0, net: 0 }));
  const index = new Map(series.map((s) => [s.key, s]));
  for (const r of rows) {
    const slot = index.get(buckets.startOf(r.date));
    if (slot) slot[r.reportType] += r.reportAmount;
  }
  for (const slot of series) slot.net = slot.income - slot.expense;
  const trend = countedAccounts.length
    ? buckets.keys.map((key) => ({
        key,
        label: buckets.label(key),
        value: countedAccounts.reduce((s, a) => {
          const day = buckets.end(key) > end ? end : buckets.end(key);
          const account = accountById(data, a.id);
          return s + (account ? convert(balanceOn(data, account, day), a.currency, main, data.rates) : 0);
        }, 0),
      }))
    : [];

  const distribution = (type: "income" | "expense") => {
    const sums = new Map<string, { name: string; color: string; amount: number }>();
    for (const r of rows.filter((x) => x.reportType === type)) {
      let name: string | undefined;
      let color: string | undefined;
      if (String(r.category).startsWith("debt:")) {
        const debt = accountById(data, String(r.category).slice(5));
        [name, color] = [debt?.name, debt?.color];
      } else {
        const c = categoryById(data, r.category);
        const top = c?.parent ? categoryById(data, c.parent) : c;
        [name, color] = [top?.name, top?.color];
      }
      const key = name || t.t("Category");
      const item = sums.get(key) || { name: key, color: color || "#a5a3c8", amount: 0 };
      item.amount += r.reportAmount;
      sums.set(key, item);
    }
    const all = [...sums.values()].sort((a, b) => b.amount - a.amount);
    const sum = all.reduce((s, x) => s + x.amount, 0);
    return all.map((x) => ({ ...x, share: sum ? (x.amount / sum) * 100 : 0 }));
  };

  const savings = accounts
    .map((a) => ({ a, source: accountById(data, a.id)! }))
    .filter(({ source }) => source.type === "Savings" && source.goal > 0)
    .map(({ a, source }) => {
      const p = progressForBalance(source, a.closing)!;
      return { name: a.name, currency: a.currency, balance: a.closing, goal: source.goal, left: p.left, percent: shownPercent(p.percent), ratio: p.percent / 100 };
    });
  const debts = accounts
    .map((a) => ({ a, source: accountById(data, a.id)! }))
    .filter(({ source }) => source.type === "Debt")
    .map(({ a, source }) => {
      const p = progressForBalance(source, a.closing);
      const direction = a.closing < 0 ? "I owe" : a.closing > 0 ? "Owe me" : source.debt;
      return {
        name: a.name,
        currency: a.currency,
        direction: t.t(direction),
        balance: Math.abs(a.closing),
        total: source.totalDebt || 0,
        left: p ? Math.max(0, p.left) : null,
        percent: p ? shownPercent(p.percent) : null,
        ratio: p ? p.percent / 100 : null,
      };
    });
  const budgets = data.budgets.map((b) => {
    const state = budgetState(data, b, end);
    const [bf, bt] = periodBounds({ mode: b.period || "month", anchor: end }, data.settings);
    return { name: b.name, currency: b.currency, range: `${longDate(w, data, bf)} – ${longDate(w, data, bt)}`, amount: b.amount, used: state.used, left: state.left, percent: shownPercent(state.share), ratio: state.share / 100 };
  });
  const shown = {
    charts: sections.charts !== false && counts.all > 0,
    accounts: sections.accounts !== false && accounts.length > 0,
    savings: sections.savings !== false && savings.length > 0,
    debts: sections.debts !== false && debts.length > 0,
    budgets: sections.budgets !== false && budgets.length > 0,
  };
  if (shown.budgets) budgets.forEach((b) => currencies.add(b.currency));

  const notes: string[] = [];
  const rates = rateNote(w, data, currencies);
  if (rates) notes.push(rates);
  notes.push(t.t("Transfers between your own accounts are not income or expenses."));
  if (debtExpense) notes.push(t.t("Money paid to debt accounts that count as an expense is included in the expenses: {amount}.", { amount: money(data, debtExpense, main) }));
  if (debtIncome) notes.push(t.t("Money received from debt accounts that count as an income is included in the incomes: {amount}.", { amount: money(data, debtIncome, main) }));
  if (filters.accounts || filters.categories || filters.types || filters.tags || filters.comment) notes.push(t.t("Income and expenses follow all the filters; balances follow only the chosen accounts."));
  if (shown.budgets) notes.push(t.t("Budgets are shown for their own period around the end of the report and do not follow the filters."));
  if (shown.charts && trend.length) notes.push(t.t("The balance trend uses the opening balances and the recorded operations, converted at today’s rates."));

  return {
    kind: "summary" as const,
    meta,
    from,
    to,
    end,
    overview: { byCurrency, income, expense, net: income - expense, counts, cardSpend: perCurrency(cardSpend), converted: currencies.size > 1 || (currencies.size === 1 && !currencies.has(main)) },
    flow: { unit: buckets.unit, series },
    trend,
    expenseCategories: distribution("expense"),
    incomeCategories: distribution("income"),
    accounts,
    total,
    movements,
    savings,
    debts,
    budgets,
    shown,
    notes,
  };
}
export type SummaryModel = ReturnType<typeof summaryModel>;

// ---- The detailed list of operations ----

const TYPE_NAMES: Record<Operation["type"], string> = { expense: "Expense", income: "Income", transfer: "Transfer", adjustment: "Adjustment" };

export type DetailPart = "type" | "accounts" | "amount" | "comment" | "tags";

export function detailModel(w: ReportWords, data: LedgerData, { filters, period, parts }: { filters: Filters; period: Period; parts: Partial<Record<DetailPart, boolean>> }) {
  const { t } = w;
  const meta = metaOf(w, data, "Detailed transactions", filters, period);
  const ops = scopeOperations(data, filters, period);
  const on = (part: DetailPart) => parts[part] !== false;
  const amountText = (o: Operation) => {
    const from = accountById(data, o.from);
    const to = accountById(data, o.to);
    const incoming = o.type === "income" || (o.type === "adjustment" && !!o.to);
    const outgoing = o.type === "expense" || (o.type === "adjustment" && !!o.from);
    if (o.type === "transfer") return from?.currency !== to?.currency ? `${money(data, o.amount, from?.currency)} → ${money(data, o.receive ?? o.amount, to?.currency)}` : money(data, o.amount, from?.currency);
    const account = from || to;
    const text = money(data, incoming ? (o.receive ?? o.amount) : o.amount, account?.currency);
    return `${incoming ? "+" : outgoing ? "−" : ""}${text}`;
  };
  const categoryPath = (id: string | null | undefined) => {
    const c = categoryById(data, id);
    return c?.parent ? `${categoryById(data, c.parent)?.name} / ${c.name}` : c?.name;
  };
  const subjectOf = (o: Operation) => (o.type === "transfer" ? t.t("Transfer") : o.type === "adjustment" ? t.t("Adjustment") : categoryPath(o.category) || t.t("Category"));
  const accountsOf = (o: Operation) => (o.type === "transfer" ? `${accountById(data, o.from)?.name} → ${accountById(data, o.to)?.name}` : accountById(data, o.from || o.to)?.name || "");
  const typeCell = (o: Operation) => {
    const { expense, income } = transferRoles(data, o);
    if (expense) return t.t("Transfer · counted as expense");
    if (income) return t.t("Transfer · counted as income");
    return t.t(TYPE_NAMES[o.type]);
  };
  type Column = { key: string; label: string; weight: number; align?: "right" };
  const columns = [
    { key: "date", label: t.t("Date"), weight: 1.7 },
    on("type") && { key: "type", label: t.t("Type"), weight: 1 },
    on("accounts") && { key: "subject", label: t.t("Category / accounts"), weight: 2.1 },
    on("comment") && { key: "comment", label: t.t("Comment"), weight: 1.7 },
    on("tags") && { key: "tags", label: t.t("Tags"), weight: 1 },
    on("amount") && { key: "amount", label: t.t("Amount"), weight: 2.2, align: "right" as const },
  ].filter(Boolean) as Column[];
  const rows = ops.map((o) => ({
    id: o.id,
    sign: o.type === "income" || (o.type === "adjustment" && o.to) ? 1 : o.type === "transfer" ? 0 : -1,
    cells: { date: compactDate(w, data, o.date), type: typeCell(o), subject: subjectOf(o), detail: accountsOf(o), comment: o.comment || "", tags: (o.tags || []).join(", "), amount: amountText(o) } as Record<string, string>,
  }));
  const flow = { income: new Map<string, number>(), expense: new Map<string, number>() };
  for (const r of reportRows(data, ops)) addTo(flow[r.reportType], r.nativeCurrency, r.nativeAmount);
  const codes = [...new Set([...flow.income.keys(), ...flow.expense.keys()])].sort();
  const totals = on("amount")
    ? codes.map((currency) => ({ currency, income: flow.income.get(currency) || 0, expense: flow.expense.get(currency) || 0, net: (flow.income.get(currency) || 0) - (flow.expense.get(currency) || 0) }))
    : [];
  const counted = ops.filter((o) => {
    const { expense, income } = transferRoles(data, o);
    return expense || income;
  }).length;
  return {
    kind: "detail" as const,
    meta,
    columns,
    rows,
    totals,
    counts: { all: ops.length, transfers: ops.filter((o) => o.type === "transfer").length, adjustments: ops.filter((o) => o.type === "adjustment").length },
    notes: [
      t.t("Transfers between your own accounts are not income or expenses; adjustments are not counted."),
      counted ? t.t("{n} transfers to or from debt accounts are counted as expenses or incomes, as set for those accounts; the totals include them.", { n: counted }) : "",
    ].filter(Boolean),
    showDetail: on("accounts"),
  };
}
export type DetailModel = ReturnType<typeof detailModel>;
