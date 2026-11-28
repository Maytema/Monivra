import { useLayoutEffect } from "react";
import { OperationsScreen } from "../../features/operations.tsx";
import { TabScope } from "../../ui/mask-scope.tsx";

// The figures of a tab hear the eye only while the tab is in front (ui/mask-scope.tsx).
export default function Route() {
  useLayoutEffect(() => console.log(`[perf] route mounted operations`), []);
  return (
    <TabScope>
      <OperationsScreen />
    </TabScope>
  );
}
