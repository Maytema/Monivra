/* Operation, account and category mutations; scheduled payments */
import { TODAY, deepClone, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import { netAmount } from "./fees.js";
import {
  accountBalance,
  accountById,
  addDays,
  categoryById,
  convertCurrency,
  parseDate,
  toIsoDate,
} from "./finance.js";

// Throw an Error with a user-facing message if an operation draft is invalid.
export function validateOp(d, lookup = { account: accountById, category: categoryById }) {
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0)
    throw Error("Enter an amount greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || toIsoDate(parseDate(d.date)) !== d.date)
    throw Error("Choose a valid date");
  if (d.type === "transfer") {
    if (!lookup.account(d.from) || !lookup.account(d.to) || d.from === d.to)
      throw Error("Choose two different accounts");
    d.receive =
      d.receiveManual === true && Number.isSafeInteger(d.receive) && d.receive > 0
        ? d.receive
        : convertCurrency(
            netAmount(d),
            lookup.account(d.from).currency,
            lookup.account(d.to).currency,
          );
    if (!Number.isSafeInteger(d.receive) || d.receive <= 0)
      throw Error("Converted amount is too small or too large for the destination currency");
    delete d.category;
  } else if (d.type === "expense" || d.type === "income") {
    const category = lookup.category(d.category);
    if (!category) throw Error("Select a category");
    if (category.type !== d.type) throw Error("Category does not match operation type");
    const accountId = d.type === "expense" ? d.from || d.to : d.to || d.from;
    if (!lookup.account(accountId)) throw Error("Select an account");
    // A changed operation type must not retain the other side of an earlier transfer.
    if (d.type === "expense") {
      d.from = accountId;
      delete d.to;
    } else {
      d.to = accountId;
      delete d.from;
    }
    // Income: the account gets what is left after fees; expense: the account pays in full.
    if (d.type === "income" && d.fees?.length) d.receive = netAmount(d);
    else delete d.receive;
  } else throw Error("Unsupported operation type");
}
// Validate and insert or update an operation (or a scheduled payment), then save.
export function putOperation(d, schedule = false) {
  d = deepClone(d);
  delete d.expr;
  delete d.editing;
  delete d.origin;
  delete d.error;
  delete d.fresh;
  if (!d.fees?.length) delete d.fees;
  validateOp(d);
  const list = schedule ? appData.scheduled : appData.ops;
  if (!d.id) d.id = newId();
  const i = list.findIndex((o) => o.id === d.id);
  if (i < 0) list.push(d);
  else list[i] = d;
  save();
  return d;
}
// Delete an operation or a scheduled payment.
// Mark one account as the favorite; there is only ever one.
export function toggleFavoriteAccount(id) {
  const wasFavorite = appData.accounts.find((a) => a.id === id)?.favorite;
  appData.accounts.forEach((a) => (a.favorite = !wasFavorite && a.id === id));
  save();
}
// Put the items of one group (given by ids in their new order) back into the slots
// those items already occupy in the list, so other groups keep their places.
export function reorderedList(items, orderedIds) {
  const slots = items.flatMap((x, i) => (orderedIds.includes(x.id) ? [i] : []));
  const next = [...items];
  slots.forEach((slot, n) => (next[slot] = items.find((x) => x.id === orderedIds[n])));
  return next;
}
export function reorderAccounts(orderedIds) {
  appData.accounts = reorderedList(appData.accounts, orderedIds);
  save();
}
export function reorderCategories(orderedIds) {
  // Sub-categories that are not saved yet are not in the list and keep their place.
  const known = orderedIds.filter((id) => appData.categories.some((c) => c.id === id));
  appData.categories = reorderedList(appData.categories, known);
  save();
}
export function deleteOperation(id, scheduled = false) {
  let key = scheduled ? "scheduled" : "ops";
  appData[key] = appData[key].filter((o) => o.id !== id);
  uiState.selected = uiState.selected.filter((x) => x !== id);
  save();
}
// Does anything refer to the account: a balance, a limit, a goal or any operation?
export function accountHasRecords(a) {
  const used = (o) => o.from === a.id || o.to === a.id;
  return !!(
    a.opening ||
    a.goal ||
    a.limit ||
    appData.ops.some(used) ||
    appData.scheduled.some(used)
  );
}
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
    const was = o.from === id || o.type !== "transfer" ? o.amount : o.receive;
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
// Delete an account together with its operations and scheduled payments.
export function deleteAccount(id) {
  if (!accountById(id)) return;
  appData.ops = appData.ops.filter((o) => o.from !== id && o.to !== id);
  appData.scheduled = appData.scheduled.filter((o) => o.from !== id && o.to !== id);
  appData.accounts = appData.accounts.filter((a) => a.id !== id);
  if (uiState.filters.accounts) {
    const rest = uiState.filters.accounts.filter((x) => x !== id);
    uiState.filters.accounts = rest.length ? rest : null;
  }
  save();
}
// Delete a category with its sub-categories and every operation and scheduled payment that uses
// them. Budgets lose these categories; a budget left without any category is deleted too.
export function deleteCategory(id) {
  const ids = [id, ...appData.categories.filter((c) => c.parent === id).map((c) => c.id)];
  appData.ops = appData.ops.filter((o) => !ids.includes(o.category));
  appData.scheduled = appData.scheduled.filter((o) => !ids.includes(o.category));
  appData.categories = appData.categories.filter((c) => !ids.includes(c.id));
  appData.budgets = appData.budgets
    .map((b) => ({ ...b, categories: b.categories?.filter((i) => !ids.includes(i)) }))
    .filter((b) => b.categories === null || b.categories.length);
  uiState.selected = uiState.selected.filter((x) => appData.ops.some((o) => o.id === x));
  if (uiState.filters.categories) {
    const rest = uiState.filters.categories.filter((x) => !ids.includes(x));
    uiState.filters.categories = rest.length ? rest : null;
  }
  save();
}
// Move a category under another one or promote it to the top level.
export function moveCategory(id, target, nest) {
  const a = categoryById(id),
    b = categoryById(target);
  if (
    !a ||
    !b ||
    a.id === b.id ||
    a.type !== b.type ||
    (nest && b.parent) ||
    (!nest && b.parent && a.parent !== b.parent)
  )
    throw Error("Select a valid category");
  if (nest) {
    a.parent = target;
    for (const c of appData.categories) if (c.parent === id) c.parent = target;
  } else {
    for (const key of ["ops", "scheduled"])
      for (const o of appData[key]) if (o.category === id) o.category = target;
    for (const c of appData.categories) if (c.parent === id) c.parent = target;
    for (const budget of appData.budgets)
      if (budget.categories)
        budget.categories = [...new Set(budget.categories.map((x) => (x === id ? target : x)))];
    appData.categories = appData.categories.filter((c) => c.id !== id);
  }
  save();
}

// Next occurrence of a recurring payment, or null when finished.
export function nextDate(item) {
  const r = item.recur;
  if (!r || !(r.every > 0)) return null;
  if (r.remaining !== null && r.remaining <= 1) return null;
  const base = parseDate(item.date);
  let result;
  if (r.unit === "Days") result = addDays(item.date, r.every);
  else if (r.unit === "Weeks") {
    const days = r.days?.length ? r.days : [base.getUTCDay()];
    const startOfBase = addDays(item.date, -base.getUTCDay());
    for (let n = 1; n <= r.every * 7 + 7; n++) {
      const next = addDays(item.date, n),
        dt = parseDate(next),
        week = Math.floor(
          (parseDate(addDays(next, -dt.getUTCDay())) - parseDate(startOfBase)) / 604800000,
        );
      if (days.includes(dt.getUTCDay()) && (week === 0 || week % r.every === 0)) {
        result = next;
        break;
      }
    }
  } else {
    const y = base.getUTCFullYear(),
      m = base.getUTCMonth(),
      day = base.getUTCDate(),
      delta = r.unit === "Years" ? 12 * r.every : r.every;
    const d = new Date(Date.UTC(y, m + delta, 1, 12));
    d.setUTCDate(
      Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    result = toIsoDate(d);
  }
  return result || null;
}
// Post or skip a due scheduled payment and schedule the next one.
export function processScheduled(id, post) {
  const item = appData.scheduled.find((o) => o.id === id);
  if (!item) return;
  if (post) {
    const op = { ...deepClone(item), id: newId(), date: TODAY };
    delete op.recur;
    delete op.reminder;
    putOperation(op);
  }
  const n = nextDate(item);
  if (n) {
    item.date = n;
    if (item.recur.remaining !== null) item.recur.remaining--;
  } else appData.scheduled = appData.scheduled.filter((o) => o.id !== id);
  save();
}
