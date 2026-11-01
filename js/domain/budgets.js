/* Budgets: what is spent of a budget in its period */
import { TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { categoryById, convertCurrency, periodBounds, reportRows } from "./finance.js";

// Does a budget count a row of the report? A budget takes expenses of its categories (and their
// subcategories), or all expenses when it has no categories.
const budgetTakes = (b, row) =>
  row.reportType === "expense" &&
  (!b.categories ||
    b.categories.includes(row.category) ||
    b.categories.includes(categoryById(row.category)?.parent));

// Amount spent in a budget's period, the period being the one around the day shown by the period
// bar. The rows are the ones the statistics count: fees taken into account, debt payments included
// when they count as expenses (only a budget for all expenses takes those).
function budgetSpend(b) {
  const [from, to] = periodBounds({
    mode: b.period || "month",
    anchor: uiState.period.anchor || TODAY,
  });
  return reportRows(appData.ops.filter((o) => o.date >= from && o.date <= to))
    .filter((row) => budgetTakes(b, row))
    .reduce(
      (sum, row) => sum + convertCurrency(row.reportAmount, appData.settings.currency, b.currency),
      0,
    );
}

// A budget with what is spent of it, what is left and the share spent.
export function budgetState(b) {
  const used = budgetSpend(b);
  return { b, used, left: b.amount - used, share: b.amount ? (used / b.amount) * 100 : 0 };
}
