// Where an operation just saved is to be seen (js/screens/operations/reveal.js): whether the list on the
// screen shows it, and the way to the list or to the scheduled payments with the row lit once.
import { router } from "expo-router";
import { periodAround, operationMatchesFilters, periodBounds, emptyFilters } from "../domain/periods.ts";
import type { Operation } from "../domain/types.ts";
import { appStore } from "../ui/app-context.tsx";
import { spotlight } from "../ui/spotlight.tsx";
import { getView, setView } from "./ui-state.ts";

// The lists of operations that are on the screen now report here (a screen of the stack that is covered
// does not count).
let listing = 0;
export const listingOnTop = (on: boolean): void => void (listing = Math.max(0, listing + (on ? 1 : -1)));

const ledger = () => {
  const state = appStore().getState();
  if (state.status !== "ready") throw new Error("the ledger is not open");
  return state.data;
};

// Does the list on the screen show this operation, with its period and filters?
export function operationShown(o: Operation): boolean {
  const data = ledger();
  const { period, filters } = getView();
  const [from, to] = periodBounds(period, data.settings);
  return listing > 0 && o.date >= from && o.date <= to && operationMatchesFilters(data, o, filters);
}

// The operations list as it shows the given operations: a period and filters that include them, and the rows
// lit once.
export function showOperations(ids: readonly string[]): void {
  const data = ledger();
  const shown = data.ops.filter((o) => ids.includes(o.id));
  router.navigate("/operations");
  if (!shown.length) return;
  const view = getView();
  const change: Parameters<typeof setView>[0] = { period: periodAround(shown.map((o) => o.date), view.period, data.settings) };
  if (!shown.every((o) => operationMatchesFilters(data, o, view.filters))) change.filters = emptyFilters();
  setView(change);
  spotlight(ids);
}

// The scheduled payments with one of them lit.
export function showScheduled(id: string): void {
  router.push("/scheduled");
  spotlight([id]);
}
