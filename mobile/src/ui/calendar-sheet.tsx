// The calendar dialog for one date and the dialog for a range of dates (js/ui/calendar.js): a month
// grid with arrows, the title opens a grid of years; Today, Cancel and OK under it.
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { systemClock } from "../domain/dates.ts";
import { useLedger, usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

const day = (date: string) => new Date(date + "T12:00:00Z");
const monthOf = (date: string) => date.slice(0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function TextButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 10, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: "500" }}>{t.t(label)}</Text>
    </Pressable>
  );
}

export function PrimaryPill({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: p.accent, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: p.onAccent, fontSize: 15, fontWeight: "600" }}>{t.t(label)}</Text>
    </Pressable>
  );
}

const ROW = 44;
const SEEN = 5;
const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

// One column of the month/year chooser: a snapping list whose middle row is the chosen one; rows
// fade with the distance from it.
function Wheel({ items, index, onIndex, align }: { items: string[]; index: number; onIndex: (i: number) => void; align: "flex-end" | "flex-start" }) {
  const p = usePalette();
  const ref = useRef<{ scrollTo(to: { y: number; animated: boolean }): void } | null>(null);
  const [shown, setShown] = useState(index);
  const settle = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
    setShown(i);
    return i;
  };
  return (
    <View style={{ flex: 1, height: ROW * SEEN }}>
      <ScrollView
        ref={(node) => {
          ref.current = node;
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(SEEN / 2) }}
        onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
          if (i !== shown) setShown(i);
        }}
        onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { y: number } } }) => onIndex(settle(e.nativeEvent.contentOffset.y))}
        onScrollEndDrag={(e: { nativeEvent: { contentOffset: { y: number } } }) => onIndex(settle(e.nativeEvent.contentOffset.y))}
      >
        {items.map((label, i) => {
          const far = Math.abs(i - shown);
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() => {
                ref.current?.scrollTo({ y: i * ROW, animated: true });
                setShown(i);
                onIndex(i);
              }}
              style={{ height: ROW, justifyContent: "center", alignItems: align, paddingHorizontal: 18 }}
            >
              <Text style={{ color: p.ink, fontSize: far === 0 ? 18 : 16, fontWeight: far === 0 ? "600" : "400", opacity: far === 0 ? 1 : far === 1 ? 0.7 : 0.35 }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Month on the left, years on the right (as in the reference); a tap on the title or on the chosen
// row goes back to the days.
function MonthYearWheels({ month, setMonth, done }: { month: string; setMonth: (m: string) => void; done: () => void }) {
  const p = usePalette();
  const t = useT();
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const name = new Date(Date.UTC(2026, i, 1)).toLocaleDateString(t.locale, { month: "long", timeZone: "UTC" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
  const years = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <View style={{ height: ROW * SEEN, marginBottom: 4 }}>
      <Pressable accessibilityRole="button" onPress={done} style={{ position: "absolute", left: 0, right: 0, top: ROW * Math.floor(SEEN / 2), height: ROW, borderRadius: 12, backgroundColor: p.soft }} />
      <View style={{ flexDirection: "row" }}>
        <Wheel items={months} index={m} align="flex-end" onIndex={(i) => setMonth(`${year}-${pad(i + 1)}`)} />
        <Wheel items={years} index={year - FIRST_YEAR} align="flex-start" onIndex={(i) => setMonth(`${FIRST_YEAR + i}-${pad(m + 1)}`)} />
      </View>
    </View>
  );
}

function MonthGrid({ month, setMonth, chosen, pick, min }: { month: string; setMonth: (m: string) => void; chosen: string | null; pick: (date: string) => void; min?: string | null }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const [years, setYears] = useState(false);
  const first = day(month + "-01");
  const weekStart = data.settings.weekStart;
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const move = (n: number) => {
    const d = day(month + "-01");
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(iso(d).slice(0, 7));
  };
  const title = first.toLocaleDateString(t.locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const today = systemClock.today();
  // 2026-11-01 is a Sunday.
  const letters = Array.from({ length: 7 }, (_, i) => day(`2026-11-${String(1 + ((weekStart + i) % 7)).padStart(2, "0")}`).toLocaleDateString(t.locale, { weekday: "narrow", timeZone: "UTC" }));
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const heading = (
    <Pressable accessibilityRole="button" onPress={() => setYears(!years)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 }}>
      <Text style={{ color: p.accentInk, fontSize: 17, fontWeight: "600" }}>{title.charAt(0).toUpperCase() + title.slice(1)}</Text>
      <Icon name={years ? "down" : "right"} size={16} color={p.accentInk} />
    </Pressable>
  );
  if (years)
    return (
      <View>
        <View style={{ alignItems: "flex-start", marginTop: 8, marginBottom: 4 }}>{heading}</View>
        <MonthYearWheels month={month} setMonth={setMonth} done={() => setYears(false)} />
      </View>
    );
  const blocked = !!min && month <= monthOf(min);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
        {heading}
        <View style={{ flexDirection: "row" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.t("Previous month")} disabled={blocked} onPress={() => move(-1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", opacity: blocked ? 0.4 : 1 }}>
            <Icon name="left" size={22} color={p.accentInk} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.t("Next month")} onPress={() => move(1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <Icon name="right" size={22} color={p.accentInk} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {letters.map((l, i) => (
          <Text key={i} style={{ width: "14.285%", textAlign: "center", paddingVertical: 10, color: p.ink, fontSize: 14, textTransform: "uppercase" }}>
            {l}
          </Text>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={{ width: "14.285%", aspectRatio: 1 }} />;
          const off = !!min && date < min;
          const active = date === chosen;
          return (
            <Pressable
              key={i}
              disabled={off}
              onPress={() => pick(date)}
              style={{ width: "14.285%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: active ? p.accent : "transparent", borderWidth: date === today && !active ? 1.5 : 0, borderColor: p.accent, opacity: off ? 0.4 : 1 }}
            >
              <Text style={{ color: active ? p.onAccent : off ? p.muted : p.ink, fontSize: 15 }}>{Number(date.slice(8))}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CalendarDialog({ value, done, min }: { value: string; done: (date: string) => void; min?: string | null }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [chosen, setChosen] = useState(value);
  const [month, setMonth] = useState(monthOf(value));
  const today = systemClock.today();
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 14 }}>{t.t("Select date")}</Text>
      <Text style={{ color: p.ink, fontSize: 28, marginTop: 22, marginBottom: 16 }}>{new Date(chosen + "T12:00:00Z").toLocaleDateString(t.locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</Text>
      <View style={{ height: 1, backgroundColor: p.line, marginHorizontal: -24 }} />
      <MonthGrid month={month} setMonth={setMonth} chosen={chosen} pick={setChosen} min={min} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 12, gap: 4 }}>
        {min && min > today ? null : (
          <View style={{ marginRight: "auto" }}>
            <TextButton
              label="Today"
              onPress={() => {
                setChosen(today);
                setMonth(monthOf(today));
              }}
            />
          </View>
        )}
        <TextButton label="Cancel" onPress={close} />
        <TextButton
          label="OK"
          onPress={() => {
            close();
            done(chosen);
          }}
        />
      </View>
    </View>
  );
}

// Calendar dialog for picking a date; with `min`, earlier days are dimmed and cannot be chosen.
export const openCalendar = (value: string, done: (date: string) => void, min: string | null = null): number => sheets.open(<CalendarDialog value={value} done={done} min={min} />, "dialog");

function RangeDialog({ from, to, done }: { from: string | null; to: string | null; done: (from: string, to: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const tile = (label: string, date: string | null, set: (d: string) => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => openCalendar(date ?? systemClock.today(), set)}
      style={{ flex: 1, gap: 6, alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, borderColor: date ? p.accent : p.line, backgroundColor: date ? p.soft : "transparent" }}
    >
      <Icon name="calendar" size={28} color={p.ink} />
      <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(label)}</Text>
      <Text style={{ color: p.ink, fontSize: 15, fontWeight: "600", textAlign: "center" }}>{date ? t.day(date) : t.t("Select date")}</Text>
    </Pressable>
  );
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 21, textAlign: "center", marginBottom: 18 }}>{t.t("Select range")}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {tile("From", a, setA)}
        {tile("To", b, setB)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 20, gap: 4 }}>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="OK"
          disabled={!a || !b}
          onPress={() => {
            if (!a || !b) return;
            close();
            const [x, y] = [a, b].sort() as [string, string];
            done(x, y);
          }}
        />
      </View>
    </View>
  );
}

export const openRangeDialog = (from: string | null, to: string | null, done: (from: string, to: string) => void): number => sheets.open(<RangeDialog from={from} to={to} done={done} />, "dialog");
