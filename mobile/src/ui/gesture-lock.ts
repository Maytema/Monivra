import { useSyncExternalStore } from "react";
// While an item is lifted for reordering, sideways swipes of the screen must not take the touch.
let held = false;
export const gestureLock = {
  get held(): boolean {
    return held;
  },
  set(value: boolean): void {
    held = value;
  },
};

// While a page is being swiped sideways, the lists inside it do not scroll: the list had started to move at the first
// few pixels of a slightly slanted swipe and then jerked up and down under it, and the swipe was lost.
let swiping = false;
const listeners = new Set<() => void>();
export const swipeLock = {
  set(value: boolean): void {
    if (swiping === value) return;
    swiping = value;
    for (const l of listeners) l();
  },
};
export const useVerticalScroll = (): boolean =>
  !useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => swiping,
  );

// Whether a native pager is being swiped or is settling, and until when a press is still taken for the end of a swipe:
// a press that ends then is not a tap (ui/pressable.tsx). A plain value, so nothing draws when it changes.
// (A pager that went away mid-swipe never says "idle": a "moving" older than a second and a half is not believed.)
export const pagerMotion = { moving: false, since: 0, until: 0 };
export const pagerBusy = (): boolean => (pagerMotion.moving && Date.now() - pagerMotion.since < 1500) || Date.now() < pagerMotion.until;
