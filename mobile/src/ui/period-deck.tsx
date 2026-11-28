// The pages of a period (or of a tab) side by side under the finger: one horizontal scroll view with one stop to a swipe, and FIVE pages that
// are made once and live as long as the screen does — the current page, two on each side. A swipe builds nothing: the page that is
// left behind (two before the current one) is put two after the new one and told its period, the others keep their properties.
// A slot never takes the name of a period as its key (a key made from the period was a page built at every swipe: a new list, its rows).
//
// The finger and the settling are the platform's scroll view; the offset goes to a shared value on the UI thread (`x`, read by the period
// bar and the tabs). JavaScript hears of the end of a swipe only (`settle`).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dimensions, View, unstable_batchedUpdates } from "react-native";
import Reanimated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useNavigation } from "expo-router";
import { pagerState } from "./swipe-busy.ts";
import { MaskScope } from "./mask-scope.tsx";
import { PagerContext } from "./pager-motion.ts";

const SPAN = 50;
// A row laid out again this close to its end (so a quick run of swipes never reaches the end).
const MARGIN = 4;
// Pages drawn: the current one and this many on each side.
const AROUND = 2;
const SLOTS = AROUND * 2 + 1;

interface Row<K> {
  keys: K[];
  // Where the page shown when the row was laid out is (base 0).
  origin: number;
  // The keys at the ends are the real ends (nothing before or after), not the limit of the row.
  closedStart: boolean;
  closedEnd: boolean;
}

// The pages are laid out as one long row: up to SPAN pages on each side of the current one (the period is endless; the row is laid out
// again around the current page when a swipe comes near its end, which takes SPAN swipes).
function layRow<K>(current: K, step: (key: K, n: 1 | -1) => K | null): Row<K> {
  const before: K[] = [];
  let k: K | null = current;
  while (before.length < SPAN && (k = step(k as K, -1)) !== null) before.unshift(k);
  const after: K[] = [];
  k = current;
  while (after.length < SPAN && (k = step(k as K, 1)) !== null) after.push(k);
  return { keys: [...before, current, ...after], origin: before.length, closedStart: before.length < SPAN, closedEnd: after.length < SPAN };
}

interface Scroller {
  scrollTo(options: { x: number; y?: number; animated?: boolean }): void;
}

// One of the five places. `page` is the page (its number in the row) that stands here now; the place is the page's number times the width.
const Slot = memo(function Slot({ id, page, width, height, current, render }: { id: string | undefined; page: number; width: number; height: number; current: boolean; render: (key: string) => ReactNode }) {
  return (
    <View collapsable={false} style={{ position: "absolute", top: 0, left: page * width, width, height }}>
      {id === undefined ? null : <MaskScope active={current}>{render(id)}</MaskScope>}
    </View>
  );
});

export function PeriodDeck<K extends string>({
  current,
  step,
  render,
  onMove,
  header,
  instant = false,
}: {
  current: K;
  // The current page changed while the screen was hidden: go there at once, without sliding.
  instant?: boolean;
  // The page next to a page (n = 1 after, −1 before), or null at an end.
  step: (key: K, n: 1 | -1) => K | null;
  render: (key: K) => ReactNode;
  // The person moved by `steps` pages (several when swipes followed each other quickly).
  onMove: (steps: number) => void;
  header?: ReactNode;
}) {
  const [width, setWidth] = useState(Dimensions.get("window").width);
  // The height of the room under the header (the pages are as high as it is).
  const [height, setHeight] = useState(0);
  const live = useRef({ step, onMove });
  live.current = { step, onMove };
  const [row, setRow] = useState<Row<K>>(() => layRow(current, step));
  const [index, setIndex] = useState(row.origin);
  // The page the deck is on, set at the moment it changes (not from a render, which may be behind).
  const at = useRef(index);
  // The pages chosen by the person's own swipes since the deck was last quiet: a period the screen draws late is not a change from outside.
  const passed = useRef(new Set<string>());
  const scroller = useRef<Scroller | null>(null);
  // The swipes since the deck last stopped, each one page in its direction (+1 to the next page): quick swipes one after another that catch the
  // scroll view still moving would otherwise add less than a page each (10 quick swipes moved 5–7 pages), and the native pager moved 10.
  const swipes = useRef(0);
  const dragFrom = useRef(0);
  // The page the deck itself is sliding to (a correction after a quick run of swipes, an arrow): the scroll view reports the places it passes on the
  // way and where an interrupted slide stopped, and those are not swipes (a stray report moved the deck back a page after 2 of 10 runs).
  const sliding = useRef<number | null>(null);
  const hidden = useRef(false);

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

  // The offset of the pages in px for whatever moves with them (the period bar, the tabs): page `index` at rest is at (origin − index) × width.
  const x = useSharedValue((row.origin - index) * width);
  // Where the row's first page of the current layout is: x = shift − offset.
  const shift = useSharedValue(row.origin * width);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = shift.value - e.contentOffset.x;
  });

  const goTo = (page: number, animated: boolean) => {
    sliding.current = animated ? page : null;
    if (animated) {
      scroller.current?.scrollTo({ x: page * width, animated: true });
      // A slide that never reports its end must not keep the deck from hearing the next swipe.
      setTimeout(() => {
        if (sliding.current === page) sliding.current = null;
      }, 1500);
    } else {
      scroller.current?.scrollTo({ x: page * width, animated: false });
      x.value = (row.origin - page) * width;
    }
  };

  // The current page changed from outside (the arrows of the period bar, a tab pressed, another period chosen): a neighbour is reached by
  // sliding, anything else lays the row out again around it. `at`, not `index`: the period of a swipe is committed by its own store and may
  // be drawn before `index` is.
  useEffect(() => {
    if (row.keys[at.current] === current) {
      // The screen has caught up with the deck.
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
      goTo(near, true);
      return;
    }
    const found = row.keys.indexOf(current);
    if (found >= 0) {
      at.current = found;
      setIndex(found);
      goTo(found, false);
      return;
    }
    const fresh = layRow(current, live.current.step);
    setRow(fresh);
    at.current = fresh.origin;
    setIndex(fresh.origin);
  }, [current, row, index, instant]); // eslint-disable-line react-hooks/exhaustive-deps

  // A row laid out again starts at rest on its page.
  useLayoutEffect(() => {
    shift.value = row.origin * width;
    x.value = (row.origin - at.current) * width;
    scroller.current?.scrollTo({ x: at.current * width, animated: false });
  }, [row, width]); // eslint-disable-line react-hooks/exhaustive-deps

  // The end of a swipe (or of a slide the deck was asked for): the page reached becomes the current one.
  const settle = (offset: number) => {
    pagerState("idle");
    // A deck on a screen that is not in front never takes a page (its tab was just left and the scroll view lost its size).
    if (!width || !focused()) return;
    const from = at.current;
    // As many pages as swipes, in their directions (a quick fling must not run on over several periods, and a swipe must not be lost); without
    // a swipe (a slide the deck was asked for) the page reached. When the scroll view stopped elsewhere it is put on the page, sliding for a page.
    const counted = swipes.current;
    const reached = Math.round(offset / width);
    if (counted === 0 && sliding.current !== null) {
      if (reached !== sliding.current) return;
      sliding.current = null;
    }
    swipes.current = 0;
    const wanted = counted !== 0 ? from + counted : Math.max(from - 1, Math.min(from + 1, reached));
    const page = Math.max(0, Math.min(row.keys.length - 1, wanted));
    console.log(`[perf] deck: settled from page ${from}, reached ${reached}, swipes counted ${counted}, page ${page}`);
    if (page !== reached) goTo(page, Math.abs(page - reached) <= 1);
    if (page !== from) {
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

  const motion = useMemo(() => ({ x, base: index - row.origin, width }), [x, index, row.origin, width]);
  // The five places: the page number p stands in place p mod 5 (the five consecutive pages around `index` have five different places).
  const places = Array.from({ length: SLOTS }, (_, s) => {
    const first = index - AROUND;
    const page = first + ((((s - first) % SLOTS) + SLOTS) % SLOTS);
    return { s, page };
  });

  return (
    <PagerContext.Provider value={motion}>
      <View
        style={{ flex: 1 }}
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => {
          const w = e.nativeEvent.layout.width;
          // Shown again after being hidden (no size): the scroll view is put back on its page, at rest.
          if (w && hidden.current) {
            hidden.current = false;
            goTo(at.current, false);
          }
          if (!w) hidden.current = true;
          setWidth(w || width);
        }}
      >
        {header}
        <View style={{ flex: 1 }} onLayout={(e: { nativeEvent: { layout: { height: number } } }) => e.nativeEvent.layout.height && setHeight(e.nativeEvent.layout.height)}>
          {height > 0 ? (
            <Reanimated.ScrollView
              ref={(node: unknown) => {
                scroller.current = node as Scroller | null;
              }}
              horizontal
              // One page to a swipe: the interval is a page and a fling does not pass the next stop.
              snapToInterval={width}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              scrollEnabled={row.keys.length > 1}
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollBeginDrag={(e: { nativeEvent: { contentOffset: { x: number } } }) => {
                dragFrom.current = e.nativeEvent.contentOffset.x;
                console.log(`[perf] deck: drag begins at ${Math.round(e.nativeEvent.contentOffset.x)} (page ${(e.nativeEvent.contentOffset.x / width).toFixed(2)}, sliding ${sliding.current}, deck on ${at.current})`);
                sliding.current = null;
                pagerState("dragging");
              }}
              onScrollEndDrag={(e: { nativeEvent: { contentOffset: { x: number }; velocity?: { x: number } } }) => {
                // a swipe that moved the pages a third of a page, or flicked them, counts, in the direction it moved them.
                const moved = e.nativeEvent.contentOffset.x - dragFrom.current;
                const flick = e.nativeEvent.velocity?.x ?? 0;
                console.log(`[perf] deck: drag ends at ${Math.round(e.nativeEvent.contentOffset.x)}, moved ${Math.round(moved)} (${(moved / width).toFixed(2)} pages), velocity ${flick.toFixed(2)}, counted ${Math.abs(moved) > width * 0.35 || Math.abs(flick) > 0.3}`);
                if (Math.abs(moved) > width * 0.35 || Math.abs(flick) > 0.3) swipes.current += (Math.abs(moved) > 2 ? moved : flick) > 0 ? 1 : -1;
              }}
              onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { x: number } } }) => (console.log(`[perf] deck: momentum ends at ${Math.round(e.nativeEvent.contentOffset.x)} (page ${(e.nativeEvent.contentOffset.x / width).toFixed(2)})`), settle(e.nativeEvent.contentOffset.x))}
              onContentSizeChange={() => {
                scroller.current?.scrollTo({ x: at.current * width, animated: false });
              }}
              contentContainerStyle={{ width: row.keys.length * width }}
              style={{ flex: 1 }}
            >
              {places.map(({ s, page }) => (
                <Slot key={`slot${s}`} id={row.keys[page]} page={page} width={width} height={height} current={page === index} render={render as (key: string) => ReactNode} />
              ))}
            </Reanimated.ScrollView>
          ) : null}
        </View>
      </View>
    </PagerContext.Provider>
  );
}
