import { useLayoutEffect } from "react";
import { CategoriesScreen } from "../../features/categories.tsx";
import { TabScope } from "../../ui/mask-scope.tsx";

// The figures of a tab hear the eye only while the tab is in front (ui/mask-scope.tsx).
export default function Route() {
  useLayoutEffect(() => console.log(`[perf] route mounted categories`), []);
  return (
    <TabScope>
      <CategoriesScreen />
    </TabScope>
  );
}
