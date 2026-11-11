// The bottom navigation bar of the first application (css/navbar.css): a tinted bar, an icon in a
// pill that is filled for the open tab, a label under it. It is drawn edge to edge, so its bottom
// padding is the larger of the design's minimum and the system's inset (gesture bar or three buttons).
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { chrome } from "./theme.ts";

export const TABS = [
  { name: "index", title: "Accounts", icon: "wallet" },
  { name: "categories", title: "Categories", icon: "categories" },
  { name: "operations", title: "Operations", icon: "receipt" },
  { name: "statistics", title: "Statistics", icon: "stats" },
  { name: "more", title: "More", icon: "more" },
] as const;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  // A screen hides the bar while it has its own actions there (the selection of operations).
  const current = state.routes[state.index];
  const style = current ? StyleSheet.flatten(descriptors[current.key]?.options.tabBarStyle) : undefined;
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
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) navigation.navigate(route.name);
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
              <Icon name={tab.icon} size={24} color={color} />
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
