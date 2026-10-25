/* Operation, account and category mutations; scheduled payments */
import { TODAY, clone, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import { acc, addDays, cat, convert, dateObj, iso } from "./finance.js";
import { toast } from "../ui/primitives.js";

export function validateOp(d) {
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0)
    throw Error("Enter an amount greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || iso(dateObj(d.date)) !== d.date)
    throw Error("Choose a valid date");
  if (d.type === "transfer") {
    if (!acc(d.from) || !acc(d.to) || d.from === d.to) throw Error("Choose two different accounts");
    d.receive =
      d.receiveManual === true && Number.isSafeInteger(d.receive) && d.receive > 0
        ? d.receive
        : convert(d.amount, acc(d.from).currency, acc(d.to).currency);
    if (!Number.isSafeInteger(d.receive) || d.receive <= 0)
      throw Error("Converted amount is too small or too large for the destination currency");
    delete d.category;
  } else if (d.type === "expense" || d.type === "income") {
    const category = cat(d.category);
    if (!category) throw Error("Select a category");
    if (category.type !== d.type) throw Error("Category does not match operation type");
    const accountId = d.type === "expense" ? d.from || d.to : d.to || d.from;
    if (!acc(accountId)) throw Error("Select an account");
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
export function putOperation(d, schedule = false) {
  d = clone(d);
  delete d.expr;
  delete d.editing;
  delete d.origin;
  delete d.error;
  delete d.fresh;
  validateOp(d);
  const list = schedule ? D.scheduled : D.ops;
  if (!d.id) d.id = uid();
  const i = list.findIndex((o) => o.id === d.id);
  if (i < 0) list.push(d);
  else list[i] = d;
  save();
  return d;
}
export function deleteOperation(id, scheduled = false) {
  let key = scheduled ? "scheduled" : "ops";
  D[key] = D[key].filter((o) => o.id !== id);
  U.selected = U.selected.filter((x) => x !== id);
  save();
}
export function deleteAccount(id) {
  if (!acc(id)) return;
  D.ops = D.ops.filter((o) => o.from !== id && o.to !== id);
  D.scheduled = D.scheduled.filter((o) => o.from !== id && o.to !== id);
  D.accounts = D.accounts.filter((a) => a.id !== id);
  if (U.filters.accounts) U.filters.accounts = U.filters.accounts.filter((x) => x !== id);
  save();
}
export function deleteCategory(id) {
  const children = D.categories.filter((c) => c.parent === id).map((c) => c.id),
    ids = [id, ...children];
  if (
    D.ops.some((o) => ids.includes(o.category)) ||
    D.scheduled.some((o) => ids.includes(o.category))
  ) {
    for (const c of D.categories) if (ids.includes(c.id)) c.archived = true;
    save();
    toast("Category archived to preserve transaction history");
    return;
  }
  D.categories = D.categories.filter((c) => !ids.includes(c.id));
  D.budgets = D.budgets
    .map((b) => ({
      ...b,
      categories: b.categories?.filter((i) => !ids.includes(i)),
    }))
    .filter((b) => b.categories === null || b.categories.length);
  save();
}
export function moveCategory(id, target, nest) {
  const a = cat(id),
    b = cat(target);
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
    for (const c of D.categories) if (c.parent === id) c.parent = target;
  } else {
    for (const key of ["ops", "scheduled"])
      for (const o of D[key]) if (o.category === id) o.category = target;
    for (const c of D.categories) if (c.parent === id) c.parent = target;
    for (const budget of D.budgets)
      if (budget.categories)
        budget.categories = [...new Set(budget.categories.map((x) => (x === id ? target : x)))];
    D.categories = D.categories.filter((c) => c.id !== id);
  }
  save();
}

export function nextDate(item) {
  const r = item.recur;
  if (!r || !(r.every > 0)) return null;
  if (r.remaining !== null && r.remaining <= 1) return null;
  const base = dateObj(item.date);
  let result;
  if (r.unit === "Days") result = addDays(item.date, r.every);
  else if (r.unit === "Weeks") {
    const days = r.days?.length ? r.days : [base.getUTCDay()];
    const startOfBase = addDays(item.date, -base.getUTCDay());
    for (let n = 1; n <= r.every * 7 + 7; n++) {
      const next = addDays(item.date, n),
        dt = dateObj(next),
        week = Math.floor(
          (dateObj(addDays(next, -dt.getUTCDay())) - dateObj(startOfBase)) / 604800000,
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
    result = iso(d);
  }
  return result || null;
}
export function processScheduled(id, post) {
  const item = D.scheduled.find((o) => o.id === id);
  if (!item) return;
  if (post) {
    const op = { ...clone(item), id: uid(), date: TODAY };
    delete op.recur;
    delete op.reminder;
    putOperation(op);
  }
  const n = nextDate(item);
  if (n) {
    item.date = n;
    if (item.recur.remaining !== null) item.recur.remaining--;
  } else D.scheduled = D.scheduled.filter((o) => o.id !== id);
  save();
}
