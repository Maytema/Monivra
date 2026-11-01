/* Categories: deleting and moving */
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
  appData.budgets = appData.budgets
    .map((b) => ({ ...b, categories: b.categories?.filter((i) => !ids.includes(i)) }))
    .filter((b) => b.categories === null || b.categories.length);
  save();
  return { operations, categories: ids };
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
  return { categories: nest ? [] : [id] };
}
