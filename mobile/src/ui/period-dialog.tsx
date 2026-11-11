// The dialog "Time interval" (js/ui/period-picker.js): tiles for a range, all time, a day, week, today,
// year and month, each with the range it would choose now; and the dialog for the day a month starts on.
import { Pressable, Text, View } from "react-native";
import { systemClock } from "../domain/dates.ts";
import { periodBounds, type Period } from "../domain/periods.ts";
import { periodTitle } from "./period-title.ts";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { openCalendar, openRangeDialog, TextButton } from "./calendar-sheet.tsx";
import { HintBanner } from "./hint-banner.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

type Mode = "range" | "all" | "day" | "week" | "today" | "year" | "month";
const TILES: [Mode, string][] = [
  ["range", "Select date range"],
  ["all", "All time"],
  ["day", "Choose a day"],
  ["week", "Week"],
  ["today", "Today"],
  ["year", "Year"],
  ["month", "Month"],
];

function MonthStartDialog() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const close = useCloseLayer();
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 21, textAlign: "center", marginBottom: 14 }}>{t.t("Month starts on")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
          <Pressable
            key={d}
            onPress={() => {
              run((tx) => (tx.setSettings({ monthStart: d }), true));
              close();
            }}
            style={{ width: "14.285%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: d === data.settings.monthStart ? p.accent : "transparent" }}
          >
            <Text style={{ color: d === data.settings.monthStart ? p.onAccent : p.ink, fontSize: 15 }}>{d}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export const openMonthStart = (): number => sheets.open(<MonthStartDialog />, "dialog");

function PeriodDialog({ period, onPick }: { period: Period; onPick: (p: Period) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const today = systemClock.today();
  const note = (mode: Mode): string => (["week", "today", "year", "month"].includes(mode) ? periodTitle({ mode: mode === "today" ? "day" : (mode as Period["mode"]), anchor: today }, t, data.settings) : "");
  const choose = (mode: Mode) => {
    if (mode === "range") {
      const [a, b] = period.mode === "range" ? periodBounds(period, data.settings) : [null, null];
      openRangeDialog(a, b, (from, to) => {
        onPick({ mode: "range", from, to, anchor: from });
        close();
      });
    } else if (mode === "day")
      openCalendar(period.anchor, (day) => {
        onPick({ mode: "day", anchor: day });
        close();
      });
    else {
      onPick({ mode: mode === "today" ? "day" : mode, anchor: today });
      close();
    }
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 21, marginBottom: 6 }}>{t.t("Time interval")}</Text>
      <HintBanner id="month-start" text="Your month can start on payday instead of the 1st. Tap to set it up." onPress={openMonthStart} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
        {TILES.map(([mode, label], i) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            onPress={() => choose(mode)}
            style={({ pressed }) => ({ width: i === 0 ? "100%" : "49%", flexGrow: i === 0 ? 0 : 1, minHeight: 88, padding: 12, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : p.key })}
          >
            <View style={{ marginBottom: 8 }}>
              <Icon name="calendar" size={32} color={p.ink} />
            </View>
            <Text style={{ color: p.ink, fontSize: 14, textAlign: "center" }}>{t.t(label)}</Text>
            {note(mode) ? <Text style={{ color: p.ink, opacity: 0.75, fontSize: 12, marginTop: 2, textAlign: "center" }}>{note(mode)}</Text> : null}
          </Pressable>
        ))}
      </View>
      <View style={{ alignItems: "flex-end", marginTop: 10 }}>
        <TextButton label="Cancel" onPress={close} />
      </View>
    </View>
  );
}
export const openPeriodDialog = (period: Period, onPick: (p: Period) => void): number => sheets.open(<PeriodDialog period={period} onPick={onPick} />, "dialog");
