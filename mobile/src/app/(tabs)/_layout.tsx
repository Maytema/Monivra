// The five tabs of the first application. Each tab draws its own header block (the "hero"), as the
// first application does, so the navigator shows no header; the bar is `ui/tab-bar.tsx`.
import { useSyncExternalStore } from "react";
import { Tabs } from "expo-router";
import { perfEpoch, perfFlags, PERF_BUILD } from "../../platform/perf.ts";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TABS, TabBar } from "../../ui/tab-bar.tsx";

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
  // Speed-check build: the setting "no activity" turns React Activity off to compare (the layout is drawn again on a change of setting).
  useSyncExternalStore(perfEpoch.subscribe, perfEpoch.get);
  const activity = !(PERF_BUILD && perfFlags.noActivity);
  return (
    // React Activity (Expo SDK 58): a tab that is not shown is hidden, its effects are released and what it draws is deferred; freezing
    // alone did not stop the draws a change of the masking or the data caused in the tabs behind (speed check build 163).
    <Tabs activityEnabled={activity} tabBar={(props) => <TabBar {...props} />} screenOptions={{
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
