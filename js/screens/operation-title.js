/* Display title of an operation */
import { categoryById } from "../domain/finance.js";
import { translate } from "../i18n/index.js";

// Name of a category as an operation shows it: a subcategory follows its category.
function categoryTitle(id) {
  const category = categoryById(id);
  if (!category) return translate("Category");
  return category.parent
    ? `${categoryById(category.parent)?.name} (${category.name})`
    : category.name;
}

// Display title of an operation.
export function operationTitle(operation) {
  if (operation.type === "adjustment") return "Adjustment";
  if (operation.type === "transfer") return translate("Transfer");
  return categoryTitle(operation.category);
}
