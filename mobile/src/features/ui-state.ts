// What is on the screen and is not part of the ledger: the chosen period and the category tab type.
// It lives while the application runs; a new start shows the current month (as before).
import { useSyncExternalStore } from "react";
import { systemClock } from "../domain/dates.ts";
import { emptyFilters, type Filters, type Period } from "../domain/periods.ts";

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

export function setView(change: Partial<ViewState>): void {
  state = { ...state, ...change };
  for (const fn of listeners) fn();
}

export const getView = (): ViewState => state;

export const useView = (): ViewState => useSyncExternalStore(subscribe, () => state);
