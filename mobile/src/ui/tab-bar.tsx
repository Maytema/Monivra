// The bottom navigation bar of the first application (css/navbar.css): a tinted bar, an icon in a
// pill that is filled for the open tab, a label under it. It is drawn edge to edge, so its bottom
// padding is the larger of the design's minimum and the system's inset (gesture bar or three buttons).
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { chrome } from "./theme.ts";
import Svg, { Path } from "react-native-svg";

export const TABS = [
  { name: "index", title: "Accounts", icon: "wallet" },
  { name: "categories", title: "Categories", icon: "categories" },
  { name: "operations", title: "Operations", icon: "receipt" },
  { name: "statistics", title: "Statistics", icon: "stats" },
  { name: "more", title: "More", icon: "apps" },
] as const;

// The open tab shows its icon filled (as in the reference screens), the inner lines cut out in the
// colour of the pill.
const FILLED: Record<string, { shape: string; inner?: string; dot?: string }> = {
  wallet: { shape: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", inner: "M13 9h7v6h-7a3 3 0 0 1 0-6z", dot: "M14 10.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z" },
  categories: { shape: "m12 2 4 7H8zM3 13h7v8H3zm15 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  receipt: { shape: "M4 2l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v20l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2z", inner: "M7.5 7h9M7.5 11h9M7.5 15h9" },
  stats: { shape: "M3 3h18v18H3z", inner: "M8 16v-4m4 4V7m4 9v-6" },
};

function TabIcon({ name, active, color, cut }: { name: string; active: boolean; color: string; cut: string }) {
  const filled = active ? FILLED[name] : undefined;
  if (!filled) return <Icon name={name} size={24} color={color} />;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <Path d={filled.shape} fill={color} stroke={color} strokeWidth={filled.dot ? 0.6 : 1.7} />
      {filled.inner ? <Path d={filled.inner} fill={filled.dot ? cut : "none"} stroke={filled.dot ? "none" : cut} strokeWidth={1.9} /> : null}
      {filled.dot ? <Path d={filled.dot} fill={color} /> : null}
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
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
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
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.t(tab.title)}
            onPress={press}
            style={{ flex: 1, minWidth: 0, minHeight: chrome.navItem, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <View
              style={{
                width: chrome.navPill.width,
                height: chrome.navPill.height,
                borderRadius: chrome.navPill.radius,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? p.soft : "transparent",
              }}
            >
              <TabIcon name={tab.icon} active={active} color={color} cut={p.soft} />
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
