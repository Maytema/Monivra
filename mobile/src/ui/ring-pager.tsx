// Pages side by side for a period, as pages that are made once and told a new period (plan step 8, behind the PerfSwitch setting "ring pager"):
// a horizontal list of the periods with one page to a screen. The list reuses the page that left the window for the page that comes into it —
// the same component, new `period` — so a swipe mounts no page and no list of rows (the cost the native pager pays at every swipe:
// speed check builds 166–174, a page mounted per swipe, ~180 ms of the JavaScript thread, the same on 3000 and 10000 operations).
// The interface is that of Pager (native-pager.tsx): `current`, `step`, `render`, `onMove`, `header`, and the motion the period bar reads.
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, View, unstable_batchedUpdates } from "react-native";
import { useNavigation } from "expo-router";
import { countRender, now, perfLog, perfNote, PERF_BUILD } from "../platform/perf.ts";
import { pagerState } from "./gesture-lock.ts";
import { MaskScope } from "./mask-scope.tsx";
import { PagerContext } from "./pager-motion.ts";

const SPAN = 50;
const MARGIN = 4;

interface Row<K> {
  id: number;
  keys: K[];
  origin: number;
  closedStart: boolean;
  closedEnd: boolean;
}
let rows = 0;
function layRow<K>(current: K, step: (key: K, n: 1 | -1) => K | null): Row<K> {
  const before: K[] = [];
  let k: K | null = current;
  while (before.length < SPAN && (k = step(k as K, -1)) !== null) before.unshift(k);
  const after: K[] = [];
  k = current;
  while (after.length < SPAN && (k = step(k as K, 1)) !== null) after.push(k);
  return { id: ++rows, keys: [...before, current, ...after], origin: before.length, closedStart: before.length < SPAN, closedEnd: after.length < SPAN };
}

export function RingPager<K extends string>({
  current,
  step,
  render,
  onMove,
  header,
  instant = false,
}: {
  current: K;
  instant?: boolean;
  step: (key: K, n: 1 | -1) => K | null;
  render: (key: K, isCurrent: boolean) => ReactNode;
  onMove: (steps: number) => void;
  header?: ReactNode;
}) {
  countRender("ring pager");
  const [size, setSize] = useState({ width: Dimensions.get("window").width, height: 0 });
  const width = size.width;
  const live = useRef({ step, onMove });
  live.current = { step, onMove };
  const [row, setRow] = useState<Row<K>>(() => layRow(current, step));
  const [index, setIndex] = useState(row.origin);
  const at = useRef(index);
  const passed = useRef(new Set<string>());
  const list = useRef<FlashListRef<K>>(null);
  const touched = useRef(false);

  let navigation: { isFocused(): boolean } | null = null;
  try {
    navigation = useNavigation();
  } catch {
    navigation = null;
  }
  const focused = () => {
    try {
      return navigation ? navigation.isFocused() : true;
    } catch {
      return true;
    }
  };

  // The current page changed from outside (the arrows of the period bar, another period chosen): a neighbour is reached by sliding,
  // anything else lays the row out again around it. (The same rules as Pager.)
  useEffect(() => {
    if (row.keys[at.current] === current) {
      passed.current.clear();
      if (index !== at.current) setIndex(at.current);
      return;
    }
    if (passed.current.has(current)) return;
    const here = at.current;
    const near = instant ? undefined : [here - 1, here + 1].find((i) => row.keys[i] === current);
    if (near !== undefined) {
      at.current = near;
      setIndex(near);
      list.current?.scrollToIndex({ index: near, animated: true });
      return;
    }
    const found = row.keys.indexOf(current);
    if (found >= 0) {
      perfNote(`ring pager: jumped to page ${found}`);
      at.current = found;
      setIndex(found);
      list.current?.scrollToIndex({ index: found, animated: false });
      return;
    }
    perfNote(`ring pager: laid out again around ${current}`);
    const fresh = layRow(current, live.current.step);
    setRow(fresh);
    at.current = fresh.origin;
    setIndex(fresh.origin);
  }, [current, row, index, instant]);

  // The offset of the pages in px, as the period bar and the tabs read it from the native pager: page `index` at rest is at -(index - origin) × width.
  const scrollX = useRef(new Animated.Value(row.origin * width)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const x = useMemo(() => Animated.add(Animated.multiply(scrollX, -1), shift), [scrollX, shift]);
  useLayoutEffect(() => {
    shift.setValue(row.origin * width);
  }, [width, row, shift]);
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false }), [scrollX]);

  const chosenAt = useRef(0);
  useLayoutEffect(() => {
    if (!PERF_BUILD || !chosenAt.current) return;
    const since = chosenAt.current;
    chosenAt.current = 0;
    perfLog("swipe: pages built", now() - since);
    requestAnimationFrame(() => perfLog("swipe: next frame", now() - since));
  }, [index]);

  const settle = (offset: number) => {
    touched.current = false;
    pagerState("idle");
    if (!width || !focused()) return;
    const page = Math.max(0, Math.min(row.keys.length - 1, Math.round(offset / width)));
    const from = at.current;
    if (page !== from) {
      if (PERF_BUILD) chosenAt.current = now();
      at.current = page;
      passed.current.add(String(row.keys[page]));
      unstable_batchedUpdates(() => {
        setIndex(page);
        live.current.onMove(page - from);
      }, undefined);
    }
    // Near the end of the row (not a real end) the row is laid out again around the current page.
    const i = at.current;
    const nearStart = !row.closedStart && i < MARGIN;
    const nearEnd = !row.closedEnd && i > row.keys.length - 1 - MARGIN;
    if (nearStart || nearEnd) {
      const fresh = layRow(row.keys[i] as K, live.current.step);
      setRow(fresh);
      at.current = fresh.origin;
      setIndex(fresh.origin);
    }
  };

  const renderItem = useMemo(
    () =>
      ({ item, index: i }: { item: K; index: number }) => (
        <View collapsable={false} style={{ width, height: size.height }}>
          <MaskScope active={i === index}>{render(item, i === index)}</MaskScope>
        </View>
      ),
    // `render` is a new function at every draw of the screen; the page it makes is what changes, so it is read at the time of drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, size.height, index, render],
  );

  return (
    <PagerContext.Provider value={{ x, base: index - row.origin, width }}>
      <View
        style={{ flex: 1 }}
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => {
          const w = e.nativeEvent.layout.width;
          if (w) setSize((s) => (s.width === w ? s : { ...s, width: w }));
        }}
      >
        {header}
        <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { height: number } } }) => e.nativeEvent.layout.height && setSize((s) => (s.height === e.nativeEvent.layout.height ? s : { ...s, height: e.nativeEvent.layout.height }))}>
          {size.height > 0 ? (
            <FlashList
              key={row.id}
              ref={list}
              horizontal
              pagingEnabled
              data={row.keys}
              extraData={index}
              keyExtractor={(k) => k}
              renderItem={renderItem}
              initialScrollIndex={index}
              drawDistance={width * 2}
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollBeginDrag={() => {
                touched.current = true;
                pagerState("dragging");
              }}
              onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { x: number } } }) => settle(e.nativeEvent.contentOffset.x)}
            />
          ) : null}
        </View>
      </View>
    </PagerContext.Provider>
  );
}
