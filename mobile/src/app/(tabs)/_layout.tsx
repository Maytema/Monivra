// The five tabs of the first application. Each tab draws its own header block (the "hero"), as the
// first application does, so the navigator shows no header; the bar is `ui/tab-bar.tsx`. A swipe
// sideways moves to the neighbouring tab, as in the first application.
import { useMemo } from "react";
import { PanResponder, View } from "react-native";
import { router, Tabs, useSegments } from "expo-router";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TABS, TabBar } from "../../ui/tab-bar.tsx";

const SWIPE_DISTANCE = 70;

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
  const segments: string[] = useSegments();
  const name = segments[1] ?? "index";
  const at = Math.max(0, TABS.findIndex((x) => x.name === name));
  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Only a clearly horizontal drag is taken; vertical scrolling stays with the lists.
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2.2,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < SWIPE_DISTANCE || Math.abs(g.vx) < 0.15) return;
          const next = TABS[at + (g.dx < 0 ? 1 : -1)];
          if (next) router.navigate(next.name === "index" ? "/" : `/${next.name}`);
        },
      }),
    [at],
  );
  return (
    <View style={{ flex: 1 }} {...swipe.panHandlers}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.bg } }}>
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t.t(tab.title) }} />
        ))}
      </Tabs>
    </View>
  );
}
