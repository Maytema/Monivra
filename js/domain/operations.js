/* Operations: checking, storing and deleting; changing many at once */
import { deepClone, newId } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { netAmount } from "./fees.js";
import { accountById, categoryById, convertCurrency, parseDate, toIsoDate } from "./finance.js";

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
  for (const op of replacements) appData.ops[appData.ops.findIndex((x) => x.id === op.id)] = op;
}
