// What is on the screen and is not part of the ledger: the chosen period and the category tab type.
// It lives while the application runs; a new start shows the current month (as before).
import { useSyncExternalStore } from "react";
import { systemClock } from "../domain/dates.ts";
import { emptyFilters, type Filters, type Period } from "../domain/periods.ts";
import { markActed } from "../ui/quiet.ts";

interface ViewState {
  period: Period;
  catType: "expense" | "income";
  // Shared by the operations and the statistics, as in the first application.
  filters: Filters;
}

let state: ViewState = { period: { mode: "month", anchor: systemClock.today() }, catType: "expense", filters: emptyFilters() };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// A part given again with the same contents keeps the old object: nobody subscribed to it draws again, and a change
// that changes nothing (the budgets setting the month that is already shown) wakes nobody at all.
const samePeriod = (a: Period, b: Period) => a.mode === b.mode && a.anchor === b.anchor && a.from === b.from && a.to === b.to;
const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);
// `byPerson` is false for a page that puts its own view in place (and takes it back): that is not the person doing
// something, so the empty-state pictures keep playing (ui/quiet.ts).
export function setView(change: Partial<ViewState>, byPerson = true): void {
  const next: ViewState = { ...state };
  let changed = false;
  if (change.period && !samePeriod(change.period, state.period)) (next.period = change.period), (changed = true);
  if (change.catType && change.catType !== state.catType) (next.catType = change.catType), (changed = true);
  if (change.filters && !sameFilters(change.filters, state.filters)) (next.filters = change.filters), (changed = true);
  if (!changed) return;
  state = next;
  if (byPerson) markActed();
  for (const fn of listeners) fn();
}

export const getView = (): ViewState => state;

export const useView = (): ViewState => useSyncExternalStore(subscribe, () => state);
// One part each: a screen that shows the period does not draw again when the expense/income tab changes, and so on.
export const useViewPeriod = (): Period => useSyncExternalStore(subscribe, () => state.period);
export const useViewCatType = (): ViewState["catType"] => useSyncExternalStore(subscribe, () => state.catType);
export const useViewPeriodWhile = (on: boolean): Period | null => useSyncExternalStore(subscribe, () => (on ? state.period : null));
export const useViewFilters = (): Filters => useSyncExternalStore(subscribe, () => state.filters);
