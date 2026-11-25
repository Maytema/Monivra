// The five tabs of the first application. Each tab draws its own header block (the "hero"), as the
// first application does, so the navigator shows no header; the bar is `ui/tab-bar.tsx`.
import { Tabs } from "expo-router";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TABS, TabBar } from "../../ui/tab-bar.tsx";

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
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
