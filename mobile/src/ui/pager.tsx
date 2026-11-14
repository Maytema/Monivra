// Pages side by side under the finger (js/app/swipe.js): the previous, the current and the next page are
// drawn beforehand, so whatever part of a neighbour a swipe uncovers is already there. A swipe past
// max(48, 27 % of the width) or a quick flick moves to the neighbour; at an end the page resists.
// What stays in place (the period bar, the tabs above the accounts) reads the offset from the context and
// moves its title or underline along with the finger.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, View, unstable_batchedUpdates } from "react-native";
import { gestureLock } from "./gesture-lock.ts";

// Where the pages are: `x` is the offset of the row of pages in px, and the page in the middle at rest is at
// x = -base × width. `base` counts the moves made (+1 to the next page, -1 to the previous one). Whatever moves
// with the pages (the period titles, the underline of the tabs) places itself by `base` in React and follows `x`
// on the native side: the offset after a move is −width × (number of the move), so nothing has to be put back.
export interface PagerMotion {
  x: Animated.Value;
  base: number;
  width: number;
}
const PagerContext = createContext<PagerMotion | null>(null);
export const usePagerMotion = (): PagerMotion | null => useContext(PagerContext);

const SETTLE_MS = 220;
// The pages sit on a long strip (SPAN widths on each side of the start) so that after a move only React props
// change, never the animated offset: before, the offset was put back to the middle after every move, and the
// native side could show that before the new pages were mounted — the previous period flashed for a frame.
const SPAN = 500;

// After a swipe moved the pages with the native driver, the layout the touch system measures for a row still
// holds the place the page ended at, not where it was put back: a press then looks "moved out of the row" at
// its first touch move and is cancelled (no long press). Rows inside a pager are pressed with this retention
// offset, so a long press survives; scrolling and swiping still take the touch away through the responders.
export const WIDE_RETENTION = { top: 4000, bottom: 4000, left: 4000, right: 4000 } as const;

export function Pager<K extends string>({
  prev,
  current,
  next,
  render,
  onMove,
  header,
}: {
  prev: K | null;
  current: K;
  next: K | null;
  render: (key: K, isCurrent: boolean) => ReactNode;
  onMove: (direction: 1 | -1) => void;
  header?: ReactNode;
}) {
  const [width, setWidth] = useState(Dimensions.get("window").width);
  const x = useRef(new Animated.Value(0)).current;
  // The number of moves made; the strip is started again (one jump, after ~SPAN moves) when it runs out.
  const [base, setBase] = useState(0);
  const busy = useRef(false);
  const lastMove = useRef(0);
  // The neighbours are drawn once the first page is on the screen and has settled, so opening the tab stays
  // quick and their mounting does not interleave with the first page's own steps.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 700);
    return () => clearTimeout(timer);
  }, []);
  // A new width (rotation, split screen) or a new start of the strip: the pages are put where they rest.
  useLayoutEffect(() => {
    x.setValue(-base * width);
    busy.current = false;
  }, [width, x]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (Math.abs(base) < SPAN - 2) return;
    setBase(0);
    x.setValue(0);
  }, [base, x]);
  const live = useRef({ prev, next, onMove, width, base });
  live.current = { prev, next, onMove, width, base };
  const pan = useRef(
    PanResponder.create({
      // A clearly horizontal drag is taken; a vertical one stays with the lists.
      onMoveShouldSetPanResponderCapture: (_e, g) => !busy.current && !gestureLock.held && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      // While the finger moves the pages, nothing takes the gesture away; a gesture that went quiet (its end
      // never arrived, as after some system gestures) gives way to the next touch instead of leaving the
      // page deaf to taps.
      onPanResponderTerminationRequest: () => Date.now() - lastMove.current > 300,
      onPanResponderGrant: () => {
        lastMove.current = Date.now();
      },
      onPanResponderMove: (_e, g) => {
        lastMove.current = Date.now();
        const { width: w, base: b } = live.current;
        const there = g.dx < 0 ? live.current.next : live.current.prev;
        x.setValue(-b * w + (there !== null ? g.dx : Math.sign(g.dx) * 28 * (1 - Math.exp(-Math.abs(g.dx) / 95))));
      },
      onPanResponderRelease: (_e, g) => {
        const direction: 1 | -1 = g.dx < 0 ? 1 : -1;
        const { width: w, base: b } = live.current;
        const there = direction === 1 ? live.current.next : live.current.prev;
        const far = Math.abs(g.dx) > Math.max(48, w * 0.27) || (Math.abs(g.dx) > 30 && Math.abs(g.vx) > 0.5);
        if (!far || there === null) {
          Animated.timing(x, { toValue: -b * w, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
          return;
        }
        busy.current = true;
        const left = w - Math.abs(g.dx);
        const duration = Math.max(90, Math.min(SETTLE_MS, Math.abs(g.vx) > 0.1 ? left / Math.abs(g.vx) : SETTLE_MS));
        Animated.timing(x, { toValue: -(b + direction) * w, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
          // One commit: the strip's count and the owner's page change together, so the page now in the middle
          // keeps its place and its content; the offset is already where it should be.
          unstable_batchedUpdates((d: 1 | -1) => {
            setBase(b + d);
            live.current.onMove(d);
          }, direction);
          busy.current = false;
          if (!finished) x.setValue(-(b + direction) * w);
        });
      },
      onPanResponderTerminate: () => {
        const { width: w, base: b } = live.current;
        Animated.timing(x, { toValue: -b * w, duration: 200, useNativeDriver: true }).start();
      },
    }),
  ).current;
  const page = (key: K | null, isCurrent: boolean, slot: -1 | 0 | 1) =>
    key === null ? null : (
      <View key={key} style={{ position: "absolute", top: 0, bottom: 0, left: (SPAN + base + slot) * width, width, overflow: "hidden" }}>
        {isCurrent || warm ? render(key, isCurrent) : null}
      </View>
    );
  return (
    <PagerContext.Provider value={{ x, base, width }}>
      <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width || width)} {...pan.panHandlers}>
        {header}
        <View style={{ flex: 1, overflow: "hidden" }}>
          <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: -SPAN * width, width: (2 * SPAN + 1) * width, transform: [{ translateX: x }] }}>
            {page(prev, false, -1)}
            {page(current, true, 0)}
            {page(next, false, 1)}
          </Animated.View>
        </View>
      </View>
    </PagerContext.Provider>
  );
}
