// Pages side by side under the finger, on the platform's own pager (react-native-pager-view: ViewPager2 on Android). The
// native pager decides between a horizontal swipe and a vertical scroll of the page inside it, follows the finger,
// settles with its own physics and takes quick repeated swipes — what the hand-made one (pan-pager.tsx) could not do
// without fighting the scroll views. The period is endless, the native pager is not: it always holds three pages
// (the previous, the current, the next), and when a swipe has settled on a neighbour the contents of the three slots
// are moved by one and the pager is put back to the middle without animation (the middle then shows the very same
// content, so nothing is seen). `x` keeps the meaning it had in the hand-made pager (the offset of the pages in px,
// the page in the middle at rest at x = −base × width), so the period bar and the tabs follow the finger as before.
import { countRender } from "../platform/perf.ts";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, View, unstable_batchedUpdates } from "react-native";
import PagerView from "react-native-pager-view";
import { PagerContext } from "./pan-pager.tsx";

export { usePagerMotion, WIDE_RETENTION } from "./pan-pager.tsx";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

type Controls = { setPage(index: number): void; setPageWithoutAnimation(index: number): void };

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
  countRender("pager");
  const [width, setWidth] = useState(Dimensions.get("window").width);
  const [base, setBase] = useState(0);
  const pager = useRef<Controls | null>(null);
  // position + offset of the native pager, and the two constants that turn them into x.
  const position = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(-width)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const x = useRef(Animated.add(Animated.multiply(Animated.add(position, offset), scale), shift)).current;
  useLayoutEffect(() => {
    scale.setValue(-width);
    shift.setValue(-base * width + width);
  }, [width, base, scale, shift]);
  // The neighbours are drawn once the first page is on the screen and has settled.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 700);
    return () => clearTimeout(timer);
  }, []);
  const live = useRef({ prev, next, onMove, base });
  live.current = { prev, next, onMove, base };
  // The page the native pager selected (0, 1 or 2); it is taken over when the pager is quiet again.
  const selected = useRef(1);
  const onScroll = Animated.event([{ nativeEvent: { position, offset } }], { useNativeDriver: true });
  const settle = () => {
    const at = selected.current;
    if (at === 1) return;
    const { prev: before, next: after, base: made } = live.current;
    const target = at === 2 ? after : before;
    if (target === null) {
      // An end of the period (nothing there): back to the middle.
      selected.current = 1;
      pager.current?.setPage(1);
      return;
    }
    const direction: 1 | -1 = at === 2 ? 1 : -1;
    selected.current = 1;
    // The slots take the new contents first (the pager still shows the page that was selected, which is now the
    // one in the middle), then the pager goes to the middle without animation.
    unstable_batchedUpdates((d: 1 | -1) => {
      setBase(made + d);
      live.current.onMove(d);
    }, direction);
    pager.current?.setPageWithoutAnimation(1);
  };
  const slot = (key: K | null, isCurrent: boolean, index: number) => (
    <View key={"slot" + index} collapsable={false} style={{ flex: 1 }}>
      {key !== null && (isCurrent || warm) ? render(key, isCurrent) : null}
    </View>
  );
  return (
    <PagerContext.Provider value={{ x, base, width }}>
      <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width || width)}>
        {header}
        <AnimatedPagerView
          ref={(node: unknown) => {
            pager.current = node as Controls | null;
          }}
          style={{ flex: 1 }}
          initialPage={1}
          offscreenPageLimit={2}
          overScrollMode="never"
          onPageScroll={onScroll}
          onPageSelected={(e: { nativeEvent: { position: number } }) => {
            selected.current = e.nativeEvent.position;
          }}
          onPageScrollStateChanged={(e: { nativeEvent: { pageScrollState: string } }) => {
            if (e.nativeEvent.pageScrollState === "idle") settle();
          }}
        >
          {slot(prev, false, 0)}
          {slot(current, true, 1)}
          {slot(next, false, 2)}
        </AnimatedPagerView>
      </View>
    </PagerContext.Provider>
  );
}
