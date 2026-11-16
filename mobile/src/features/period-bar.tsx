// The period bar (js/ui/period-picker.js `periodBar`): arrows to the neighbouring periods and the
// title that opens the dialog "Time interval". "All time" has no neighbours, so the arrows are dimmed.
import { countRender } from "../platform/perf.ts";
import { useRef, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { canShiftPeriod, periodBounds, shiftPeriod } from "../domain/periods.ts";
import type { Period } from "../domain/periods.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { openPeriodDialog } from "../ui/period-dialog.tsx";
import { Pager, usePagerMotion } from "../ui/pager.tsx";
import { periodTitle } from "../ui/period-title.ts";
import { getView, setView, useViewPeriod } from "./ui-state.ts";

export { periodTitle };

// `dayPicker`: the title opens the calendar and the period of the same kind around the chosen day is
// shown (the budgets of the first application, period-picker.js dayPicker).
export function PeriodBar({ dayPicker = false }: { dayPicker?: boolean } = {}) {
  countRender("period bar");
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const period = useViewPeriod();
  const motion = usePagerMotion();
  const [room, setRoom] = useState(0);
  const fixed = !canShiftPeriod(period);
  const shift = (n: 1 | -1) => setView({ period: shiftPeriod(period, n, data.settings) });
  const arrow = (n: 1 | -1, icon: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} disabled={fixed} onPress={() => shift(n)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", opacity: fixed ? 0.4 : 1 }}>
      <Icon name={icon} size={22} color={p.ink} />
    </Pressable>
  );
  const title = (shown: Period) => (
    <View style={{ width: room || undefined, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15 }}>
        {periodTitle(shown, t, data.settings)}
      </Text>
      {/* Every title has the arrow: the neighbour that a swipe brings to the middle looks the same before and
          after the move is taken over by React (no arrow popping in a few frames later). */}
      <Icon name="down" size={14} color={p.ink} />
    </View>
  );
  // While a swipe moves the pages, the titles move along between the arrows and fade out before they
  // reach them; the arrows stay where they are. The titles are placed by the pager's count of moves and follow
  // its offset on the native side, so after a move nothing is put back (no flash of the previous title).
  let titles: ReactNode = title(period);
  if (motion && room && !fixed) {
    const { width: w, base, x } = motion;
    const rest = -base * w;
    // Opacity of the title `k` places away (-1 previous, 0 this, 1 next) by the offset from rest.
    const opacity = (k: -1 | 0 | 1) =>
      k === 0
        ? x.interpolate({ inputRange: [rest - w * 0.45, rest, rest + w * 0.45], outputRange: [0, 1, 0], extrapolate: "clamp" })
        : x.interpolate({ inputRange: k === -1 ? [rest + w * 0.55, rest + w] : [rest - w, rest - w * 0.55], outputRange: k === -1 ? [0, 1] : [1, 0], extrapolate: "clamp" });
    const shown = (k: -1 | 0 | 1) => (k === 0 ? period : shiftPeriod(period, k, data.settings));
    titles = (
      <Animated.View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: room, transform: [{ translateX: Animated.multiply(x, room / w) }] }}>
        {([-1, 0, 1] as const).map((k) => (
          <Animated.View key={JSON.stringify(shown(k))} style={{ position: "absolute", top: 0, bottom: 0, left: (base + k) * room, width: room, justifyContent: "center", opacity: opacity(k) }}>
            {title(shown(k))}
          </Animated.View>
        ))}
      </Animated.View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 46, paddingHorizontal: 12 }}>
      {arrow(-1, "left", "Previous period")}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={periodTitle(period, t, data.settings)}
        onPress={() => (dayPicker ? openCalendar(period.anchor, (day) => setView({ period: { ...period, anchor: day } })) : openPeriodDialog(period, (next) => setView({ period: next })))}
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
  const period = useViewPeriod();
  // The pager names its pages by a key; the periods it was given are kept by their keys to be drawn.
  const known = useRef(new Map<string, Period>());
  // A page is named by what it shows (its kind and its first and last day), not by its anchor day: the same month
  // reached by swipes from either side has different anchors (a 31st moves to the 30th and stays there), and a name
  // that differed made the pager take the period for a jump from outside and lay all its pages out again.
  const keyOf = (x: Period): string => {
    const key = `${x.mode}:${periodBounds(x, data.settings).join("~")}`;
    if (!known.current.has(key) || x === period) known.current.set(key, x);
    return key;
  };
  const periodOf = (key: string): Period => known.current.get(key) ?? period;
  const settings = data.settings;
  return (
    <Pager
      current={keyOf(period)}
      step={(key, n) => {
        const shown = periodOf(key);
        return canShiftPeriod(shown) ? keyOf(shiftPeriod(shown, n, settings)) : null;
      }}
      header={header}
      render={(key, isCurrent) => render(periodOf(key), isCurrent)}
      onMove={(steps) => {
        let next = getView().period;
        for (let i = 0; i < Math.abs(steps); i++) next = shiftPeriod(next, steps > 0 ? 1 : -1, settings);
        setView({ period: next });
      }}
    />
  );
}
