// The five tabs of the first application. Each tab draws its own header block (the "hero"), as the
// first application does, so the navigator shows no header; the bar is `ui/tab-bar.tsx`.
import { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { lab } from "../../platform/lab-flags.ts";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TABS, TabBar } from "../../ui/tab-bar.tsx";

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
  // Lab variant "warm": once the start is over, the other tabs are made in the background, one at a time, a second apart.
  useEffect(() => {
    if (!lab.warm) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    ["/categories", "/operations", "/statistics"].forEach((href, i) =>
      timers.push(setTimeout(() => { console.log(`[perf] warm: prefetch ${href}`); router.prefetch(href); }, 3000 + i * 1500)));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    // No React Activity: with it a tab that is not shown is hidden and its effects are released, so the eye is cheap, but every tap on a tab
    // costs ~2 s of the JavaScript thread in 12 taps (effects destroyed and made again; speed check builds 167-171, 12 taps 1800-2300 ms
    // against 65-170 ms without it). The eye is kept cheap by the scopes of the figures (ui/mask-scope.tsx) and the channels of the store.
    <Tabs activityEnabled={false} tabBar={(props) => <TabBar {...props} />} screenOptions={{
        headerShown: false,
        // A tab that is not shown is frozen: it does not draw while the others change the period or the data (with
        // freezing off, three period swipes in Operations took 1.6 s of the JavaScript thread instead of 0.37 s,
        // speed check, builds 95 and 99). It draws once, when it is shown again.
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: p.bg },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t.t(tab.title), lazy: true }} />
      ))}
    </Tabs>
  );
}
