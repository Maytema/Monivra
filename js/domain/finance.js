/* Finance model: balances, currency conversion, periods, reports */
import { escapeHtml } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { netAmount } from "./fees.js";
import { currentLocale, translate } from "../i18n/index.js";

// Find an account by id.
export const accountById = (id) => appData.accounts.find((a) => a.id === id);
// Find a category by id.
// Account used by default in new operations: the favorite one, otherwise the
// first regular account of the list (the order is set by dragging).
export function defaultAccountId(excludedId = null) {
  const usable = appData.accounts.filter((a) => !a.archived && a.id !== excludedId);
  const preferred =
    usable.find((a) => a.favorite) || usable.find((a) => a.type === "Regular") || usable[0];
  return preferred?.id ?? null;
}
export const categoryById = (id) => appData.categories.find((c) => c.id === id);
// Current balance of an account: opening balance plus incoming minus outgoing operations.
export const accountBalance = (id) => {
  const a = accountById(id);
  return a
    ? a.opening +
        appData.ops.reduce(
          (n, o) =>
            n + (o.to === id ? (o.receive ?? o.amount) : 0) - (o.from === id ? o.amount : 0),
          0,
        )
    : 0;
};
// Which way a debt goes. The sign of its balance decides, so paying a debt back in excess turns
// it around ("Owe me" for money the other side now owes); a settled debt keeps its last direction.
export function debtDirection(a) {
  const balance = accountBalance(a.id);
  return balance < 0 ? "I owe" : balance > 0 ? "Owe me" : a.debt;
}
// Progress of an account towards its target: the goal of a savings account, the repayment of a
// debt, or the part of a card limit that is already used. `done` is what the percent counts: what
// is saved, paid back or used (never below zero). `left` is what remains to the target, below zero
// by as much as the target is passed: a goal that is exceeded, a debt that is paid back with more
// than it was, a card limit that is overrun. `percent` is the exact share of the target and
// passes 100 with it; it goes below zero when a goal's or debt's balance does, but never for a card
// limit (own funds on a card use no credit). It is rounded only when shown
// (shownPercent). A debt counts from the side it was taken on (`debt` of the account), so the
// overpaid part is what the other side owes afterwards. Null when there is no target.
export const accountProgress = (a) => progressForBalance(a, accountBalance(a.id));
// The same for a balance the account had or will have, e.g. at the end of a report period.
export function progressForBalance(a, balance) {
  let kind, target, done;
  if (a.type === "Regular" && a.limit > 0) {
    [kind, target, done] = ["limit", a.limit, -balance];
  } else if (a.type === "Savings" && a.goal > 0) {
    [kind, target, done] = ["goal", a.goal, balance];
  } else if (a.type === "Debt" && a.totalDebt > 0) {
    [kind, target, done] = [
      "debt",
      a.totalDebt,
      a.totalDebt - (a.debt === "I owe" ? -balance : balance),
    ];
  } else return null;
  return {
    kind,
    target,
    left: target - done,
    done: Math.max(0, done),
    // The used part of a card limit is never negative: money of the card's own is not credit used.
    percent: ((kind === "limit" ? Math.max(0, done) : done) / target) * 100,
  };
}
// What a card's single balance means (net ledger, see docs/CREDIT_MODEL.md). Nothing is stored:
// the parts are derived from the balance `B` and the limit `L`, so editing or deleting an old
// operation always gives the same parts as replaying everything. Spending takes the card's own
// money first, then credit up to the limit, and only then the card's own balance goes below zero
// (negative balances are allowed on every account). So `own` is positive money of the card, zero
// while credit is in use, or negative once the limit is used up; `creditUsed` is never negative and
// never above the limit. `own - creditUsed` is always the balance. `utilization` is the share of the
// limit in use and may pass 1. `available` is what can still be spent without going below the
// limit. Limit 0 is a plain account (null).
export function cardState(a, balance = accountBalance(a.id)) {
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
// Groups of accounts shown together in pickers and filters, in the order of the Accounts screen.
export const ACCOUNT_GROUPS = [
  ["Accounts", (a) => a.type === "Regular"],
  ["Savings", (a) => a.type === "Savings"],
  ["Debts", (a) => a.type === "Debt"],
];
// Exchange rate of a currency relative to the base currency.
const currencyRate = (c) => appData.rates[c] || 1;

// Convert a minor-unit amount between currencies.
export const convertCurrency = (n, from, to) =>
  Math.round((n * currencyRate(from)) / currencyRate(to));
// How many units of `want` one unit of `have` is worth at the current rates.
export const currencyRatio = (have, want) => currencyRate(have) / currencyRate(want);
// A rate written for one unit of the more valuable currency: [base, quote, quote per base].
// `ratio` is how many units of `want` one unit of `have` is worth.
export const quoteRate = (have, want, ratio) =>
  ratio >= 1 ? [have, want, ratio] : [want, have, 1 / ratio];
// Total balance of accounts included in the total, converted to the main currency.
export function overallBalance() {
  return appData.accounts
    .filter((a) => a.include && !a.archived)
    .reduce(
      (s, a) => s + convertCurrency(accountBalance(a.id), a.currency, appData.settings.currency),
      0,
    );
}
// Ways to write 1234567.89: group and decimal separators.
const SEPARATORS = {
  "comma-dot": [",", "."],
  "dot-comma": [".", ","],
  "space-dot": ["\u00a0", "."],
  "space-comma": ["\u00a0", ","],
};
export const NUMBER_FORMATS = Object.keys(SEPARATORS);
// Number with the chosen separators and a true minus sign. It shows at least `least` and at most
// `most` fraction digits, so with (0, 2) a whole amount has none and 1.5 stays "1.5".
export function formatNumber(n, format, group, least, most = least) {
  const [groupSign, decimalSign] = SEPARATORS[format] || SEPARATORS["comma-dot"];
  return (n / 100)
    .toLocaleString("en-US", {
      minimumFractionDigits: least,
      maximumFractionDigits: most,
      useGrouping: group,
    })
    .replace("-", "\u2212")
    .replace(/[,.]/g, (c) => (c === "," ? groupSign : decimalSign));
}
// An amount in minor units (cents) written as plain text with the formatting settings; never masked.
export function formatAmountText(n, currency = appData.settings.currency) {
  const s = appData.settings;
  // "Two decimal places" writes both digits of the cents that exist; a whole amount has none.
  const fixed = s.decimal && !s.hideCents && n % 100 !== 0 ? 2 : 0;
  const text = formatNumber(n, s.numberFormat, s.groupDigits, fixed, s.hideCents ? 0 : 2);
  return s.currencyFirst ? currency + " " + text : text + " " + currency;
}
// Format an amount in minor units (cents) honoring the formatting settings; masks it when values are hidden.
export function formatMoney(n, currency = appData.settings.currency, isBalance = false) {
  if (appData.settings.hidden && (appData.settings.hiddenValues !== "Balances only" || isBalance))
    return "•••• " + escapeHtml(currency);
  return escapeHtml(formatAmountText(n, currency));
}
// Amount wrapped in a <span> colored by sign.
export const moneySpanHtml = (n, c, sign = false, isBalance = false) =>
  `<span class="money ${n > 0 ? "pos" : n < 0 ? "neg" : "muted"}">${sign && n > 0 ? "+" : ""}${formatMoney(n, c, isBalance)}</span>`;
// Parse YYYY-MM-DD into a Date (noon UTC, avoids DST issues).
export const parseDate = (s) => new Date(s + "T12:00:00Z");
// Format a Date as YYYY-MM-DD.
export const toIsoDate = (d) => d.toISOString().slice(0, 10);
// Add days to a YYYY-MM-DD string.
export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
};
// Locale for dates: the English "day first" format uses the British locale.
const dateLocale = () =>
  appData.settings.language === "en" && appData.settings.dateFormat === "day"
    ? "en-GB"
    : currentLocale();
// Human-readable date according to the date-format setting.
export const dateLabel = (s, short = false) =>
  appData.settings.dateFormat === "iso"
    ? s
    : parseDate(s).toLocaleDateString(dateLocale(), {
        timeZone: "UTC",
        ...(short
          ? { month: "long", day: "numeric" }
          : { year: "numeric", month: "long", day: "numeric" }),
      });
// The same with a short month name, for tables: "Nov 4, 2026".
export const dateLabelCompact = (s) =>
  appData.settings.dateFormat === "iso"
    ? s
    : parseDate(s).toLocaleDateString(dateLocale(), {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

// Start and end dates of the selected statistics/operations period.
// The period that shows the given days: the one chosen when it already does, else the month of the
// first day, else everything from the first to the last day.
export function periodAround(days, period = uiState.period) {
  const [first, last] = [
    days.reduce((a, b) => (a < b ? a : b)),
    days.reduce((a, b) => (a > b ? a : b)),
  ];
  const shows = (p) => {
    const [from, to] = periodBounds(p);
    return from <= first && last <= to;
  };
  const month = { mode: "month", anchor: first };
  if (shows(period)) return period;
  return shows(month) ? month : { mode: "range", from: first, to: last, anchor: first };
}
export function periodBounds(p = uiState.period) {
  const d = parseDate(p.anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (p.mode === "all") return ["0000-01-01", "9999-12-31"];
  if (p.mode === "range") return [p.from, p.to];
  if (p.mode === "day") return [p.anchor, p.anchor];
  if (p.mode === "week") {
    const a = addDays(p.anchor, -((d.getUTCDay() - appData.settings.weekStart + 7) % 7));
    return [a, addDays(a, 6)];
  }
  if (p.mode === "year") return [`${y}-01-01`, `${y}-12-31`];
  const day = appData.settings.monthStart;
  const start = (month) => {
    const z = new Date(Date.UTC(y, month, 1, 12));
    z.setUTCDate(
      Math.min(day, new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    return toIsoDate(z);
  };
  const month = p.anchor < start(m) ? m - 1 : m;
  return [start(month), addDays(start(month + 1), -1)];
}

// Can the period be moved to the neighbouring one? "All time" has none.
export const canShiftPeriod = (p = uiState.period) => p.mode !== "all";
// Move the period one step forward (1) or back (-1) to the neighbouring period of the same kind:
// the one that starts the day after this one ends, or ends the day before it starts. A range moves
// by its own length. The shown period becomes a new object, so a period kept elsewhere (the one a
// page returns to) is never moved with it.
export function shiftPeriod(n) {
  if (!canShiftPeriod()) return false;
  const p = { ...uiState.period };
  if (p.mode === "range") {
    const days = Math.round((parseDate(p.to) - parseDate(p.from)) / 86400000) + 1;
    p.from = addDays(p.from, n * days);
    p.to = addDays(p.to, n * days);
  } else {
    const [from, to] = periodBounds(p);
    p.anchor = n > 0 ? addDays(to, 1) : addDays(from, -1);
  }
  uiState.period = p;
  return true;
}

// Title shown in the period bar, e.g. "October 2026".
export function periodTitle(period = uiState.period) {
  const [a, b] = periodBounds(period);
  if (period.mode === "all") return translate("All time");
  if (period.mode === "month")
    return parseDate(a).toLocaleDateString(currentLocale(), {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  if (period.mode === "year") return a.slice(0, 4);
  if (period.mode === "day") return dateLabel(a);
  return rangeLabel(a, b);
}
// Compact "26 Oct – 1 Nov" form that fits the period bar; the year appears only outside the current one.
function rangeLabel(a, b) {
  const thisYear = String(new Date().getFullYear());
  const withYear = a.slice(0, 4) !== thisYear || b.slice(0, 4) !== thisYear;
  if (appData.settings.dateFormat === "iso") {
    const cut = (s) => (withYear ? s : s.slice(5));
    return cut(a) + " – " + cut(b);
  }
  return new Intl.DateTimeFormat(dateLocale(), {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).formatRange(parseDate(a), parseDate(b));
}
// How a transfer is counted besides being a transfer. Money paid into a debt account counts as an
// expense when that account says so; money taken out of one counts as an income. The direction of
// the transfer decides, so an account with both switches on needs no further choice. A transfer
// between two debt accounts only moves a debt around and is not counted.
export function transferRoles(o) {
  const none = { expense: null, income: null };
  if (o.type !== "transfer") return none;
  const source = accountById(o.from),
    dest = accountById(o.to);
  if (source?.type === "Debt" && dest?.type === "Debt") return none;
  return {
    expense: dest?.type === "Debt" && dest.considerExpense ? dest : null,
    income: source?.type === "Debt" && source.considerIncome ? source : null,
  };
}
// A category with its subcategories: what a filter by a whole category selects.
export const categoryFamily = (id) => [
  id,
  ...appData.categories.filter((c) => c.parent === id).map((c) => c.id),
];
// Does an operation pass the active filters? A category is matched as chosen: choosing a category
// with subcategories means choosing them one by one.
export function operationMatchesFilters(o, f = uiState.filters) {
  const roles = transferRoles(o);
  return (
    (!f.accounts || f.accounts.includes(o.from) || f.accounts.includes(o.to)) &&
    (!f.categories ||
      f.categories.includes(o.category) ||
      (roles.expense && f.categories.includes("debt:" + roles.expense.id)) ||
      (roles.income && f.categories.includes("debt:" + roles.income.id))) &&
    (!f.types ||
      o.type === "adjustment" ||
      f.types.includes(o.type) ||
      (roles.expense && f.types.includes("expense")) ||
      (roles.income && f.types.includes("income"))) &&
    (!f.tags || f.tags.some((v) => (o.tags || []).includes(v))) &&
    (!f.comment || (o.comment || "").toLowerCase().includes(f.comment.toLowerCase())) &&
    (!f.origin || f.origin.includes(o.fromSchedule ? "schedule" : "manual"))
  );
}
// Newest first by the day and the time of day; a payment posted late keeps the time it was set for.
export const newestFirst = (a, b) =>
  b.date.localeCompare(a.date) ||
  (b.time || "").localeCompare(a.time || "") ||
  b.id.localeCompare(a.id);
// Operations that pass the active filters and period, newest first.
export function visibleOperations(filters = uiState.filters) {
  const [a, b] = periodBounds();
  return appData.ops
    .filter((o) => o.date >= a && o.date <= b && operationMatchesFilters(o, filters))
    .sort(newestFirst);
}
// Flat rows used by CSV export and the printable report.
export function reportRows(ops = visibleOperations()) {
  const out = [];
  for (const o of ops) {
    if (o.type === "adjustment") continue;
    if (o.type !== "transfer") {
      const a = accountById(o.from || o.to);
      const nativeAmount = o.type === "expense" ? netAmount(o) : o.amount;
      const nativeCurrency = a?.currency || appData.settings.currency;
      out.push({
        ...o,
        reportType: o.type,
        // The category records what is left after fees on an expense.
        reportAmount: convertCurrency(nativeAmount, nativeCurrency, appData.settings.currency),
        // The same amount in the currency of the account, before it is converted.
        nativeAmount,
        nativeCurrency,
      });
    } else {
      const { expense, income } = transferRoles(o),
        source = accountById(o.from);
      for (const [debt, reportType] of [
        [expense, "expense"],
        [income, "income"],
      ])
        if (debt)
          out.push({
            ...o,
            category: "debt:" + debt.id,
            reportType,
            reportAmount: convertCurrency(o.amount, source.currency, appData.settings.currency),
            nativeAmount: o.amount,
            nativeCurrency: source.currency,
          });
    }
  }
  return out;
}
// Sum of operations of one type (expense/income/transfer).
export const totalByType = (type, ops) =>
  reportRows(ops)
    .filter((o) => o.reportType === type)
    .reduce((s, o) => s + o.reportAmount, 0);
// Report rows of one category of the given type (its own type unless told otherwise), with its
// sub-categories. A debt account shown as a category can be both an expense and an income.
const categoryRows = (id, type = categoryById(id)?.type) =>
  reportRows().filter(
    (o) => o.reportType === type && (o.category === id || categoryById(o.category)?.parent === id),
  );
// Sum of operations in a category, including its sub-categories.
export const categoryTotal = (id, type) =>
  categoryRows(id, type).reduce((s, o) => s + o.reportAmount, 0);
// Sum of a category in its own currency. An operation entered in that currency counts as entered,
// whatever the rates do later; the others are converted at the current rate.
export const categoryTotalIn = (c) =>
  categoryRows(c.id, c.type).reduce(
    (s, o) =>
      s +
      (o.categoryAmount?.currency === c.currency && !o.fees?.length
        ? o.categoryAmount.amount
        : convertCurrency(o.reportAmount, appData.settings.currency, c.currency)),
    0,
  );
// The two amounts of an operation between two currencies, as [[amount, currency], [amount,
// currency]]; null when there is one currency, no second amount or a fee changes the amounts.
export function amountPair(o) {
  const account = accountById(o.from || o.to);
  if (!account || o.fees?.length) return null;
  const main = appData.settings.currency;
  let own = account.currency,
    other,
    otherCurrency;
  if (o.type === "transfer") {
    [other, otherCurrency] = [o.receive, accountById(o.to)?.currency];
  } else if (o.type === "adjustment") {
    // A raise sends the amount from "Adjustment" in the main currency to the account.
    [own, other, otherCurrency] = o.to
      ? [main, o.receive, account.currency]
      : [account.currency, o.receive, main];
  } else {
    const c = categoryById(o.category);
    if (o.categoryAmount && o.categoryAmount.currency === c?.currency)
      [other, otherCurrency] = [o.categoryAmount.amount, c.currency];
  }
  return other === undefined || own === otherCurrency || !otherCurrency
    ? null
    : [
        [o.amount, own],
        [other, otherCurrency],
      ];
}
// Does the pair of amounts differ from what the current rate gives, by more than rounding?
export const offRate = ([[a, from], [b, to]]) => Math.abs(convertCurrency(a, from, to) - b) > 1;
// Number of operations of a category (with its subcategories) in the report period.
export const categoryCount = (id, type) => categoryRows(id, type).length;
// Share (0–1) of a category in all operations of its type in the report period.
export function categoryShare(id, type = categoryById(id)?.type) {
  const all = totalByType(type);
  return all ? categoryTotal(id, type) / all : 0;
}
// Evaluate a calculator expression (+ − × ÷) and return the result in minor units.
export function evaluateExpression(expr) {
  const clean = String(expr)
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s/g, "");
  if (!/^-?\d*\.?\d+(?:[+\-*/]-?\d*\.?\d+)*$/.test(clean)) throw Error("Enter a valid amount");
  const tokens = clean.match(/(?:^|(?<=[+*/-]))-?\d*\.?\d+|[+*/-]/g);
  if (!tokens || tokens.join("") !== clean) throw Error("Invalid expression");
  const terms = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const operand = Number(tokens[i + 1]);
    if (operator === "*") terms[terms.length - 1] *= operand;
    else if (operator === "/") {
      if (operand === 0) throw Error("Cannot divide by zero");
      terms[terms.length - 1] /= operand;
    } else terms.push(operator === "-" ? -operand : operand);
  }
  const cents = Math.round(terms.reduce((sum, term) => sum + term, 0) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 9e12) throw Error("Amount is too large");
  return cents;
}
