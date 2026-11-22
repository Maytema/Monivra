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
import { countRender, now, perfLog, perfNote, PERF_BUILD } from "../platform/perf.ts";
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, View, unstable_batchedUpdates } from "react-native";
import PagerView from "react-native-pager-view";
import { useNavigation } from "expo-router";
import { PagerContext } from "./pan-pager.tsx";
import { pagerState } from "./gesture-lock.ts";

export { usePagerMotion } from "./pan-pager.tsx";

// Rows inside the pager keep their press while the finger moves a little (a long press), not while it travels: the
// hand-made pager needed a huge offset (its pages moved by a transform the touch system did not see); the native
// pager moves real views, and with the huge offset a finger lifted at the far side of a swipe was taken for a tap on
// the row (a sheet opened during quick swipes, speed check, builds 100–101).
export const WIDE_RETENTION = { top: 24, bottom: 24, left: 24, right: 24 } as const;


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

// Speed-check build: a page says when its first meaningful content is on the screen (the rows of a list, the tiles,
// the chart), so the pager can write how long after a page was chosen the person saw it. Nothing in other builds.
interface Readiness {
  ready(): void;
  gone(): void;
}
const PageReady = createContext<Readiness>({ ready: () => undefined, gone: () => undefined });
export function usePageReady(): () => void {
  const page = useContext(PageReady) as Readiness;
  useEffect(() => () => page.gone(), [page]);
  return page.ready;
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
  instant = false,
  around = 1,
}: {
  current: K;
  // The current page changed while the screen was hidden: go there at once, without sliding.
  instant?: boolean;
  // How many pages on each side have their contents drawn beforehand (1: the neighbours). A screen whose pages are
  // slow to show their first rows can draw two, so that a quick second swipe also lands on a drawn page.
  around?: number;
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
  // The page whose neighbours are drawn and which is told it is the current one. It follows `index` in a task of its
  // own right after the swipe's commit (which draws only the period and the page reached). Not a transition: during
  // quick swipes each new swipe interrupted the transition and threw its work away, it was never committed before the
  // swipes stopped, and the page the next swipe uncovered had nothing drawn — the white pages (speed check build 111:
  // up to 9 pages behind, contents only 0.5–0.8 s after the last swipe). A plain task is not thrown away; if swipes
  // came meanwhile it draws around the last page only.
  const [shown, setShown] = useState(row.origin);
  const pendingShow = useRef(false);
  const follow = (_page: number) => {
    if (pendingShow.current) return;
    pendingShow.current = true;
    setTimeout(() => {
      pendingShow.current = false;
      setShown(at.current);
    }, 0);
  };
  // The page the pager is on, set at the moment it changes (not from a render, which may be behind).
  const at = useRef(index);
  // The pages chosen by the person's own swipes since the pager was last quiet: a period the screen draws late (one of
  // them) is not a change from outside.
  const passed = useRef(new Set<string>());
  const pager = useRef<Controls | null>(null);

  // The current page changed from outside (the arrows of the period bar, a tab pressed, another period chosen): a
  // neighbour is reached by a swipe of the pager, anything else lays the row out again around it.
  // `at` (set at once when the pager chooses a page), not `index`: the period of a swipe is committed by its own store
  // and may be drawn before `index` is; read against `index` the swipe looked like a change from outside and the pager
  // was sent back to the page before — while the finger was already on the next swipe (the second of two quick
  // swipes was lost, speed check build 101).
  useEffect(() => {
    if (row.keys[at.current] === current) {
      // The screen has caught up with the pager.
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
      follow(near);
      asked.current = true;
      pager.current?.setPage(near);
      return;
    }
    const found = row.keys.indexOf(current);
    if (found >= 0) {
      perfNote(`pager: jumped to page ${found}`);
      at.current = found;
      setIndex(found);
      setShown(found);
      asked.current = true;
      pager.current?.setPageWithoutAnimation(found);
      return;
    }
    perfNote(`pager: laid out again around ${current}`);
    const fresh = layRow(current, live.current.step);
    setRow(fresh);
    at.current = fresh.origin;
    setIndex(fresh.origin);
    setShown(fresh.origin);
  }, [current, row, index, instant]);

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

  // Speed-check build: the time from the page chosen to the commit of the new pages, and to the next frame.
  const chosenAt = useRef(0);
  useLayoutEffect(() => {
    if (!PERF_BUILD || !chosenAt.current) return;
    const since = chosenAt.current;
    chosenAt.current = 0;
    perfLog("swipe: pages built", now() - since);
    requestAnimationFrame(() => perfLog("swipe: next frame", now() - since));
  }, [index]);
  // A page is taken only from the person's swipe (between "dragging" and "idle") or from a move this pager asked for.
  // The native pager also reports pages by itself: a tab that is left is frozen and hidden, its pager loses its size
  // and chose another page — taken as a swipe, it changed the shared period, the statistics on the screen drew it,
  // and the two kept answering each other (10 s of the JavaScript thread, speed check build 102). Such a report is
  // refused and the pager is put back on its page.
  // (Outside a navigator — none today — the pager counts as in front.)
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
  const touched = useRef(false);
  // When a finger last touched this pager (touches reach JavaScript in order, before the page it chose): a page chosen
  // within a moment of it is the person's.
  const fingerAt = useRef(0);
  const asked = useRef(false);
  const hidden = useRef(false);
  const selected = (page: number) => {
    const from = at.current;
    if (page === from) {
      asked.current = false;
      return;
    }
    // A pager on a screen that is not in front never takes a page (its tab was just left).
    if (!focused() || (!touched.current && !asked.current && Date.now() - fingerAt.current > 1200)) {
      perfNote(`pager: refused page ${page} (on ${from})`);
      requestAnimationFrame(() => pager.current?.setPageWithoutAnimation(at.current));
      return;
    }
    asked.current = false;
    if (PERF_BUILD) chosenAt.current = now();
    if (PERF_BUILD) {
      chosen.current.set(page, now());
      const key = String(row.keys[page]);
      if (readyAt.current.has(key)) perfLog("page ready after it was chosen", 0);
      else waiting.current = { key, at: now() };
      const ahead = page + Math.sign(page - from);
      perfNote(`pager: page ${page} from ${from}; this page drawn: ${drawn(page) ? "yes" : "NO"}; next page ${ahead} drawn: ${drawn(ahead) ? "yes" : "NO"}; behind by ${page - drawnAround.current}`);
    }
    at.current = page;
    passed.current.add(String(row.keys[page]));
    unstable_batchedUpdates(() => {
      setIndex(page);
      live.current.onMove(page - from);
    }, undefined);
    follow(page);
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
    at.current = fresh.origin;
    setIndex(fresh.origin);
    setShown(fresh.origin);
  };

  const reach = warm ? around : 0;
  // Speed-check build: which pages have their contents drawn (committed), and when each page was chosen, to say
  // whether the page a swipe uncovers was drawn when the finger got there, and how long its contents took.
  const drawnAround = useRef(shown);
  const chosen = useRef(new Map<number, number>());
  useLayoutEffect(() => {
    if (!PERF_BUILD) return;
    drawnAround.current = shown;
    const t = chosen.current.get(shown);
    if (t !== undefined) perfLog(`pager: contents around page ${shown} drawn (lag ${index - shown})`, now() - t);
  }, [shown]);
  // Readiness of pages (speed-check build): when each page's content was first on the screen, and the page chosen
  // last, to write "ready N ms after it was chosen" (0 when it was ready before).
  const readyAt = useRef(new Map<string, number>());
  const waiting = useRef<{ key: string; at: number } | null>(null);
  const mounts = useRef(0);
  const readyOf = useRef(new Map<string, Readiness>());
  const readyFor = (key: string): Readiness => {
    let fn = readyOf.current.get(key);
    if (!fn) {
      fn = {
        ready: () => {
          if (readyAt.current.has(key)) return;
          readyAt.current.set(key, now());
          mounts.current++;
          perfNote(`pager: page content shown (${mounts.current} so far)`);
          const w = waiting.current;
          if (w && w.key === key) {
            perfLog("page ready after it was chosen", now() - w.at);
            waiting.current = null;
          }
        },
        gone: () => {
          readyAt.current.delete(key);
          perfNote("pager: page content removed");
        },
      };
      readyOf.current.set(key, fn);
    }
    return fn;
  };
  const drawn = (page: number) => Math.abs(page - drawnAround.current) <= reach || page === index;
  return (
    <PagerContext.Provider value={{ x, base: index - row.origin, width }}>
      <View
        style={{ flex: 1 }}
        onTouchStart={() => (fingerAt.current = Date.now())}
        onTouchMove={() => (fingerAt.current = Date.now())}
        onTouchEnd={() => (fingerAt.current = Date.now())}
        onTouchCancel={() => (fingerAt.current = Date.now())}
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => {
          const w = e.nativeEvent.layout.width;
          // Shown again after being hidden (no size): the pager is put back on its page, at rest.
          if (w && hidden.current) {
            hidden.current = false;
            pager.current?.setPageWithoutAnimation(at.current);
            position.setValue(at.current);
            offset.setValue(0);
          }
          if (!w) hidden.current = true;
          setWidth(w || width);
        }}
      >
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
            const state = e.nativeEvent.pageScrollState;
            perfNote(`pager: ${state}`);
            if (state === "dragging") touched.current = true;
            pagerState(state);
            if (state === "idle") {
              touched.current = false;
              asked.current = false;
              quiet();
            }
          }}
        >
          {row.keys.map((key, i) => (
            <Slot key={key}>
              {Math.abs(i - shown) <= reach || i === index ? PERF_BUILD ? <PageReady.Provider value={readyFor(key)}>{render(key, i === shown)}</PageReady.Provider> : render(key, i === shown) : null}
            </Slot>
          ))}
        </AnimatedPagerView>
      </View>
    </PagerContext.Provider>
  );
}
