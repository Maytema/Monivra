/* Operations: checking, storing and deleting; changing many at once */
import { deepClone, newId, timeNow, today } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { netAmount } from "./fees.js";
import {
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
  } else if (d.type === "adjustment") {
    // The other side of a balance correction is "Adjustment" in the main currency: a raise
    // sends the amount in the main currency and the account receives `receive`, a cut takes
    // `amount` from the account and "Adjustment" receives `receive`.
    const account = lookup.account(d.from || d.to);
    if (!account || !!d.from === !!d.to) throw Error("Select an account");
    const main = appData.settings.currency;
    const [sent, got] = d.to ? [main, account.currency] : [account.currency, main];
    if (sent === got) delete d.receive;
    else if (!(d.receiveManual === true && Number.isSafeInteger(d.receive) && d.receive > 0))
      d.receive = convertCurrency(d.amount, sent, got);
    if (d.receive !== undefined && (!Number.isSafeInteger(d.receive) || d.receive <= 0))
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
    // A category in another currency keeps the amount in its currency next to the account's one.
    const account = lookup.account(accountId);
    if (category.currency === account.currency) delete d.categoryAmount;
    else {
      const own =
        d.receiveManual === true && Number.isSafeInteger(d.receive) && d.receive > 0
          ? d.receive
          : convertCurrency(d.amount, account.currency, category.currency);
      if (!Number.isSafeInteger(own) || own <= 0)
        throw Error("Converted amount is too small or too large for the destination currency");
      d.categoryAmount = { currency: category.currency, amount: own };
    }
    delete d.receiveManual;
    // Income: the account gets what is left after fees; expense: the account pays in full.
    if (d.type === "income" && d.fees?.length) d.receive = netAmount(d);
    else delete d.receive;
  } else throw Error("Unsupported operation type");
}

// An operation dated after today has not happened yet: it belongs among the scheduled payments.
// A correction of a balance is the exception, it is a statement about the present.
// Is a date so far from today (more than a year either way) that it may be a slip of the finger?
export const isFarDate = (date) => date < addDays(today(), -365) || date > addDays(today(), 365);
export const isPlanned = (d) => d.type !== "adjustment" && d.date > today();

// A month or year rule keeps the day it began on; editing the date starts it from the new day.
function keepRuleDay(d, previous) {
  const rule = d.recur && ["Months", "Years"].includes(d.recur.unit);
  if (!rule) delete d.anchorDay;
  else if (previous?.date === d.date && previous.anchorDay) d.anchorDay = previous.anchorDay;
  else d.anchorDay = parseDate(d.date).getUTCDate();
}

// The form of an operation as a one-time scheduled payment; it can then be given a repeat and a
// reminder.
export function scheduledForm(op) {
  const d = { ...op, recur: null, reminder: null, time: op.time || timeNow() };
  delete d.fromSchedule;
  return d;
}

// Turn an operation into a one-time scheduled payment.
function planOperation(d) {
  appData.ops = appData.ops.filter((o) => o.id !== d.id);
  appData.scheduled.push(scheduledForm(d));
}

// Operations dated after today that came in from outside (a backup, a file, an older version) are
// not done yet: they move to the scheduled payments, where they wait for their day exactly as one
// entered by hand. Nothing is lost and nothing happens twice; returns how many were moved.
export function planFutureOperations() {
  const future = appData.ops.filter(isPlanned);
  if (!future.length) return 0;
  const taken = new Set(appData.scheduled.map((o) => o.id));
  appData.ops = appData.ops.filter((o) => !isPlanned(o));
  for (const op of future) {
    const item = scheduledForm(op);
    if (taken.has(item.id)) item.id = newId();
    taken.add(item.id);
    appData.scheduled.push(item);
  }
  return future.length;
}

// The first day a scheduled payment can be set for: what is due today or earlier is an operation.
export const earliestScheduleDate = () => addDays(today(), 1);

// Validate and insert or update an operation (or a scheduled payment), then save. An operation
// dated in the future becomes a one-time scheduled payment instead. A scheduled payment cannot be
// created for, or moved to, a day that has come.
export function putOperation(d, schedule = false) {
  d = deepClone(d);
  delete d.expr;
  delete d.editing;
  delete d.origin;
  delete d.error;
  delete d.fresh;
  if (!d.fees?.length) delete d.fees;
  validateOp(d);
  if (!d.id) d.id = newId();
  if (!schedule && isPlanned(d)) {
    planOperation(d);
    save();
    return d;
  }
  const list = schedule ? appData.scheduled : appData.ops;
  const i = list.findIndex((o) => o.id === d.id);
  if (schedule) {
    if (d.date < earliestScheduleDate() && (i < 0 || list[i].date !== d.date))
      throw Error("A scheduled payment starts tomorrow at the earliest");
    keepRuleDay(d, list[i]);
  } else if (!d.fromSchedule) delete d.time;
  if (i < 0) list.push(d);
  else list[i] = d;
  save();
  return d;
}

export function deleteOperation(id, scheduled = false) {
  const key = scheduled ? "scheduled" : "ops";
  appData[key] = appData[key].filter((o) => o.id !== id);
  save();
}

// What a bulk edit may change; every field left empty keeps the operations as they are.
export const emptyBulkChanges = () => ({
  category: null,
  account: null,
  role: "sender",
  comment: null,
  addTags: [],
  removeTags: [],
  clearTags: false,
  date: null,
});

// Replace the operations with the given ids by copies with the changes applied.
// A balance adjustment has no category and keeps its direction; only its account may change.
// Nothing is replaced if one of the copies turns out invalid.
export function applyBulkChanges(ids, changes) {
  const replacements = appData.ops
    .filter((op) => ids.includes(op.id))
    .map((original) => {
      const op = deepClone(original);
      const adjustment = op.type === "adjustment";
      if (changes.category && op.type !== "transfer" && !adjustment) {
        const account = op.from || op.to;
        op.category = changes.category;
        op.type = categoryById(changes.category).type;
        op.from = op.type === "expense" ? account : null;
        op.to = op.type === "income" ? account : null;
      }
      if (changes.account) {
        if (op.type === "transfer")
          op[changes.role === "receiver" ? "to" : "from"] = changes.account;
        else if (adjustment) op[op.to ? "to" : "from"] = changes.account;
        else if (op.type === "income") op.to = changes.account;
        else op.from = changes.account;
      }
      if (changes.date) op.date = changes.date;
      if (changes.comment !== null) op.comment = changes.comment;
      op.tags = changes.clearTags
        ? []
        : [...new Set([...(op.tags || []), ...changes.addTags])].filter(
            (tag) => !changes.removeTags.includes(tag),
          );
      if (!adjustment) validateOp(op);
      return op;
    });
  let planned = 0;
  for (const op of replacements)
    if (isPlanned(op)) {
      planOperation(op);
      planned++;
    } else appData.ops[appData.ops.findIndex((x) => x.id === op.id)] = op;
  save();
  return planned;
}
