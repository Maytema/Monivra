// The bottom navigation bar of the first application (css/navbar.css): a tinted bar, an icon in a
// pill that is filled for the open tab, a label under it. It is drawn edge to edge, so its bottom
// padding is the larger of the design's minimum and the system's inset (gesture bar or three buttons).
import { countRender, PERF_BUILD, perfNote, sinceTouch } from "../platform/perf.ts";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, useT } from "./app-context.tsx";
import { ICONS } from "./icon-paths.ts";
import { chrome } from "./theme.ts";
import { coachRef } from "./coach.tsx";
import Svg, { Path, Rect } from "react-native-svg";

export const TABS = [
  { name: "index", title: "Accounts", icon: "wallet" },
  { name: "categories", title: "Categories", icon: "categories" },
  { name: "operations", title: "Operations", icon: "receipt" },
  { name: "statistics", title: "Statistics", icon: "stats" },
  { name: "more", title: "More", icon: "apps" },
] as const;

// All five icons are drawn the same way and at the same size; the open tab differs by its colour, its pill and a
// slightly heavier line. (A filled glyph changed the shape of the icons — the wallet and the receipt turned into
// solid blocks — and the icons no longer looked equally big.)
function TabIcon({ name, active, color }: { name: string; active: boolean; color: string }) {
  const heavy = name === "apps";
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={heavy ? 3.8 : active ? 2.1 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name] ?? ""} />
    </Svg>
  );
}

// The part of the navigator's props the bar uses (the navigator's own type lives in a package the
// application does not depend on directly).
interface TabBarProps {
  state: { index: number; routes: readonly { key: string; name: string }[] };
  descriptors: Record<string, { options: { tabBarStyle?: unknown } } | undefined>;
  emitter: { emit(event: { type: "tabPress"; target: string; canPreventDefault: true }): { defaultPrevented?: boolean } };
  navigateToTab: (routeKey: string) => void;
}

export function TabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  countRender("tab bar");
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  // The tab asked for last. The bar is redrawn only after the new screen has been built (the first visit of a tab takes
  // a moment), and in that moment `state` still names the old tab. The decision to drop a press is made from what was
  // asked for AND what is shown: a tab is dropped only when it is both (a true repeat). A tab that is merely the pending
  // target is not dropped (re-asking it is harmless), and a stale `asked` never blocks going back: on a slow phone a
  // timer that rewrote `asked` after 1.5 s made the next press on the old tab "already asked" and lost it.
  const asked = useRef(state.routes[state.index]?.key);
  const shown = useRef(state);
  shown.current = state;
  // The pill moves to the pressed tab at once, in a frame of its own; the screen is built after that frame. Before, the
  // pill moved only together with the new screen, so for the moment the screen took the press looked lost and was
  // pressed again.
  const [pressed, setPressed] = useState<string | null>(null);
  useEffect(() => {
    const key = state.routes[state.index]?.key;
    // Take `asked` from the navigator only when no newer target is pending (nothing asked, or the asked tab was reached);
    // a slow navigation to B that commits after the person already asked for A must not overwrite A.
    if (asked.current === undefined || asked.current === key) asked.current = key;
    // The pill is released only when the navigator reached the pressed tab.
    setPressed((cur) => (cur === null || cur === key ? null : cur));
    sinceTouch("tab shown " + (state.routes[state.index]?.name ?? "?"));
  }, [state.index, state.routes]);
  // A screen hides the bar while it has its own actions there (the selection of operations).
  const current = state.routes[state.index];
  const style = current ? StyleSheet.flatten(descriptors[current.key]?.options.tabBarStyle as Parameters<typeof StyleSheet.flatten>[0]) : undefined;
  if (style?.display === "none") return null;
  // Speed-check build: a finger on the bar is noted, so a press that never reached a tab shows as "bar touched" with no
  // "tab press" after it.
  return (
    <View
      onTouchStart={PERF_BUILD ? (e: GestureResponderEvent) => perfNote(`bar touched (${e.nativeEvent.touches.length} touches)`) : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: p.nav,
        paddingTop: chrome.navPadTop,
        paddingBottom: Math.max(chrome.navMinBottom, insets.bottom),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((x) => x.name === route.name);
        if (!tab) return null;
        const active = pressed ? pressed === route.key : state.index === index;
        const color = active ? p.accentInk : p.inkSoft;
        const press = () => {
          perfNote(`tab press ${route.name} (asked ${state.routes.find((r) => r.key === asked.current)?.name}, shown ${state.routes[state.index]?.name})`);
          if (asked.current === route.key && shown.current.routes[shown.current.index]?.key === route.key) return perfNote("tab press dropped: already asked");
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          asked.current = route.key;
          setPressed(route.key);
          requestAnimationFrame(() => navigateToTab(route.key));
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.t(tab.title)}
            onPressIn={press}
            style={{ flex: 1, minWidth: 0, minHeight: chrome.navItem, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <View
              ref={coachRef("tab-" + tab.name)}
              collapsable={false}
              style={{
                width: chrome.navPill.width,
                height: chrome.navPill.height,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Drawn as a shape, not as the view's background: the background lost its rounded corners on some
                  devices while the tab changed. */}
              {active ? (
                <Svg width={chrome.navPill.width} height={chrome.navPill.height} style={{ position: "absolute", left: 0, top: 0 }}>
                  <Rect x={0} y={0} width={chrome.navPill.width} height={chrome.navPill.height} rx={chrome.navPill.radius} ry={chrome.navPill.radius} fill={p.soft} />
                </Svg>
              ) : null}
              <TabIcon name={tab.icon} active={active} color={color} />
            </View>
            <Text numberOfLines={1} style={{ color, fontSize: 12, lineHeight: 16, fontWeight: active ? "600" : "400" }}>
              {t.t(tab.title)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
