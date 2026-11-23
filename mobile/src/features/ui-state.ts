// What is on the screen and is not part of the ledger: the chosen period and the category tab type (view-core.ts holds the
// state; these are the hooks that read it).
import { useSyncExternalStore } from "react";
import type { Filters, Period } from "../domain/periods.ts";
import { getView, subscribe, type ViewState } from "./view-core.ts";

export { getView, setView } from "./view-core.ts";

const state = () => getView();
// One part each: a screen that shows the period does not draw again when the expense/income tab changes, and so on.
export const useViewPeriod = (): Period => useSyncExternalStore(subscribe, () => state().period);
export const useViewCatType = (): ViewState["catType"] => useSyncExternalStore(subscribe, () => state().catType);
export const useViewPeriodWhile = (on: boolean): Period | null => useSyncExternalStore(subscribe, () => (on ? state().period : null));
export const useViewFilters = (): Filters => useSyncExternalStore(subscribe, () => state().filters);
