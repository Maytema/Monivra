// The dialog "Time interval" (js/ui/period-picker.js): tiles for a range, all time, a day, week, today,
// year and month, each with the range it would choose now; and the dialog for the day a month starts on.
import { Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";
import { systemClock } from "../domain/dates.ts";
import { periodBounds, type Period } from "../domain/periods.ts";
import { periodTitle } from "./period-title.ts";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { openCalendar, openRangeDialog, TextButton } from "./calendar-sheet.tsx";
import { HintBanner } from "./hint-banner.tsx";
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

// A calendar page with what the tile stands for inside it: dots, infinity, a square, or a number.
function Glyph({ mode, color }: { mode: Mode; color: string }) {
  const number = mode === "week" ? "7" : mode === "today" ? "1" : mode === "year" ? "365" : mode === "month" ? "30" : "";
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={8} width={30} height={27} rx={4} />
      <Path d="M5 16H35M13 4V11M27 4V11" />
      {mode === "range" ? <Path d="M12 25h.01M20 25h.01M28 25h.01" strokeWidth={4.5} /> : null}
      {mode === "all" ? <Path d="M20 26c-2-3-3.5-4-5.5-4a3.5 3.5 0 0 0 0 7c2 0 3.5-1 5.5-4s3.5-4 5.5-4a3.5 3.5 0 0 1 0 7c-2 0-3.5-1-5.5-4z" /> : null}
      {mode === "day" ? <Rect x={16} y={21} width={8} height={8} rx={1.5} fill={color} /> : null}
      {number ? (
        <SvgText x={20} y={number.length > 2 ? 30 : 31} fontSize={number.length > 2 ? 11 : 13} fontWeight="bold" fill={color} stroke="none" textAnchor="middle">
          {number}
        </SvgText>
      ) : null}
    </Svg>
  );
}

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
  const current: Mode = period.mode === "day" ? (period.anchor === today ? "today" : "day") : (period.mode as Mode);
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
            style={({ pressed }) => ({ width: i === 0 ? "100%" : "49%", flexGrow: i === 0 ? 0 : 1, minHeight: 88, padding: 12, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: pressed || current === mode ? p.soft : p.key })}
          >
            <View style={{ marginBottom: 6 }}>
              <Glyph mode={mode} color={p.ink} />
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
