/* Finance model: balances, currency conversion, periods, reports */
import { deepClone, escapeHtml, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
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
// Exchange rate of a currency relative to the base currency.
export const currencyRate = (c) => appData.rates[c] || 1;

// Convert a minor-unit amount between currencies.
export const convertCurrency = (n, from, to) =>
  Math.round((n * currencyRate(from)) / currencyRate(to));
// Total balance of accounts included in the total, converted to the main currency.
export function overallBalance() {
  return appData.accounts
    .filter((a) => a.include && !a.archived)
    .reduce(
      (s, a) => s + convertCurrency(accountBalance(a.id), a.currency, appData.settings.currency),
      0,
    );
}
// Format an amount in minor units (cents) honoring the formatting settings; masks it when values are hidden.
export function formatMoney(n, currency = appData.settings.currency, isBalance = false) {
  if (appData.settings.hidden && (appData.settings.hiddenValues !== "Balances only" || isBalance))
    return "•••• " + escapeHtml(currency);
  let v = n / 100,
    dec = appData.settings.hideCents ? 0 : appData.settings.decimal ? 2 : Math.abs(n) % 100 ? 2 : 0;
  let text = v.toLocaleString(currentLocale(), {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: appData.settings.groupDigits,
  });
  return escapeHtml(appData.settings.currencyFirst ? currency + " " + text : text + " " + currency);
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
  let d = parseDate(s);
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

// Start and end dates of the selected statistics/operations period.
export function periodBounds(p = uiState.period) {
  const d = parseDate(p.anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (p.mode === "all") return ["0000-01-01", "9999-12-31"];
  if (p.mode === "range") return [p.from, p.to];
  if (p.mode === "day") return [p.anchor, p.anchor];
  if (p.mode === "week") {
    let a = addDays(p.anchor, -((d.getUTCDay() - Number(appData.settings.weekStart) + 7) % 7));
    return [a, addDays(a, 6)];
  }
  if (p.mode === "year") return [`${y}-01-01`, `${y}-12-31`];
  const day = Number(appData.settings.monthStart) || 1;
  const start = (month) => {
    let z = new Date(Date.UTC(y, month, 1, 12));
    z.setUTCDate(
      Math.min(day, new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    return toIsoDate(z);
  };
  let month = p.anchor < start(m) ? m - 1 : m;
  return [start(month), addDays(start(month + 1), -1)];
}

// Title shown in the period bar, e.g. "October 2026".
export function periodTitle() {
  const [a, b] = periodBounds();
  if (uiState.period.mode === "all") return translate("All time");
  if (uiState.period.mode === "month")
    return parseDate(a).toLocaleDateString(currentLocale(), {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  if (uiState.period.mode === "year") return a.slice(0, 4);
  if (uiState.period.mode === "day") return dateLabel(a);
  return dateLabel(a, true) + " – " + dateLabel(b, true);
}
// Does an operation pass the active filters?
export function operationMatchesFilters(o, f = uiState.filters) {
  return (
    (!f.accounts || f.accounts.includes(o.from) || f.accounts.includes(o.to)) &&
    (!f.categories ||
      f.categories.includes(o.category) ||
      f.categories.includes(categoryById(o.category)?.parent)) &&
    (!f.types || o.type === "adjustment" || f.types.includes(o.type)) &&
    (!f.tags || f.tags.some((v) => (o.tags || []).includes(v))) &&
    (!f.comment || (o.comment || "").toLowerCase().includes(f.comment.toLowerCase()))
  );
}
// Operations that pass the active filters and period, newest first.
export function visibleOperations() {
  const [a, b] = periodBounds();
  return appData.ops
    .filter((o) => o.date >= a && o.date <= b && operationMatchesFilters(o))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
// Flat rows used by CSV export and the printable report.
export function reportRows(ops = visibleOperations()) {
  let out = [];
  for (const o of ops) {
    if (o.type === "adjustment") continue;
    if (o.type !== "transfer") {
      const a = accountById(o.from || o.to);
      out.push({
        ...o,
        reportType: o.type,
        // The category records what is left after fees on an expense.
        reportAmount: convertCurrency(
          o.type === "expense" ? netAmount(o) : o.amount,
          a?.currency || "KGS",
          appData.settings.currency,
        ),
      });
    } else {
      const source = accountById(o.from),
        dest = accountById(o.to);
      if (dest?.type === "Debt" && dest.considerExpense)
        out.push({
          ...o,
          category: "debt:" + dest.id,
          reportType: "expense",
          reportAmount: convertCurrency(o.amount, source.currency, appData.settings.currency),
        });
      if (source?.type === "Debt" && source.considerIncome)
        out.push({
          ...o,
          category: "debt:" + source.id,
          reportType: "income",
          reportAmount: convertCurrency(o.amount, source.currency, appData.settings.currency),
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
// Sum of operations in a category, including its sub-categories.
export const categoryTotal = (id) =>
  reportRows()
    .filter((o) => o.category === id || categoryById(o.category)?.parent === id)
    .reduce((s, o) => s + o.reportAmount, 0);
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
  let terms = [],
    last = "+",
    v = Number(tokens[0]);
  terms.push(v);
  for (let i = 1; i < tokens.length; i += 2) {
    last = tokens[i];
    v = Number(tokens[i + 1]);
    if (last === "*") terms[terms.length - 1] *= v;
    else if (last === "/") {
      if (v === 0) throw Error("Cannot divide by zero");
      terms[terms.length - 1] /= v;
    } else terms.push(last === "-" ? -v : v);
  }
  const n = Math.round(terms.reduce((a, b) => a + b, 0) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 9e12) throw Error("Amount is too large");
  return n;
}
// Copy of the dataset without its backup list.
export function dataSnapshot() {
  const x = deepClone(appData);
  x.backups = [];
  return x;
}
// Store a snapshot of the dataset in the backup list (before destructive actions).
export function createBackup() {
  appData.backups.unshift({
    id: newId(),
    at: new Date().toISOString(),
    data: dataSnapshot(),
  });
  appData.backups = appData.backups.slice(0, 10);
  save();
}
