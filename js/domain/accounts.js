/* Accounts: the form state, storing, favorite, records and deletion */
import { deepClone, newId, today } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { changeAccountCurrency } from "./currency-change.js";
import { accountBalance, accountById, convertCurrency, debtDirection } from "./finance.js";
import { putOperation, validateOp } from "./operations.js";

// Mark one account as the favorite; there is only ever one.
export function toggleFavoriteAccount(id) {
  const wasFavorite = appData.accounts.find((a) => a.id === id)?.favorite;
  appData.accounts.forEach((a) => (a.favorite = !wasFavorite && a.id === id));
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

// Delete an account together with its operations and scheduled payments.
// Returns what disappeared, so the interface can stop referring to it.
export function deleteAccount(id) {
  if (!accountById(id)) return {};
  const linked = (op) => op.from === id || op.to === id;
  const operations = appData.ops.filter(linked).map((op) => op.id);
  appData.ops = appData.ops.filter((op) => !linked(op));
  appData.scheduled = appData.scheduled.filter((op) => !linked(op));
  appData.accounts = appData.accounts.filter((a) => a.id !== id);
  save();
  return { operations, accounts: [id] };
}

const ACCOUNT_TYPES = ["Regular", "Savings", "Debt"];

// The form state for editing `account`, or for a new one when none is given.
export function accountDraft(account) {
  const draft = account
    ? deepClone(account)
    : {
        id: null,
        name: "",
        type: "Regular",
        opening: 0,
        icon: "wallet",
        color: "#9d00b5",
        currency: appData.settings.currency,
        goal: 0,
        limit: 0,
        include: true,
        archived: false,
        favorite: false,
        description: "",
        debt: "Owe me",
        considerExpense: false,
        considerIncome: false,
        showExpense: false,
        showIncome: false,
      };
  draft.balance = account ? accountBalance(account.id) : 0;
  if (account?.type === "Debt") draft.debt = debtDirection(account);
  if (draft.type === "Debt" && draft.totalDebt === undefined)
    draft.totalDebt = Math.abs(account?.opening || draft.balance);
  // A new debt can be recorded as an operation with another account.
  draft.createOperation = false;
  draft.counterpart = appData.accounts.find(
    (x) => !x.archived && x.id !== draft.id && x.type === "Regular",
  )?.id;
  return draft;
}

// A normalized copy of the form state; throws an Error with a message for the person when it is invalid.
export function checkedAccountDraft(source) {
  const draft = deepClone(source);
  draft.name = String(draft.name || "").trim();
  if (!draft.name) throw Error("Enter a name");
  if (draft.name.length > 64) throw Error("Name is too long");
  if (!ACCOUNT_TYPES.includes(draft.type)) throw Error("Select account type");
  if (!appData.rates[draft.currency] || appData.rates[draft.currency] <= 0)
    throw Error("Select account currency");
  for (const key of ["balance", "goal", "limit"])
    if (!Number.isSafeInteger(draft[key] || 0)) throw Error("Invalid amount");
  if (draft.type === "Savings" && draft.goal < 0) throw Error("Goal cannot be negative");
  if (draft.type === "Regular" && draft.limit < 0) throw Error("Credit limit cannot be negative");
  if (draft.type === "Debt") {
    draft.balance = (draft.debt === "I owe" ? -1 : 1) * Math.abs(draft.balance);
    if (draft.totalDebt === undefined) draft.totalDebt = Math.abs(draft.balance);
    if (!Number.isSafeInteger(draft.totalDebt) || draft.totalDebt < 0)
      throw Error("Invalid total debt");
  }
  return draft;
}

// Does storing this draft change the currency of an account that has records?
export function changesCurrencyOfUsedAccount(draft) {
  const existing = accountById(draft.id);
  return Boolean(existing && existing.currency !== draft.currency && accountHasRecords(existing));
}

// Fields the person did not touch follow the conversion of a currency change; edited ones stay.
function convertUntouchedFields(account, draft, mode) {
  const keys = ["balance", "goal", "limit", "totalDebt"];
  const read = (a) => ({ ...a, balance: accountBalance(a.id) });
  const before = read(account);
  changeAccountCurrency(account.id, draft.currency, mode);
  const after = read(account);
  for (const key of keys) if (draft[key] === before[key]) draft[key] = after[key];
}

// A debt recorded together with an operation needs a second account and amounts that survive
// the conversion between the two currencies.
function checkDebtOperation(draft, change) {
  const other = accountById(draft.counterpart);
  if (!other || draft.counterpart === draft.id) throw Error("Select a different account");
  if (!change) return;
  const amount = change > 0 ? convertCurrency(change, draft.currency, other.currency) : -change;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error("Invalid debt transfer amount");
  const received =
    change > 0
      ? convertCurrency(amount, other.currency, draft.currency)
      : convertCurrency(amount, draft.currency, other.currency);
  if (!Number.isSafeInteger(received) || received <= 0)
    throw Error("Converted debt amount is too small");
}

// The transfer that records a new debt: the opening balance is corrected so that the transfer
// brings the account to the balance that was typed.
function recordDebtOperation(account, counterpartId, change) {
  const other = accountById(counterpartId);
  const op = { type: "transfer", date: today(), comment: "Debt balance adjustment", tags: [] };
  if (change > 0) {
    op.from = other.id;
    op.to = account.id;
    op.amount = convertCurrency(change, account.currency, other.currency);
  } else {
    op.from = account.id;
    op.to = other.id;
    op.amount = -change;
  }
  validateOp(op);
  account.opening -= op.to === account.id ? op.receive : -op.amount;
  putOperation(op);
}

// Store a checked draft. `mode` tells how a currency change treats the operations
// (see `changeAccountCurrency`). Throws an Error with a message for the person when it cannot be stored.
export function storeAccount(draft, mode) {
  const old = accountById(draft.id);
  if (old && old.currency !== draft.currency) convertUntouchedFields(old, draft, mode);
  const change = draft.balance - (old ? accountBalance(old.id) : 0);
  const withDebtOperation = draft.createOperation && draft.type === "Debt";
  if (withDebtOperation) checkDebtOperation(draft, change);

  // The starting balance of a new account is an Adjustment operation, visible in the list and
  // editable like any other; debts keep it as the opening balance.
  const startsWithAdjustment = !old && draft.type !== "Debt" && draft.balance !== 0;
  const stored = {
    ...draft,
    id: draft.id || newId(),
    opening: old ? old.opening : startsWithAdjustment ? 0 : draft.balance,
  };
  for (const field of ["balance", "createOperation", "counterpart"]) delete stored[field];
  if (stored.type !== "Debt") delete stored.totalDebt;
  const account = old ? Object.assign(old, stored) : stored;
  if (!old) appData.accounts.push(account);

  if ((old && change && !withDebtOperation) || startsWithAdjustment)
    appData.ops.push({
      id: newId(),
      type: "adjustment",
      date: today(),
      from: change < 0 ? account.id : null,
      to: change > 0 ? account.id : null,
      amount: Math.abs(change),
      comment: "Manual balance adjustment",
      tags: [],
    });
  if (withDebtOperation && change) recordDebtOperation(account, draft.counterpart, change);
  return account;
}
