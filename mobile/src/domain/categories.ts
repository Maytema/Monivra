// Categories and budgets: storing, deleting, moving and merging; what a budget has spent.
import { DomainError } from "./errors.ts";
import type { LedgerTx } from "./change.ts";
import type { Env } from "./env.ts";
import { categoryById, newestFirst, reportRows, type ReportRow } from "./ledger.ts";
import { convert } from "./money.ts";
import { periodBounds } from "./periods.ts";
import type { Budget, Category, LedgerData, LocalDate, Minor, Operation } from "./types.ts";

export function blankCategory(fields: Partial<Category> & { id: string }): Category {
  return { name: "", type: "expense", icon: "tag", color: "#a5a3c8", currency: "KGS", parent: null, archived: false, ...fields };
}

// Deletes a category with its subcategories and every operation and scheduled payment that uses
// them; budgets lose them and a budget left without categories goes too.
export function deleteCategory(tx: LedgerTx, id: string): { operations: string[]; categories: string[] } {
  const ids = [id, ...tx.data.categories.filter((c) => c.parent === id).map((c) => c.id)];
  const uses = (o: Operation) => ids.includes(o.category ?? "");
  const operations = tx.data.ops.filter(uses).map((o) => o.id);
  tx.remove("ops", ...operations);
  tx.remove("scheduled", ...tx.data.scheduled.filter(uses).map((o) => o.id));
  for (const b of tx.data.budgets) {
    if (!b.categories?.some((c) => ids.includes(c))) continue;
    const rest = b.categories.filter((c) => !ids.includes(c));
    if (rest.length) tx.put("budgets", { ...b, categories: rest });
    else tx.remove("budgets", b.id);
  }
  tx.remove("categories", ...ids);
  return { operations, categories: ids };
}

function mergeCategory(tx: LedgerTx, id: string, target: string): void {
  tx.put("ops", ...tx.data.ops.filter((o) => o.category === id).map((o) => ({ ...o, category: target })));
  tx.put("scheduled", ...tx.data.scheduled.filter((o) => o.category === id).map((o) => ({ ...o, category: target })));
  tx.put("categories", ...tx.data.categories.filter((c) => c.parent === id).map((c) => ({ ...c, parent: target })));
  tx.put(
    "budgets",
    ...tx.data.budgets
      .filter((b) => b.categories?.includes(id))
      .map((b) => ({ ...b, categories: [...new Set((b.categories ?? []).map((x) => (x === id ? target : x)))] })),
  );
  tx.remove("categories", id);
}

// Nests a category under another one, or merges it into another one.
export function moveCategory(tx: LedgerTx, id: string, target: string, nest: boolean): { categories: string[] } {
  const a = categoryById(tx.data, id),
    b = categoryById(tx.data, target);
  if (!a || !b || a.id === b.id || a.type !== b.type || (nest && b.parent) || (!nest && b.parent && a.parent !== b.parent))
    throw new DomainError("Select a valid category");
  if (nest) {
    tx.put("categories", { ...a, parent: target }, ...tx.data.categories.filter((c) => c.parent === id).map((c) => ({ ...c, parent: target })));
    return { categories: [] };
  }
  mergeCategory(tx, id, target);
  return { categories: [id] };
}

export interface SubcategoryAction {
  id: string;
  mode: "archiveSub" | "restoreSub" | "promoteSub" | "moveSub" | "mergeSub" | "deleteSub";
  target?: string;
}

// Stores an edited category with the planned changes of its subcategories.
export function storeCategory(
  tx: LedgerTx,
  draft: Omit<Category, "id"> & { id: string | null },
  env: Env,
  { newSubcategories = [], subActions = [], relocate = null }: { newSubcategories?: Category[]; subActions?: SubcategoryAction[]; relocate?: { mode: "nest" | "merge"; target: string } | null } = {},
): { category: Category; removed: string[] } {
  const name = String(draft.name ?? "").trim();
  if (!name) throw new DomainError("Enter a name");
  const category: Category = { ...draft, name, id: draft.id || env.newId() };
  tx.put("categories", category);
  for (const sub of newSubcategories) if (!tx.get("categories", sub.id)) tx.put("categories", { ...sub, parent: category.id, type: category.type });
  const removed: string[] = [];
  for (const action of subActions) {
    const sub = categoryById(tx.data, action.id);
    if (!sub) continue;
    const sameType = categoryById(tx.data, action.target)?.type === sub.type;
    if (action.mode === "archiveSub") tx.put("categories", { ...sub, archived: true });
    else if (action.mode === "restoreSub") tx.put("categories", { ...sub, archived: false });
    else if (action.mode === "promoteSub") tx.put("categories", { ...sub, parent: null });
    else if (action.mode === "moveSub" && sameType && action.target) tx.put("categories", { ...sub, parent: action.target });
    else if (action.mode === "mergeSub" && sameType && action.target) {
      mergeCategory(tx, sub.id, action.target);
      removed.push(sub.id);
    } else if (action.mode === "deleteSub") removed.push(...deleteCategory(tx, sub.id).categories);
  }
  if (relocate && categoryById(tx.data, relocate.target))
    removed.push(...moveCategory(tx, category.id, relocate.target, relocate.mode === "nest").categories);
  return { category: categoryById(tx.data, category.id) ?? category, removed };
}

// ---- Budgets -----------------------------------------------------------------------------------

const budgetTakes = (data: LedgerData, b: Budget, row: ReportRow): boolean =>
  row.reportType === "expense" &&
  (!b.categories || b.categories.includes(row.category ?? "") || b.categories.includes(categoryById(data, row.category)?.parent ?? ""));

const periodOperations = (data: LedgerData, b: Budget, anchor: LocalDate): Operation[] => {
  const [from, to] = periodBounds({ mode: b.period || "month", anchor }, data.settings);
  return data.ops.filter((o) => o.date >= from && o.date <= to);
};

export const budgetOperations = (data: LedgerData, b: Budget, anchor: LocalDate): Operation[] =>
  periodOperations(data, b, anchor)
    .filter((o) => reportRows(data, [o]).some((row) => budgetTakes(data, b, row)))
    .sort(newestFirst);

// Spent in the budget's period: the rows statistics count, converted from the main currency to the
// budget's (as the first application does; FINANCIAL_RULES_AUDIT F-4 keeps this for parity).
export function budgetState(data: LedgerData, b: Budget, anchor: LocalDate): { b: Budget; used: Minor; left: Minor; share: number } {
  const used = reportRows(data, periodOperations(data, b, anchor))
    .filter((row) => budgetTakes(data, b, row))
    .reduce((sum, row) => sum + convert(row.reportAmount, data.settings.currency, b.currency, data.rates), 0);
  return { b, used, left: b.amount - used, share: b.amount ? (used / b.amount) * 100 : 0 };
}

export function saveBudget(tx: LedgerTx, draft: Omit<Budget, "id"> & { id: string | null }, env: Env): Budget {
  if (!String(draft.name ?? "").trim()) throw new DomainError("Enter a name");
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) throw new DomainError("Enter an amount greater than zero");
  if (draft.categories && draft.categories.length === 0) throw new DomainError("Select at least one category");
  if (draft.categories?.some((id) => !categoryById(tx.data, id))) throw new DomainError("Select at least one category");
  if (!((tx.data.rates[draft.currency] ?? 0) > 0)) throw new DomainError("Select a currency");
  const budget: Budget = { ...draft, name: draft.name.trim(), id: draft.id || env.newId() };
  tx.put("budgets", budget);
  return budget;
}

export function deleteBudget(tx: LedgerTx, id: string): void {
  tx.remove("budgets", id);
}
