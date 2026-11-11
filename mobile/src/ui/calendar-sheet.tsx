// The calendar dialog for one date and the dialog for a range of dates (js/ui/calendar.js): a month
// grid with arrows, the title opens a grid of years; Today, Cancel and OK under it.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
  const year = first.getUTCFullYear();
  const today = systemClock.today();
  // 2026-11-01 is a Sunday.
  const letters = Array.from({ length: 7 }, (_, i) => day(`2026-11-${String(1 + ((weekStart + i) % 7)).padStart(2, "0")}`).toLocaleDateString(t.locale, { weekday: "short", timeZone: "UTC" }));
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const heading = (
    <Pressable accessibilityRole="button" onPress={() => setYears(!years)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 }}>
      <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600" }}>{title.charAt(0).toUpperCase() + title.slice(1)}</Text>
      <Icon name={years ? "up" : "down"} size={16} color={p.ink} />
    </Pressable>
  );
  if (years)
    return (
      <View>
        <View style={{ alignItems: "center", marginTop: 12, marginBottom: 8 }}>{heading}</View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 4 }}>
          {Array.from({ length: 21 }, (_, i) => year - 10 + i).map((y) => (
            <Pressable
              key={y}
              onPress={() => {
                setMonth(`${y}${month.slice(4)}`);
                setYears(false);
              }}
              style={{ width: "31%", paddingVertical: 11, borderRadius: 20, alignItems: "center", backgroundColor: y === year ? p.accent : "transparent" }}
            >
              <Text style={{ color: y === year ? p.onAccent : p.ink, fontSize: 15 }}>{y}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  const blocked = !!min && month <= monthOf(min);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Previous month")} disabled={blocked} onPress={() => move(-1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", opacity: blocked ? 0.4 : 1 }}>
          <Icon name="left" size={22} color={p.ink} />
        </Pressable>
        {heading}
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Next month")} onPress={() => move(1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
          <Icon name="right" size={22} color={p.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {letters.map((l, i) => (
          <Text key={i} style={{ width: "14.285%", textAlign: "center", paddingVertical: 8, color: p.muted, fontSize: 12, textTransform: "capitalize" }}>
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
      <Text style={{ color: p.muted, fontSize: 14 }}>{t.t("Select date")}</Text>
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
        <PrimaryPill
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
