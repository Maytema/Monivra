/* Changing the currency of an account or of the whole application */
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { accountBalance, accountById, convertCurrency } from "./finance.js";

// What a currency change does to the operations of an account, without doing it. Two ways:
// - "spent": operations that took money from the account (expenses, transfers out) are recalculated
//   at the current rate, a transfer out also changes what the other account received. Income,
//   transfers in, balance corrections and the opening balance keep their numbers.
// - "all": every amount stored in the account's currency is converted, so the balance follows the
//   rate; the other side of a transfer keeps what it received, because that money did move.
// Returns the changes (`op` with its new `amount` and `receive`) and figures for a preview.
export function planCurrencyChange(id, currency, mode) {
  const a = accountById(id),
    conv = (n) => convertCurrency(n, a.currency, currency);
  const changes = [];
  for (const o of [...appData.ops, ...appData.scheduled]) {
    const out = o.from === id,
      into = o.to === id;
    const change = { op: o };
    if (mode === "spent") {
      if (!out || o.type === "adjustment") continue;
      change.amount = conv(o.amount);
      if (o.receive) change.receive = conv(o.receive);
    } else if (o.type === "adjustment") {
      // Only the account's own side is in its currency; "Adjustment" stays in the main one.
      if (into && o.receive !== undefined) change.receive = conv(o.receive);
      else change.amount = conv(o.amount);
    } else if (out || (into && o.type !== "transfer")) {
      change.amount = conv(o.amount);
      if (into && o.receive) change.receive = conv(o.receive);
    } else if (into && o.receive) change.receive = conv(o.receive);
    else continue;
    changes.push(change);
  }
  const taken = changes.filter((c) => c.op.from === id);
  const delta = changes.reduce((n, c) => {
    const o = c.op;
    if (o.from === id) return n - ((c.amount ?? o.amount) - o.amount);
    return n + ((c.receive ?? c.amount ?? o.amount) - (o.receive ?? o.amount));
  }, 0);
  const others = new Map();
  if (mode === "spent")
    for (const c of changes)
      if (c.op.from === id && c.receive !== undefined)
        others.set(c.op.to, (others.get(c.op.to) || 0) + c.receive - c.op.receive);
  const opening = mode === "all" ? conv(a.opening || 0) - (a.opening || 0) : 0;
  const before = accountBalance(id);
  return {
    changes,
    taken: taken.length,
    spentBefore: taken.reduce((n, c) => n + c.op.amount, 0),
    spentAfter: taken.reduce((n, c) => n + (c.amount ?? c.op.amount), 0),
    before,
    after: before + delta + opening,
    others,
  };
}

// Give an account another currency in one of the two ways described at `planCurrencyChange`.
// A recalculated operation remembers the amount it had (`recalculated`) so the list can show it;
// changing back to that currency forgets it again.
export function changeAccountCurrency(id, currency, mode) {
  const a = accountById(id),
    plan = planCurrencyChange(id, currency, mode);
  const conv = (n) => convertCurrency(n, a.currency, currency);
  if (mode === "all")
    for (const key of ["opening", "goal", "limit", "totalDebt"]) if (a[key]) a[key] = conv(a[key]);
  for (const { op: o, amount, receive } of plan.changes) {
    const was =
      o.from === id || (o.type !== "transfer" && !(o.type === "adjustment" && o.receive))
        ? o.amount
        : o.receive;
    if (amount !== undefined) {
      // A fixed fee is an amount in the same currency.
      if (o.from === id)
        for (const fee of o.fees || [])
          if (fee.value > 0) fee.value = conv(Math.round(fee.value * 100)) / 100;
      o.amount = amount;
    }
    if (receive !== undefined) o.receive = receive;
    if (!o.recalculated) o.recalculated = { amount: was, currency: a.currency };
    if (o.recalculated.currency === currency) delete o.recalculated;
  }
  a.currency = currency;
  save();
}

// Change the main currency of the application. Totals and statistics follow it right away because
// every account keeps its own currency. Categories and budgets that were in the old main currency
// follow too; a budget limit is converted so that it keeps its meaning.
export function changeMainCurrency(currency) {
  const old = appData.settings.currency;
  if (old === currency) return;
  for (const c of appData.categories) if (c.currency === old) c.currency = currency;
  for (const b of appData.budgets)
    if (b.currency === old) {
      b.amount = convertCurrency(b.amount, old, currency);
      b.currency = currency;
    }
  appData.settings.currency = currency;
  save();
}
