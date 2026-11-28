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
    // costs the JavaScript thread seconds in a run of taps (effects destroyed and made again). The eye is kept cheap by the scopes of the figures (ui/mask-scope.tsx) and the channels of the store.
    <Tabs activityEnabled={false} tabBar={(props) => <TabBar {...props} />} screenOptions={{
        headerShown: false,
        // A tab that is not shown is frozen: it does not draw while the others change the period or the data (with
        // freezing off, period swipes cost several times more of the JavaScript thread). It draws once, when it is shown again.
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: p.bg },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t.t(tab.title), lazy: true }} />
      ))}
    </Tabs>
  );
}
