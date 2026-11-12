// The period bar (js/ui/period-picker.js `periodBar`): arrows to the neighbouring periods and the
// title that opens the dialog "Time interval". "All time" has no neighbours, so the arrows are dimmed.
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { canShiftPeriod, shiftPeriod } from "../domain/periods.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { openPeriodDialog } from "../ui/period-dialog.tsx";
import { SwipePane } from "../ui/swipe-pane.tsx";
import { periodTitle } from "../ui/period-title.ts";
import { setView, useView } from "./ui-state.ts";

export { periodTitle };

export function PeriodBar() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const { period } = useView();
  const fixed = !canShiftPeriod(period);
  const shift = (n: 1 | -1) => setView({ period: shiftPeriod(period, n, data.settings) });
  const arrow = (n: 1 | -1, icon: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} disabled={fixed} onPress={() => shift(n)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", opacity: fixed ? 0.4 : 1 }}>
      <Icon name={icon} size={22} color={p.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 46, paddingHorizontal: 12 }}>
      {arrow(-1, "left", "Previous period")}
      <Pressable accessibilityRole="button" onPress={() => openPeriodDialog(period, (next) => setView({ period: next }))} style={{ flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15 }}>
          {periodTitle(period, t, data.settings)}
        </Text>
        <Icon name="down" size={14} color={p.ink} />
      </Pressable>
      {arrow(1, "right", "Next period")}
    </View>
  );
}

// A swipe over a screen with a period bar moves to the neighbouring period.
export function PeriodSwipe({ children }: { children: ReactNode }) {
  const data = useLedger();
  const { period } = useView();
  return (
    <SwipePane canGo={() => canShiftPeriod(period)} go={(direction) => setView({ period: shiftPeriod(period, direction, data.settings) })}>
      {children}
    </SwipePane>
  );
}
