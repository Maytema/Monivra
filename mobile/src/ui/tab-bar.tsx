// The bottom navigation bar of the first application (css/navbar.css): a tinted bar, an icon in a
// pill that is filled for the open tab, a label under it. It is drawn edge to edge, so its bottom
// padding is the larger of the design's minimum and the system's inset (gesture bar or three buttons).
import { countRender } from "../platform/perf.ts";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  // a moment), and in that moment `state` still names the old tab: a press on the tab just left was taken for "already
  // here" and dropped, so going back needed two presses. The decision is made from what was asked for, not from the draw.
  const asked = useRef(state.routes[state.index]?.key);
  const shown = useRef(state);
  shown.current = state;
  useEffect(() => {
    asked.current = state.routes[state.index]?.key;
  }, [state.index, state.routes]);
  // A screen hides the bar while it has its own actions there (the selection of operations).
  const current = state.routes[state.index];
  const style = current ? StyleSheet.flatten(descriptors[current.key]?.options.tabBarStyle as Parameters<typeof StyleSheet.flatten>[0]) : undefined;
  if (style?.display === "none") return null;
  return (
    <View
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
        const active = state.index === index;
        const color = active ? p.accentInk : p.inkSoft;
        const press = () => {
          if (asked.current === route.key) return;
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          asked.current = route.key;
          // If the navigator did not take it, the next press must not be taken for "already there".
          setTimeout(() => (asked.current = shown.current.routes[shown.current.index]?.key), 600);
          navigateToTab(route.key);
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
