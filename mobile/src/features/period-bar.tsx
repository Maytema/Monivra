// The period bar (js/ui/period-picker.js `periodBar`): arrows to the neighbouring periods and the
// title that opens the dialog "Time interval". "All time" has no neighbours, so the arrows are dimmed.
import { useState, type ReactNode } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { canShiftPeriod, shiftPeriod } from "../domain/periods.ts";
import type { Period } from "../domain/periods.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { openPeriodDialog } from "../ui/period-dialog.tsx";
import { Pager, usePagerMotion } from "../ui/pager.tsx";
import { periodTitle } from "../ui/period-title.ts";
import { setView, useView } from "./ui-state.ts";

export { periodTitle };

export function PeriodBar() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const { period } = useView();
  const motion = usePagerMotion();
  const [room, setRoom] = useState(0);
  const fixed = !canShiftPeriod(period);
  const shift = (n: 1 | -1) => setView({ period: shiftPeriod(period, n, data.settings) });
  const arrow = (n: 1 | -1, icon: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} disabled={fixed} onPress={() => shift(n)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", opacity: fixed ? 0.4 : 1 }}>
      <Icon name={icon} size={22} color={p.ink} />
    </Pressable>
  );
  const title = (shown: Period, current: boolean) => (
    <View style={{ width: room || undefined, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15 }}>
        {periodTitle(shown, t, data.settings)}
      </Text>
      {current ? <Icon name="down" size={14} color={p.ink} /> : <View style={{ width: 14 }} />}
    </View>
  );
  // While a swipe moves the pages, the titles move along between the arrows and fade out before they
  // reach them; the arrows stay where they are.
  let titles: ReactNode = title(period, true);
  if (motion && room && !fixed) {
    const w = motion.width;
    const fade = (from: number, to: number) => motion.x.interpolate({ inputRange: [from, to].sort((a, b) => a - b), outputRange: from < to ? [0, 1] : [1, 0], extrapolate: "clamp" });
    const shiftX = Animated.add(Animated.multiply(motion.x, room / w), -room);
    titles = (
      <Animated.View style={{ flexDirection: "row", width: room * 3, transform: [{ translateX: shiftX }] }}>
        <Animated.View style={{ opacity: fade(w * 0.55, w) }}>{title(shiftPeriod(period, -1, data.settings), false)}</Animated.View>
        <Animated.View style={{ opacity: motion.x.interpolate({ inputRange: [-w * 0.45, 0, w * 0.45], outputRange: [0, 1, 0], extrapolate: "clamp" }) }}>{title(period, true)}</Animated.View>
        <Animated.View style={{ opacity: fade(-w * 0.55, -w) }}>{title(shiftPeriod(period, 1, data.settings), false)}</Animated.View>
      </Animated.View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 46, paddingHorizontal: 12 }}>
      {arrow(-1, "left", "Previous period")}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={periodTitle(period, t, data.settings)}
        onPress={() => openPeriodDialog(period, (next) => setView({ period: next }))}
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setRoom(e.nativeEvent.layout.width)}
        style={{ flex: 1, minHeight: 40, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
      >
        {titles}
      </Pressable>
      {arrow(1, "right", "Next period")}
    </View>
  );
}

// The pages of a screen with a period: the period before, this one and the one after, drawn side by side,
// with the period bar (and whatever else stays in place) above them.
export function PeriodPager({ header, render }: { header?: ReactNode; render: (period: Period, isCurrent: boolean) => ReactNode }) {
  const data = useLedger();
  const { period } = useView();
  const can = canShiftPeriod(period);
  const keyOf = (x: Period) => JSON.stringify(x) as string;
  const prev = can ? shiftPeriod(period, -1, data.settings) : null;
  const next = can ? shiftPeriod(period, 1, data.settings) : null;
  const byKey = new Map<string, Period>([[keyOf(period), period], ...(prev ? [[keyOf(prev), prev] as const] : []), ...(next ? [[keyOf(next), next] as const] : [])]);
  return (
    <Pager
      prev={prev ? keyOf(prev) : null}
      current={keyOf(period)}
      next={next ? keyOf(next) : null}
      header={header}
      render={(key, isCurrent) => render(byKey.get(key) ?? period, isCurrent)}
      onMove={(direction) => setView({ period: shiftPeriod(period, direction, data.settings) })}
    />
  );
}
