// The empty-state pictures (ui/empty-state.tsx). Four kinds (operations, accounts, categories, statistics) are tab screens that
// a person returns to all the time: they play on their first visit in a launch and replay at every visit until the person
// does something (changes the period or a filter, adds, edits or deletes anything); after that, screens already seen show the
// rest frame and screens not yet seen still play once. A new launch starts again. The two other kinds (budgets, scheduled
// payments) are screens a person opens on purpose, and play at every visit whatever was done before. Programmatic changes
// (a page putting its own period in place) do not count as the person acting.
let quiet = false;
const played = new Set<string>();
const QUIET_KINDS: ReadonlySet<string> = new Set(["operations", "accounts", "categories", "statistics"]);
const actedListeners = new Set<() => void>();
// The pictures that are not on the screen change to their rest frame when the person acts (they would otherwise show their
// first frame for a moment at the next visit).
export const onActed = (fn: () => void): (() => void) => {
  actedListeners.add(fn);
  return () => void actedListeners.delete(fn);
};
export const markActed = (): void => {
  quiet = true;
  for (const fn of [...actedListeners]) fn();
};
export const isQuiet = (): boolean => quiet;
// Whether the picture of `kind` should play at this visit.
export const shouldPlay = (kind: string): boolean => !QUIET_KINDS.has(kind) || !quiet || !played.has(kind);
// Whether the picture of `kind` has been played (started) before in this launch.
export const hasPlayed = (kind: string): boolean => played.has(kind);
export const markPlayed = (kind: string): void => {
  played.add(kind);
};
