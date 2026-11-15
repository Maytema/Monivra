// Pages side by side under the finger, on the platform's own pager (react-native-pager-view: ViewPager2 on Android).
// The finger, the settling and the choice between a sideways swipe and the scroll of the list inside a page are all
// done on the native side, so a swipe follows the finger also while the JavaScript thread is busy, and quick swipes
// one after another (or back and forth) are taken as they come.
//
// The pages are laid out once as one long row: up to SPAN pages on each side of the current one (the period is
// endless; the row is laid out again around the current page when a swipe comes near its end, which takes SPAN
// swipes). Only the current page and its two neighbours draw their contents; a page keeps its place (its key) in
// the row, so a swipe does not build the pages again — it only draws the one new neighbour.
//
// `x` keeps the meaning the period bar and the tabs read (pan-pager.tsx): the offset of the pages in px, the page in
// the middle at rest at x = −base × width, where base counts the moves since the row was laid out.
import { countRender } from "../platform/perf.ts";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, View, unstable_batchedUpdates } from "react-native";
import PagerView from "react-native-pager-view";
import { PagerContext } from "./pan-pager.tsx";

export { usePagerMotion, WIDE_RETENTION } from "./pan-pager.tsx";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);
const SPAN = 50;
// A row laid out again this close to its end (so a quick run of swipes never reaches the end).
const MARGIN = 4;

type Controls = { setPage(index: number): void; setPageWithoutAnimation(index: number): void };

interface Row<K> {
  id: number;
  keys: K[];
  // Where the page shown when the row was laid out is (base 0).
  origin: number;
  // The keys at the ends are the real ends (nothing before or after), not the limit of the row.
  closedStart: boolean;
  closedEnd: boolean;
}

let rows = 0;
function layRow<K>(current: K, step: (key: K, n: 1 | -1) => K | null): Row<K> {
  const before: K[] = [];
  let k: K | null = current;
  while (before.length < SPAN && (k = step(k as K, -1)) !== null) before.unshift(k);
  const closedStart = before.length < SPAN;
  const after: K[] = [];
  k = current;
  while (after.length < SPAN && (k = step(k as K, 1)) !== null) after.push(k);
  return { id: ++rows, keys: [...before, current, ...after], origin: before.length, closedStart, closedEnd: after.length < SPAN };
}

const Slot = memo(function Slot({ children }: { children: ReactNode }) {
  return (
    <View collapsable={false} style={{ flex: 1 }}>
      {children}
    </View>
  );
});

export function Pager<K extends string>({
  current,
  step,
  render,
  onMove,
  header,
}: {
  current: K;
  // The page next to a page (n = 1 after, −1 before), or null at an end.
  step: (key: K, n: 1 | -1) => K | null;
  render: (key: K, isCurrent: boolean) => ReactNode;
  // The person moved by `steps` pages (several when quick swipes followed each other).
  onMove: (steps: number) => void;
  header?: ReactNode;
}) {
  countRender("pager");
  const [width, setWidth] = useState(Dimensions.get("window").width);
  const live = useRef({ step, onMove });
  live.current = { step, onMove };
  const [row, setRow] = useState<Row<K>>(() => layRow(current, step));
  const [index, setIndex] = useState(row.origin);
  const at = useRef(index);
  at.current = index;
  const pager = useRef<Controls | null>(null);

  // The current page changed from outside (the arrows of the period bar, a tab pressed, another period chosen): a
  // neighbour is reached by a swipe of the pager, anything else lays the row out again around it.
  useEffect(() => {
    if (row.keys[index] === current) return;
    const near = [index - 1, index + 1].find((i) => row.keys[i] === current);
    if (near !== undefined) {
      setIndex(near);
      pager.current?.setPage(near);
      return;
    }
    const found = row.keys.indexOf(current);
    if (found >= 0) {
      setIndex(found);
      pager.current?.setPageWithoutAnimation(found);
      return;
    }
    const fresh = layRow(current, live.current.step);
    setRow(fresh);
    setIndex(fresh.origin);
  }, [current, row, index]);

  // position + offset of the native pager, and the two constants that turn them into x.
  const position = useRef(new Animated.Value(index)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(-width)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const x = useRef(Animated.add(Animated.multiply(Animated.add(position, offset), scale), shift)).current;
  useLayoutEffect(() => {
    scale.setValue(-width);
    shift.setValue(row.origin * width);
  }, [width, row, scale, shift]);
  // A row laid out again starts at rest on its page (the pager sends no offset before the next swipe).
  useLayoutEffect(() => {
    position.setValue(at.current);
    offset.setValue(0);
  }, [row, position, offset]);
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { position, offset } }], { useNativeDriver: true }), [position, offset]);

  // The neighbours draw once the first page is on the screen and has settled.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const selected = (page: number) => {
    const from = at.current;
    if (page === from) return;
    at.current = page;
    unstable_batchedUpdates(() => {
      setIndex(page);
      live.current.onMove(page - from);
    }, undefined);
  };
  // Near the end of the row (not a real end), the row is laid out again around the current page once the pager is
  // quiet; the pages are drawn again once, which happens after SPAN − MARGIN swipes in one direction.
  const quiet = () => {
    const i = at.current;
    const nearStart = !row.closedStart && i < MARGIN;
    const nearEnd = !row.closedEnd && i > row.keys.length - 1 - MARGIN;
    if (!nearStart && !nearEnd) return;
    const fresh = layRow(row.keys[i] as K, live.current.step);
    setRow(fresh);
    setIndex(fresh.origin);
  };

  const reach = warm ? 1 : 0;
  return (
    <PagerContext.Provider value={{ x, base: index - row.origin, width }}>
      <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width || width)}>
        {header}
        <AnimatedPagerView
          key={row.id}
          ref={(node: unknown) => {
            pager.current = node as Controls | null;
          }}
          style={{ flex: 1 }}
          initialPage={index}
          offscreenPageLimit={1}
          overScrollMode="never"
          scrollEnabled={row.keys.length > 1}
          onPageScroll={onScroll}
          onPageSelected={(e: { nativeEvent: { position: number } }) => selected(e.nativeEvent.position)}
          onPageScrollStateChanged={(e: { nativeEvent: { pageScrollState: string } }) => {
            if (e.nativeEvent.pageScrollState === "idle") quiet();
          }}
        >
          {row.keys.map((key, i) => (
            <Slot key={key}>{Math.abs(i - index) <= reach ? render(key, i === index) : null}</Slot>
          ))}
        </AnimatedPagerView>
      </View>
    </PagerContext.Provider>
  );
}
