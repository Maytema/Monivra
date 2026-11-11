// The period bar: the title of the period and arrows to the neighbouring ones; a tap changes the kind.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { canShiftPeriod, periodBounds, shiftPeriod, type Period, type PeriodMode } from "../domain/periods.ts";
import { systemClock } from "../domain/dates.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { OptionPicker } from "../ui/pickers.tsx";
import { font, space } from "../ui/theme.ts";
import { setView, useView } from "./ui-state.ts";

export function periodTitle(p: Period, t: ReturnType<typeof useT>, settings: { weekStart: number; monthStart: number }): string {
  if (p.mode === "all") return t.t("All time");
  const [a, b] = periodBounds(p, settings);
  if (p.mode === "month") return t.monthYear(a);
  if (p.mode === "year") return a.slice(0, 4);
  if (p.mode === "day") return t.day(a);
  return `${t.day(a, a.slice(0, 4) !== b.slice(0, 4))} – ${t.day(b)}`;
}

const MODES: { value: PeriodMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export function PeriodBar() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const { period } = useView();
  const [choosing, setChoosing] = useState(false);
  const shift = (n: 1 | -1) => setView({ period: shiftPeriod(period, n, data.settings) });
  const arrow = (n: 1 | -1, icon: string) => (
    <Pressable disabled={!canShiftPeriod(period)} onPress={() => shift(n)} hitSlop={12} style={{ opacity: canShiftPeriod(period) ? 1 : 0.3, padding: space.s }}>
      <Icon name={icon} color={p.accentInk} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: p.nav, borderRadius: 999, paddingHorizontal: space.s }}>
      {arrow(-1, "left")}
      <Pressable style={{ flex: 1, alignItems: "center", paddingVertical: 10 }} onPress={() => setChoosing(true)}>
        <Text style={{ color: p.ink, fontSize: font.body, fontWeight: "600" }}>{periodTitle(period, t, data.settings)}</Text>
      </Pressable>
      {arrow(1, "right")}
      <OptionPicker
        visible={choosing}
        title="Period"
        options={MODES}
        value={period.mode}
        onClose={() => setChoosing(false)}
        onPick={(mode) => setView({ period: { mode, anchor: period.mode === "all" ? systemClock.today() : period.anchor } })}
      />
    </View>
  );
}
