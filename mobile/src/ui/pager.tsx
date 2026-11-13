// Pages side by side under the finger (js/app/swipe.js): the previous, the current and the next page are
// drawn beforehand, so whatever part of a neighbour a swipe uncovers is already there. A swipe past
// max(48, 27 % of the width) or a quick flick moves to the neighbour; at an end the page resists.
// What stays in place (the period bar) reads the offset from the context to move its title along.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, View } from "react-native";
import { gestureLock } from "./gesture-lock.ts";

export interface PagerMotion {
  // Horizontal offset of the pages in px: negative while the next page comes in.
  x: Animated.Value;
  width: number;
}
const PagerContext = createContext<PagerMotion | null>(null);
export const usePagerMotion = (): PagerMotion | null => useContext(PagerContext);

const SETTLE_MS = 220;

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
  const busy = useRef(false);
  const lastMove = useRef(0);
  const moved = useRef(false);
  // The neighbours are drawn once the first page is on the screen, so opening the tab stays quick.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 250);
    return () => clearTimeout(timer);
  }, []);
  // After a move the neighbour has become the current page: the row is put back in the middle before
  // the screen is drawn again, so nothing jumps.
  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    x.setValue(0);
    busy.current = false;
  }, [current, x]);
  const live = useRef({ prev, next, onMove, width });
  live.current = { prev, next, onMove, width };
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
        const there = g.dx < 0 ? live.current.next : live.current.prev;
        x.setValue(there !== null ? g.dx : Math.sign(g.dx) * 28 * (1 - Math.exp(-Math.abs(g.dx) / 95)));
      },
      onPanResponderRelease: (_e, g) => {
        const direction: 1 | -1 = g.dx < 0 ? 1 : -1;
        const there = direction === 1 ? live.current.next : live.current.prev;
        const w = live.current.width;
        const far = Math.abs(g.dx) > Math.max(48, w * 0.27) || (Math.abs(g.dx) > 30 && Math.abs(g.vx) > 0.5);
        if (!far || there === null) {
          Animated.timing(x, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
          return;
        }
        busy.current = true;
        const left = w - Math.abs(g.dx);
        const duration = Math.max(90, Math.min(SETTLE_MS, Math.abs(g.vx) > 0.1 ? left / Math.abs(g.vx) : SETTLE_MS));
        Animated.timing(x, { toValue: -direction * w, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          moved.current = true;
          live.current.onMove(direction);
        });
      },
      onPanResponderTerminate: () => {
        Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      },
    }),
  ).current;
  const page = (key: K | null, isCurrent: boolean, slot: string) => (
    <View key={key ?? slot} style={{ width, height: "100%", overflow: "hidden" }}>
      {key !== null && (isCurrent || warm) ? render(key, isCurrent) : null}
    </View>
  );
  return (
    <PagerContext.Provider value={{ x, width }}>
      <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width || width)} {...pan.panHandlers}>
        {header}
        <View style={{ flex: 1, overflow: "hidden" }}>
          <Animated.View style={{ flexDirection: "row", width: width * 3, height: "100%", transform: [{ translateX: Animated.add(x, -width) }] }}>
            {page(prev, false, "no-previous")}
            {page(current, true, "current")}
            {page(next, false, "no-next")}
          </Animated.View>
        </View>
      </View>
    </PagerContext.Provider>
  );
}
