// The five tabs of the first application.
import { Tabs } from "expo-router";
import { Icon } from "../../ui/kit.tsx";
import { usePalette, useT } from "../../ui/app-context.tsx";

const TABS = [
  ["index", "Accounts", "wallet"],
  ["categories", "Categories", "categories"],
  ["operations", "Operations", "receipt"],
  ["statistics", "Statistics", "stats"],
  ["more", "More", "more"],
] as const;

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.ink,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: p.nav, borderTopColor: p.line, height: 64, paddingBottom: 8 },
        tabBarActiveTintColor: p.accentInk,
        tabBarInactiveTintColor: p.muted,
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen key={name} name={name} options={{ title: t.t(title), tabBarIcon: ({ color }) => <Icon name={icon} color={color} size={22} /> }} />
      ))}
    </Tabs>
  );
}
