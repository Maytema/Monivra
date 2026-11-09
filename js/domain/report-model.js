/* The model of an exported report: everything a report says, worked out from the data and the chosen
   scope, as plain values. The preview and the PDF are drawn from the same model.

   Rules (also in docs/EXPORT_RULES.md):
   - The scope is the period and the filters. Income, expenses and everything counted per operation
     follow the whole scope; positions (balances, goals, debts) follow only the account filter,
     because a balance is a state, not a flow.
   - Income and expenses are the rows of the statistics (`reportRows`): transfers between own accounts
     are neither, except money paid into or taken out of a debt account that counts as one.
   - Amounts are kept per currency; one figure in the main currency is added only as "converted at
     the rates set in the application" and is marked so.
   - A transfer inside the scope (both accounts) moves money and changes nothing in the totals; a
     transfer across the edge of the scope (one account) is listed apart as a movement. */
import { today } from "../core/constants.js";
import { appData } from "../core/state.js";
import { budgetState } from "./budgets.js";
import { shownPercent } from "./percent.js";
import {
  accountById,
  addDays,
  categoryById,
  convertCurrency,
  dateLabel,
  dateLabelCompact,
  formatAmountText,
  operationMatchesFilters,
  parseDate,
  periodBounds,
  periodTitle,
  progressForBalance,
  reportRows,
  toIsoDate,
  transferRoles,
} from "./finance.js";
import { translate, translateWith, currentLocale } from "../i18n/index.js";

const main = () => appData.settings.currency;
// Kinds of account as the report names them.
const kindOf = (a) => (a.type === "Regular" && a.limit > 0 ? "Credit card" : a.type);

// The operations of the scope, newest first.
export function scopeOperations(filters, period) {
  const [from, to] = periodBounds(period);
  return appData.ops
    .filter((o) => o.date >= from && o.date <= to && operationMatchesFilters(o, filters))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// Balance of an account at the end of a day: the opening balance and every operation up to then.
export const balanceOn = (a, date) =>
  a.opening +
  appData.ops.reduce(
    (n, o) =>
      o.date > date
        ? n
        : n + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0),
    0,
  );

// Adds an amount to the total of its currency.
const addTo = (map, currency, amount) => map.set(currency, (map.get(currency) || 0) + amount);
const perCurrency = (map) =>
  [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

// ---- The words that say what the report covers ----

const names = (items, limit = 6) =>
  items.length > limit
    ? `${items.slice(0, limit).join(", ")} +${items.length - limit}`
    : items.join(", ");

// The lines that tell the filters: what is chosen, nothing for "all".
export function filterLines(filters) {
  const lines = [];
  if (filters.accounts)
    lines.push([
      translate("Accounts"),
      names(filters.accounts.map((id) => accountById(id)?.name).filter(Boolean)),
    ]);
  if (filters.categories)
    lines.push([
      translate("Categories"),
      names(
        filters.categories
          .map((id) =>
            id.startsWith("debt:") ? accountById(id.slice(5))?.name : categoryById(id)?.name,
          )
          .filter(Boolean),
      ),
    ]);
  if (filters.types)
    lines.push([
      translate("Type"),
      filters.types
        .map((t) => translate({ expense: "Expenses", income: "Incomes", transfer: "Transfers" }[t]))
        .join(", "),
    ]);
  if (filters.tags) lines.push([translate("Tags"), names(filters.tags)]);
  if (filters.comment) lines.push([translate("Comment"), `“${filters.comment}”`]);
  return lines;
}

// "Period" line: the title and the dates it covers.
function periodLine(period) {
  const [from, to] = periodBounds(period);
  if (period.mode === "all") return translate("All time");
  return `${periodTitle(period)} (${dateLabel(from)} – ${dateLabel(to)})`;
}

// What every report says about itself.
function metaOf({ title, filters, period }) {
  return {
    title: translate(title),
    generated: new Date().toLocaleString(currentLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    period: periodLine(period),
    periodShort: period.mode === "all" ? translate("All time") : periodTitle(period),
    filters: filterLines(filters),
    mainCurrency: main(),
  };
}

// The rates behind a converted figure: "1 USD = 87.5 KGS", for the currencies met in the report.
function rateNote(currencies) {
  const others = [...currencies].filter((c) => c !== main());
  if (!others.length) return "";
  const rates = others
    .sort()
    .map((c) => `1 ${c} = ${formatAmountText(convertCurrency(100, c, main()), main())}`)
    .join(", ");
  return translateWith(
    "Figures in {currency} are converted at the exchange rates set in the application: {rates}.",
    {
      currency: main(),
      rates,
    },
  );
}

// ---- Time buckets for the charts ----

function bucketing(from, to) {
  const days = Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1;
  const unit = days <= 40 ? "day" : days <= 140 ? "week" : days <= 1100 ? "month" : "year";
  const startOf = (date) => {
    if (unit === "day") return date;
    if (unit === "week")
      return addDays(date, -((parseDate(date).getUTCDay() - appData.settings.weekStart + 7) % 7));
    return unit === "month" ? date.slice(0, 7) + "-01" : date.slice(0, 4) + "-01-01";
  };
  const next = (key) => {
    if (unit === "day") return addDays(key, 1);
    if (unit === "week") return addDays(key, 7);
    const d = parseDate(key);
    if (unit === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    return toIsoDate(d);
  };
  const label = (key) => {
    const d = parseDate(key);
    const format = (options) =>
      d.toLocaleDateString(currentLocale(), { timeZone: "UTC", ...options });
    if (unit === "day") return format({ day: "numeric" });
    if (unit === "week") return format({ day: "numeric", month: "short" });
    return unit === "month" ? format({ month: "short" }) : format({ year: "numeric" });
  };
  const keys = [];
  for (let key = startOf(from); key <= to; key = next(key)) keys.push(key);
  return { unit, startOf, keys, label, end: (key) => addDays(next(key), -1) };
}

// ---- The financial summary ----

// The latest day the report can speak about: the end of the period, but not later than today.
const effectiveEnd = (to) => (to > today() ? today() : to);

// Everything the summary says. `sections` turn parts off: { charts, accounts, savings, debts, budgets }.
export function summaryModel({ filters, period, sections = {} }) {
  const meta = metaOf({ title: "Financial summary", filters, period });
  const ops = scopeOperations(filters, period);
  const rows = reportRows(ops);
  const [bound, boundEnd] = periodBounds(period);
  const dates = ops.map((o) => o.date);
  const from =
    period.mode === "all"
      ? dates.length
        ? dates.reduce((a, b) => (a < b ? a : b))
        : today()
      : bound;
  const to =
    period.mode === "all"
      ? dates.length
        ? dates.reduce((a, b) => (a > b ? a : b))
        : today()
      : boundEnd;
  const currencies = new Set(rows.map((r) => r.nativeCurrency));

  // Income, expenses and net: per currency, and converted into the main currency.
  const flow = { income: new Map(), expense: new Map() };
  let income = 0;
  let expense = 0;
  const cardSpend = new Map();
  let debtExpense = 0;
  let debtIncome = 0;
  for (const r of rows) {
    addTo(flow[r.reportType], r.nativeCurrency, r.nativeAmount);
    if (r.reportType === "income") income += r.reportAmount;
    else expense += r.reportAmount;
    if (String(r.category).startsWith("debt:"))
      r.reportType === "expense" ? (debtExpense += r.reportAmount) : (debtIncome += r.reportAmount);
    if (r.reportType === "expense" && r.type === "expense" && accountById(r.from)?.limit > 0)
      addTo(cardSpend, r.nativeCurrency, r.nativeAmount);
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
  const accountsSelected = filters.accounts ? new Set(filters.accounts) : null;
  const inScope = (id) => !accountsSelected || accountsSelected.has(id);
  const movement = {
    inside: new Map(),
    savingsIn: new Map(),
    savingsOut: new Map(),
    debtsIn: new Map(),
    debtsOut: new Map(),
    across: new Map(),
    adjustments: new Map(),
  };
  const movementCount = Object.fromEntries(Object.keys(movement).map((k) => [k, 0]));
  const move = (key, currency, amount) => {
    addTo(movement[key], currency, amount);
    movementCount[key]++;
  };
  for (const o of ops) {
    if (o.type === "adjustment") {
      const a = accountById(o.from || o.to);
      move("adjustments", a?.currency || main(), o.to ? (o.receive ?? o.amount) : -o.amount);
      continue;
    }
    if (o.type !== "transfer") continue;
    const roles = transferRoles(o);
    if (roles.expense || roles.income) continue;
    const source = accountById(o.from);
    const target = accountById(o.to);
    const bothIn = inScope(o.from) && inScope(o.to);
    if (!bothIn) move("across", source?.currency || main(), o.amount);
    else if (target?.type === "Savings" && source?.type !== "Savings")
      move("savingsIn", source?.currency, o.amount);
    else if (source?.type === "Savings" && target?.type !== "Savings")
      move("savingsOut", source?.currency, o.amount);
    else if (target?.type === "Debt") move("debtsIn", source?.currency, o.amount);
    else if (source?.type === "Debt") move("debtsOut", source?.currency, o.amount);
    else move("inside", source?.currency, o.amount);
  }
  const movements = [
    ["inside", "Transfers between your accounts"],
    ["savingsIn", "Paid into savings"],
    ["savingsOut", "Taken from savings"],
    ["debtsIn", "Paid into debt accounts"],
    ["debtsOut", "Taken from debt accounts"],
    ["across", "Transfers across the chosen accounts"],
    ["adjustments", "Balance adjustments"],
  ]
    .filter(([key]) => movementCount[key])
    .map(([key, label]) => ({
      label: translate(label),
      count: movementCount[key],
      amounts: perCurrency(movement[key]),
    }));

  // Balances at the start and the end of the period for the accounts the report speaks about.
  const end = effectiveEnd(boundEnd);
  const beforeStart = period.mode === "all" ? null : addDays(bound, -1);
  const listed = appData.accounts.filter((a) =>
    filters.accounts ? filters.accounts.includes(a.id) : !a.archived,
  );
  const accounts = listed.map((a) => {
    const closing = balanceOn(a, end);
    const opening = beforeStart ? balanceOn(a, beforeStart) : a.opening;
    return {
      id: a.id,
      name: a.name,
      kind: translate(kindOf(a)),
      currency: a.currency,
      opening,
      closing,
      change: closing - opening,
      counted: a.include && !a.archived,
      archived: a.archived,
      color: a.color,
    };
  });
  const countedAccounts = accounts.filter((a) => a.counted);
  const total = {
    opening: countedAccounts.reduce(
      (s, a) => s + convertCurrency(a.opening, a.currency, main()),
      0,
    ),
    closing: countedAccounts.reduce(
      (s, a) => s + convertCurrency(a.closing, a.currency, main()),
      0,
    ),
  };
  accounts.forEach((a) => a.currency && currencies.add(a.currency));

  // The balance at the end of every bucket, all counted accounts together, in the main currency.
  const buckets = bucketing(from, to);
  const series = buckets.keys.map((key) => ({
    key,
    label: buckets.label(key),
    income: 0,
    expense: 0,
  }));
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
          return s + convertCurrency(balanceOn(accountById(a.id), day), a.currency, main());
        }, 0),
      }))
    : [];

  // Where the expenses (and incomes) went: top-level categories, in the main currency.
  const distribution = (type) => {
    const sums = new Map();
    for (const r of rows.filter((x) => x.reportType === type)) {
      let name;
      let color;
      if (String(r.category).startsWith("debt:")) {
        const debt = accountById(r.category.slice(5));
        [name, color] = [debt?.name, debt?.color];
      } else {
        const c = categoryById(r.category);
        const top = c?.parent ? categoryById(c.parent) : c;
        [name, color] = [top?.name, top?.color];
      }
      const key = name || translate("Category");
      const item = sums.get(key) || { name: key, color: color || "#a5a3c8", amount: 0 };
      item.amount += r.reportAmount;
      sums.set(key, item);
    }
    const all = [...sums.values()].sort((a, b) => b.amount - a.amount);
    const sum = all.reduce((s, x) => s + x.amount, 0);
    return all.map((x) => ({ ...x, share: sum ? (x.amount / sum) * 100 : 0 }));
  };

  // Savings, debts and budgets: positions at the end of the period.
  const savings = accounts
    .map((a) => ({ a, source: accountById(a.id) }))
    .filter(({ source }) => source.type === "Savings" && source.goal > 0)
    .map(({ a, source }) => {
      const p = progressForBalance(source, a.closing);
      return {
        name: a.name,
        currency: a.currency,
        balance: a.closing,
        goal: source.goal,
        left: p.left,
        percent: shownPercent(p.percent),
        ratio: p.percent / 100,
      };
    });
  const debts = accounts
    .map((a) => ({ a, source: accountById(a.id) }))
    .filter(({ source }) => source.type === "Debt")
    .map(({ a, source }) => {
      const p = progressForBalance(source, a.closing);
      const direction = a.closing < 0 ? "I owe" : a.closing > 0 ? "Owe me" : source.debt;
      return {
        name: a.name,
        currency: a.currency,
        direction: translate(direction),
        balance: Math.abs(a.closing),
        total: source.totalDebt || 0,
        left: p ? Math.max(0, p.left) : null,
        percent: p ? shownPercent(p.percent) : null,
        ratio: p ? p.percent / 100 : null,
      };
    });
  const budgets = appData.budgets.map((b) => {
    const state = budgetState(b, end);
    const [bf, bt] = periodBounds({ mode: b.period || "month", anchor: end });
    return {
      name: b.name,
      currency: b.currency,
      range: `${dateLabel(bf)} – ${dateLabel(bt)}`,
      amount: b.amount,
      used: state.used,
      left: state.left,
      percent: shownPercent(state.share),
      ratio: state.share / 100,
    };
  });
  const shown = {
    charts: sections.charts !== false && counts.all > 0,
    accounts: sections.accounts !== false && accounts.length > 0,
    savings: sections.savings !== false && savings.length > 0,
    debts: sections.debts !== false && debts.length > 0,
    budgets: sections.budgets !== false && budgets.length > 0,
  };
  if (shown.budgets) budgets.forEach((b) => currencies.add(b.currency));

  const notes = [];
  const rates = rateNote(currencies);
  if (rates) notes.push(rates);
  notes.push(translate("Transfers between your own accounts are not income or expenses."));
  if (debtExpense)
    notes.push(
      translateWith(
        "Money paid to debt accounts that count as an expense is included in the expenses: {amount}.",
        { amount: formatAmountText(debtExpense, main()) },
      ),
    );
  if (debtIncome)
    notes.push(
      translateWith(
        "Money received from debt accounts that count as an income is included in the incomes: {amount}.",
        { amount: formatAmountText(debtIncome, main()) },
      ),
    );
  if (filters.accounts || filters.categories || filters.types || filters.tags || filters.comment)
    notes.push(
      translate(
        "Income and expenses follow all the filters; balances follow only the chosen accounts.",
      ),
    );
  if (shown.budgets)
    notes.push(
      translate(
        "Budgets are shown for their own period around the end of the report and do not follow the filters.",
      ),
    );
  if (shown.charts && trend.length)
    notes.push(
      translate(
        "The balance trend uses the opening balances and the recorded operations, converted at today’s rates.",
      ),
    );

  return {
    kind: "summary",
    meta,
    from,
    to,
    end,
    overview: {
      byCurrency,
      income,
      expense,
      net: income - expense,
      counts,
      cardSpend: perCurrency(cardSpend),
      converted: currencies.size > 1 || (currencies.size === 1 && !currencies.has(main())),
    },
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

// ---- The detailed list of operations ----

// The text of the amount of an operation: signed, in the currency of the account it concerns; a
// transfer between two currencies shows both sides.
function amountText(o) {
  const from = accountById(o.from);
  const to = accountById(o.to);
  const incoming = o.type === "income" || (o.type === "adjustment" && o.to);
  const outgoing = o.type === "expense" || (o.type === "adjustment" && o.from);
  if (o.type === "transfer")
    return from?.currency !== to?.currency
      ? `${formatAmountText(o.amount, from?.currency)} → ${formatAmountText(o.receive, to?.currency)}`
      : formatAmountText(o.amount, from?.currency);
  const account = from || to;
  const text = formatAmountText(incoming ? (o.receive ?? o.amount) : o.amount, account?.currency);
  return `${incoming ? "+" : outgoing ? "−" : ""}${text}`;
}

const TYPE_NAMES = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  adjustment: "Adjustment",
};
const categoryPath = (id) => {
  const c = categoryById(id);
  return c?.parent ? `${categoryById(c.parent)?.name} / ${c.name}` : c?.name;
};
const subjectOf = (o) =>
  o.type === "transfer"
    ? translate("Transfer")
    : o.type === "adjustment"
      ? translate("Adjustment")
      : categoryPath(o.category) || translate("Category");
const accountsOf = (o) =>
  o.type === "transfer"
    ? `${accountById(o.from)?.name} → ${accountById(o.to)?.name}`
    : accountById(o.from || o.to)?.name || "";

// The model of the detailed list: a row per operation with the columns chosen in `parts`, and the
// totals per currency (never mixed).
// The type of an operation as a cell: a transfer to or from a debt account that counts as an expense
// or an income says so, because the totals include it.
function typeCell(o) {
  const { expense, income } = transferRoles(o);
  if (expense) return translate("Transfer · counted as expense");
  if (income) return translate("Transfer · counted as income");
  return translate(TYPE_NAMES[o.type]);
}

export function detailModel({ filters, period, parts = {} }) {
  const meta = metaOf({ title: "Detailed transactions", filters, period });
  const ops = scopeOperations(filters, period);
  const on = (part) => parts[part] !== false;
  const columns = [
    { key: "date", label: translate("Date"), weight: 1.7 },
    on("type") && { key: "type", label: translate("Type"), weight: 1 },
    on("accounts") && { key: "subject", label: translate("Category / accounts"), weight: 2.1 },
    on("comment") && { key: "comment", label: translate("Comment"), weight: 1.7 },
    on("tags") && { key: "tags", label: translate("Tags"), weight: 1 },
    on("amount") && { key: "amount", label: translate("Amount"), weight: 2.2, align: "right" },
  ].filter(Boolean);
  const rows = ops.map((o) => ({
    id: o.id,
    sign:
      o.type === "income" || (o.type === "adjustment" && o.to) ? 1 : o.type === "transfer" ? 0 : -1,
    cells: {
      date: dateLabelCompact(o.date),
      type: typeCell(o),
      subject: subjectOf(o),
      detail: accountsOf(o),
      comment: o.comment || "",
      tags: (o.tags || []).join(", "),
      amount: amountText(o),
    },
  }));
  const flow = { income: new Map(), expense: new Map() };
  for (const r of reportRows(ops)) addTo(flow[r.reportType], r.nativeCurrency, r.nativeAmount);
  const codes = [...new Set([...flow.income.keys(), ...flow.expense.keys()])].sort();
  const totals = on("amount")
    ? codes.map((currency) => ({
        currency,
        income: flow.income.get(currency) || 0,
        expense: flow.expense.get(currency) || 0,
        net: (flow.income.get(currency) || 0) - (flow.expense.get(currency) || 0),
      }))
    : [];
  const counted = ops.filter((o) => {
    const { expense, income } = transferRoles(o);
    return expense || income;
  }).length;
  const counts = {
    all: ops.length,
    transfers: ops.filter((o) => o.type === "transfer").length,
    adjustments: ops.filter((o) => o.type === "adjustment").length,
  };
  return {
    kind: "detail",
    meta,
    columns,
    rows,
    totals,
    counts,
    notes: [
      translate(
        "Transfers between your own accounts are not income or expenses; adjustments are not counted.",
      ),
      counted &&
        translateWith(
          "{n} transfers to or from debt accounts are counted as expenses or incomes, as set for those accounts; the totals include them.",
          { n: counted },
        ),
    ].filter(Boolean),
    showDetail: on("accounts"),
  };
}
