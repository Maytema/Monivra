// What the pager tells what moves with its pages (the period bar's title, the underline of the tabs): the offset of the pages
// and the retention offset rows use inside a pager. (The hand-made pager that used to live next to these is gone: the screens use
// native-pager.tsx, the platform's own.)
import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

// Where the pages are: `x` is the offset of the row of pages in px, and the page in the middle at rest is at
// x = -base × width. `base` counts the moves made (+1 to the next page, -1 to the previous one). Whatever moves
// with the pages (the period titles, the underline of the tabs) places itself by `base` in React and follows `x`
// on the native side: the offset after a move is −width × (number of the move), so nothing has to be put back.
export interface PagerMotion {
  x: SharedValue<number>;
  base: number;
  width: number;
}
export const PagerContext = createContext<PagerMotion | null>(null);
export const usePagerMotion = (): PagerMotion | null => useContext(PagerContext);

// After a swipe moved the pages with the native driver, the layout the touch system measures for a row still
// holds the place the page ended at, not where it was put back: a press then looks "moved out of the row" at
// its first touch move and is cancelled (no long press). Rows inside a pager are pressed with this retention
// offset, so a long press survives; scrolling and swiping still take the touch away through the responders.
export const WIDE_RETENTION = { top: 4000, bottom: 4000, left: 4000, right: 4000 } as const;
