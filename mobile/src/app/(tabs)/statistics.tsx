import { useLayoutEffect } from "react";
import { StatisticsScreen } from "../../features/statistics.tsx";
import { TabScope } from "../../ui/mask-scope.tsx";

// The figures of a tab hear the eye only while the tab is in front (ui/mask-scope.tsx).
export default function Route() {
  useLayoutEffect(() => console.log(`[perf] route mounted statistics`), []);
  return (
    <TabScope>
      <StatisticsScreen />
    </TabScope>
  );
}
