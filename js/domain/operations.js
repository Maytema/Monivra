/* Operation, account and category mutations; scheduled payments */
import { TODAY, deepClone, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  accountById,
  addDays,
  categoryById,
  convertCurrency,
  parseDate,
  toIsoDate,
} from "./finance.js";
import { toast } from "../ui/primitives.js";

// Throw an Error with a user-facing message if an operation draft is invalid.
export function validateOp(d) {
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0)
    throw Error("Enter an amount greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || toIsoDate(parseDate(d.date)) !== d.date)
    throw Error("Choose a valid date");
  if (d.type === "transfer") {
    if (!accountById(d.from) || !accountById(d.to) || d.from === d.to)
      throw Error("Choose two different accounts");
    d.receive =
      d.receiveManual === true && Number.isSafeInteger(d.receive) && d.receive > 0
        ? d.receive
        : convertCurrency(d.amount, accountById(d.from).currency, accountById(d.to).currency);
    if (!Number.isSafeInteger(d.receive) || d.receive <= 0)
      throw Error("Converted amount is too small or too large for the destination currency");
    delete d.category;
  } else if (d.type === "expense" || d.type === "income") {
    const category = categoryById(d.category);
    if (!category) throw Error("Select a category");
    if (category.type !== d.type) throw Error("Category does not match operation type");
    const accountId = d.type === "expense" ? d.from || d.to : d.to || d.from;
    if (!accountById(accountId)) throw Error("Select an account");
    // A changed operation type must not retain the other side of an earlier transfer.
    if (d.type === "expense") {
      d.from = accountId;
      delete d.to;
    } else {
      d.to = accountId;
      delete d.from;
    }
    delete d.receive;
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
export function deleteOperation(id, scheduled = false) {
  let key = scheduled ? "scheduled" : "ops";
  appData[key] = appData[key].filter((o) => o.id !== id);
  uiState.selected = uiState.selected.filter((x) => x !== id);
  save();
}
// Delete an account together with its operations and scheduled payments.
export function deleteAccount(id) {
  if (!accountById(id)) return;
  appData.ops = appData.ops.filter((o) => o.from !== id && o.to !== id);
  appData.scheduled = appData.scheduled.filter((o) => o.from !== id && o.to !== id);
  appData.accounts = appData.accounts.filter((a) => a.id !== id);
  if (uiState.filters.accounts)
    uiState.filters.accounts = uiState.filters.accounts.filter((x) => x !== id);
  save();
}
// Delete a category and its sub-categories; archive them instead when operations still use them.
export function deleteCategory(id) {
  const children = appData.categories.filter((c) => c.parent === id).map((c) => c.id),
    ids = [id, ...children];
  if (
    appData.ops.some((o) => ids.includes(o.category)) ||
    appData.scheduled.some((o) => ids.includes(o.category))
  ) {
    for (const c of appData.categories) if (ids.includes(c.id)) c.archived = true;
    save();
    toast("Category archived to preserve transaction history");
    return;
  }
  appData.categories = appData.categories.filter((c) => !ids.includes(c.id));
  appData.budgets = appData.budgets
    .map((b) => ({
      ...b,
      categories: b.categories?.filter((i) => !ids.includes(i)),
    }))
    .filter((b) => b.categories === null || b.categories.length);
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
