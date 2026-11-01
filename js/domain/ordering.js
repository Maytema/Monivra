/* Manual order of accounts and categories */
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";

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
