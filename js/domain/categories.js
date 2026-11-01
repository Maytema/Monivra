/* Categories: storing, deleting, moving and merging */
import { deepClone, newId } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { categoryById } from "./finance.js";

// Delete a category with its sub-categories and every operation and scheduled payment that uses
// them. Budgets lose these categories; a budget left without any category is deleted too.
// Returns what disappeared, so the interface can stop referring to it.
export function deleteCategory(id) {
  const ids = [id, ...appData.categories.filter((c) => c.parent === id).map((c) => c.id)];
  const operations = appData.ops.filter((o) => ids.includes(o.category)).map((o) => o.id);
  appData.ops = appData.ops.filter((o) => !ids.includes(o.category));
  appData.scheduled = appData.scheduled.filter((o) => !ids.includes(o.category));
  appData.categories = appData.categories.filter((c) => !ids.includes(c.id));
  const kept = appData.budgets
    .map((b) => ({ ...b, categories: b.categories?.filter((i) => !ids.includes(i)) }))
    .filter((b) => b.categories === null || b.categories.length);
  const budgets = appData.budgets.filter((b) => !kept.some((k) => k.id === b.id)).map((b) => b.id);
  appData.budgets = kept;
  save();
  return { operations, categories: ids, budgets };
}

// Everything that belongs to a category goes to another one and the category disappears.
function mergeCategory(id, target) {
  for (const key of ["ops", "scheduled"])
    for (const o of appData[key]) if (o.category === id) o.category = target;
  for (const c of appData.categories) if (c.parent === id) c.parent = target;
  for (const budget of appData.budgets)
    if (budget.categories)
      budget.categories = [...new Set(budget.categories.map((x) => (x === id ? target : x)))];
  appData.categories = appData.categories.filter((c) => c.id !== id);
}

// Move a category under another one or promote it to the top level.
// Returns what disappeared (merging removes the moved category), so the interface can stop referring to it.
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
  } else mergeCategory(id, target);
  save();
  return { categories: nest ? [] : [id] };
}

const union = (a, b) => ({
  operations: [...(a.operations || []), ...(b.operations || [])],
  categories: [...(a.categories || []), ...(b.categories || [])],
});

// One planned change of a subcategory; returns what disappeared.
function applySubcategoryAction({ id, mode, target }) {
  const sub = categoryById(id);
  if (!sub) return {};
  const sameType = categoryById(target)?.type === sub.type;
  if (mode === "archiveSub") sub.archived = true;
  else if (mode === "restoreSub") sub.archived = false;
  else if (mode === "promoteSub") sub.parent = null;
  else if (mode === "moveSub" && sameType) sub.parent = target;
  else if (mode === "mergeSub" && sameType) {
    mergeCategory(id, target);
    return { categories: [id] };
  } else if (mode === "deleteSub") return deleteCategory(id);
  return {};
}

// Store the edited category with the changes planned on its subcategories.
// `relocate` nests the category into another one or merges it into it ({ mode, target }).
// Returns what disappeared, so the interface can stop referring to it.
export function storeCategory(
  draft,
  { newSubcategories = [], subActions = [], relocate = null } = {},
) {
  const existing = categoryById(draft.id);
  if (existing) Object.assign(existing, draft);
  else {
    if (!draft.id) draft.id = newId();
    appData.categories.push(deepClone(draft));
  }
  for (const sub of newSubcategories) {
    sub.parent = draft.id;
    if (!appData.categories.some((c) => c.id === sub.id)) appData.categories.push(deepClone(sub));
  }
  let removed = {};
  for (const action of subActions) removed = union(removed, applySubcategoryAction(action));
  if (relocate && categoryById(relocate.target))
    removed = union(removed, moveCategory(draft.id, relocate.target, relocate.mode === "nest"));
  save();
  return removed;
}
