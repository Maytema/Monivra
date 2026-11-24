import { MoreScreen } from "../../features/more.tsx";
import { TabScope } from "../../ui/mask-scope.tsx";

// The figures of a tab hear the eye only while the tab is in front (ui/mask-scope.tsx).
export default function Route() {
  return (
    <TabScope>
      <MoreScreen />
    </TabScope>
  );
}
