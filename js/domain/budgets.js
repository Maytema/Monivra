/* Budgets: what is spent of a budget in its period, and where that stands against the limit */
import { TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { budgetTakes, convertCurrency, periodBounds, reportRows } from "./finance.js";

// Where a budget stands: nothing spent, spent within the limit, or over it.
export const BUDGET_STATUSES = ["unused", "used", "exceeded"];
// Their names, as the filters and the lists show them.
export const BUDGET_STATUS_NAMES = {
  unused: "Not used",
  used: "Within the limit",
  exceeded: "Limit exceeded",
};

// Amount spent in a budget's period, the period being the one around the day shown by the period
// bar. The rows are the ones the statistics count: fees taken into account, debt payments included
// when they count as expenses (only a budget for all expenses takes those).
export function budgetSpend(b) {
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

// A budget with what is spent of it, what is left, the share spent and its status.
export function budgetState(b) {
  const used = budgetSpend(b),
    left = b.amount - used;
  return {
    b,
    used,
    left,
    share: b.amount ? (used / b.amount) * 100 : 0,
    status: used <= 0 ? "unused" : left < 0 ? "exceeded" : "used",
  };
}
