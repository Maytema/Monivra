/* Leading the person to operations: the list as it shows them, and whether it already does */
import { render } from "../../app/shell.js";
import { appData, emptyFilters, uiState } from "../../core/state.js";
import { operationMatchesFilters, periodAround, periodBounds } from "../../domain/finance.js";
import { goHome } from "../../ui/navigation.js";
import { spotlight } from "../../ui/spotlight.js";

// Is the operation in the list that is on the screen right now?
export function operationShown(o) {
  const top = uiState.pages.at(-1);
  const onList = top ? top.kind === "filtered" : uiState.tab === "operations";
  const [from, to] = periodBounds();
  return onList && o.date >= from && o.date <= to && operationMatchesFilters(o);
}

// The operations list as it shows the given operations: a period and filters that include them,
// scrolled to them and highlighted once.
export function showOperations(ids) {
  goHome("operations");
  const shown = appData.ops.filter((o) => ids.includes(o.id));
  if (!shown.length) return;
  uiState.period = periodAround(shown.map((o) => o.date));
  if (!shown.every((o) => operationMatchesFilters(o))) uiState.filters = emptyFilters();
  render();
  spotlight(ids);
}
