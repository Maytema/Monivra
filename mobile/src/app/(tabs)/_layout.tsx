// The five tabs of the first application. Each tab draws its own header block (the "hero"), as the
// first application does, so the navigator shows no header; the bar is `ui/tab-bar.tsx`.
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TABS, TabBar } from "../../ui/tab-bar.tsx";

export default function TabsLayout() {
  const p = usePalette();
  const t = useT();
  // The tabs are built one by one in the background after the first screen is up, a pause between them, so that
  // the first visit of a tab (Statistics, More: 0.4 to 12 s on a weak phone, builds 128-130) is no longer a hang right
  // after the tap: the tab is already built and only has to be shown.
  const [built, setBuilt] = useState(1);
  useEffect(() => {
    if (built >= TABS.length) return;
    const timer = setTimeout(() => setBuilt((n) => n + 1), built === 1 ? 1500 : 900);
    return () => clearTimeout(timer);
  }, [built]);
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{
        headerShown: false,
        // A tab that is not shown is frozen: it does not draw while the others change the period or the data (with
        // freezing off, three period swipes in Operations took 1.6 s of the JavaScript thread instead of 0.37 s,
        // speed check, builds 95 and 99). It draws once, when it is shown again.
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: p.bg },
      }}>
      {TABS.map((tab, i) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t.t(tab.title), lazy: i >= built }} />
      ))}
    </Tabs>
  );
}
