/* Finance model: balances, currency conversion, periods, reports */
import { clone, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import { t } from "../ui/primitives.js";

export const acc = (id) => D.accounts.find((a) => a.id === id),
  cat = (id) => D.categories.find((c) => c.id === id),
  bal = (id) => {
    const a = acc(id);
    return a
      ? a.opening +
          D.ops.reduce(
            (n, o) =>
              n + (o.to === id ? (o.receive ?? o.amount) : 0) - (o.from === id ? o.amount : 0),
            0,
          )
      : 0;
  },
  rate = (c) => D.rates[c] || 1;
export const convert = (n, from, to) => Math.round((n * rate(from)) / rate(to));
export function overall() {
  return D.accounts
    .filter((a) => a.include && !a.archived)
    .reduce((s, a) => s + convert(bal(a.id), a.currency, D.settings.currency), 0);
}
export function money(n, currency = D.settings.currency, isBalance = false) {
  if (D.settings.hidden && (D.settings.hiddenValues !== "Balances only" || isBalance))
    return "•••• " + esc(currency);
  let v = n / 100,
    dec = D.settings.hideCents ? 0 : D.settings.decimal ? 2 : Math.abs(n) % 100 ? 2 : 0;
  let text = v.toLocaleString(D.settings.language === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: D.settings.groupDigits,
  });
  return esc(D.settings.currencyFirst ? currency + " " + text : text + " " + currency);
}
export const moneySpan = (n, c, sign = false, isBalance = false) =>
  `<span class="money ${n > 0 ? "pos" : n < 0 ? "neg" : "muted"}">${sign && n > 0 ? "+" : ""}${money(n, c, isBalance)}</span>`;
export const dateObj = (s) => new Date(s + "T12:00:00Z"),
  iso = (d) => d.toISOString().slice(0, 10),
  addDays = (s, n) => {
    let d = dateObj(s);
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  },
  dateLabel = (s, short = false) =>
    D.settings.dateFormat === "iso"
      ? s
      : dateObj(s).toLocaleDateString(
          D.settings.language === "ru"
            ? "ru-RU"
            : D.settings.dateFormat === "day"
              ? "en-GB"
              : "en-US",
          {
            timeZone: "UTC",
            ...(short
              ? { month: "long", day: "numeric" }
              : { year: "numeric", month: "long", day: "numeric" }),
          },
        );
export function bounds(p = U.period) {
  const d = dateObj(p.anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (p.mode === "all") return ["0000-01-01", "9999-12-31"];
  if (p.mode === "range") return [p.from, p.to];
  if (p.mode === "day") return [p.anchor, p.anchor];
  if (p.mode === "week") {
    let a = addDays(p.anchor, -((d.getUTCDay() - Number(D.settings.weekStart) + 7) % 7));
    return [a, addDays(a, 6)];
  }
  if (p.mode === "year") return [`${y}-01-01`, `${y}-12-31`];
  const day = Number(D.settings.monthStart) || 1;
  const start = (month) => {
    let z = new Date(Date.UTC(y, month, 1, 12));
    z.setUTCDate(
      Math.min(day, new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    return iso(z);
  };
  let month = p.anchor < start(m) ? m - 1 : m;
  return [start(month), addDays(start(month + 1), -1)];
}

export function periodTitle() {
  const [a, b] = bounds();
  if (U.period.mode === "all") return t("All time");
  if (U.period.mode === "month")
    return dateObj(a).toLocaleDateString(D.settings.language === "ru" ? "ru-RU" : "en-US", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  if (U.period.mode === "year") return a.slice(0, 4);
  if (U.period.mode === "day") return dateLabel(a);
  return dateLabel(a, true) + " – " + dateLabel(b, true);
}
export function matches(o, f = U.filters) {
  return (
    (!f.accounts || f.accounts.includes(o.from) || f.accounts.includes(o.to)) &&
    (!f.categories ||
      f.categories.includes(o.category) ||
      f.categories.includes(cat(o.category)?.parent)) &&
    (!f.types || o.type === "adjustment" || f.types.includes(o.type)) &&
    (!f.tags || f.tags.some((v) => (o.tags || []).includes(v))) &&
    (!f.comment || (o.comment || "").toLowerCase().includes(f.comment.toLowerCase()))
  );
}
export function visibleOps() {
  const [a, b] = bounds();
  return D.ops
    .filter((o) => o.date >= a && o.date <= b && matches(o))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function reportRows(ops = visibleOps()) {
  let out = [];
  for (const o of ops) {
    if (o.type === "adjustment") continue;
    if (o.type !== "transfer") {
      const a = acc(o.from || o.to);
      out.push({
        ...o,
        reportType: o.type,
        reportAmount: convert(o.amount, a?.currency || "KGS", D.settings.currency),
      });
    } else {
      const source = acc(o.from),
        dest = acc(o.to);
      if (dest?.type === "Debt" && dest.considerExpense)
        out.push({
          ...o,
          category: "debt:" + dest.id,
          reportType: "expense",
          reportAmount: convert(o.amount, source.currency, D.settings.currency),
        });
      if (source?.type === "Debt" && source.considerIncome)
        out.push({
          ...o,
          category: "debt:" + source.id,
          reportType: "income",
          reportAmount: convert(o.amount, source.currency, D.settings.currency),
        });
    }
  }
  return out;
}
export const totalType = (type, ops) =>
  reportRows(ops)
    .filter((o) => o.reportType === type)
    .reduce((s, o) => s + o.reportAmount, 0);
export const categoryTotal = (id) =>
  reportRows()
    .filter((o) => o.category === id || cat(o.category)?.parent === id)
    .reduce((s, o) => s + o.reportAmount, 0);
export function calculate(expr) {
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
export function snapshot() {
  const x = clone(D);
  x.backups = [];
  return x;
}
export function backup() {
  D.backups.unshift({
    id: uid(),
    at: new Date().toISOString(),
    data: snapshot(),
  });
  D.backups = D.backups.slice(0, 10);
  save();
}
