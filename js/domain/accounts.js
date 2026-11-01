/* Accounts: favorite, records and deletion */
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { accountById } from "./finance.js";

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
