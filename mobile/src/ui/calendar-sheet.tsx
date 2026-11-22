// The calendar dialog for one date and the dialog for a range of dates (js/ui/calendar.js): a month
// grid with arrows, the title opens a grid of years; Today, Cancel and OK under it.
import { useRef, useState } from "react";
import { FlatList, PanResponder, Text, TextInput, View } from "react-native";
import { Pressable } from "./pressable.tsx";
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

export function PrimaryPill({ label, onPress, disabled = false, minWidth }: { label: string; onPress: () => void; disabled?: boolean; minWidth?: number }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minWidth, alignItems: "center", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: p.accent, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: p.onAccent, fontSize: 15, fontWeight: "600" }}>{t.t(label)}</Text>
    </Pressable>
  );
}

const ROW = 44;
const SEEN = 5;
const CELL = 38;
const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

// One column of the month/year chooser: a snapping list whose middle row is the chosen one; rows
// fade with the distance from it. Virtualized (200 years), rows are fixed height.
function Wheel({ items, index, onIndex, align }: { items: string[]; index: number; onIndex: (i: number) => void; align: "flex-end" | "flex-start" }) {
  const p = usePalette();
  const ref = useRef<FlatList<string> | null>(null);
  const [shown, setShown] = useState(index);
  const clamp = (y: number) => Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
  const settle = (y: number) => {
    const i = clamp(y);
    setShown(i);
    onIndex(i);
  };
  return (
    <View style={{ flex: 1, height: ROW * SEEN }}>
      <FlatList
        ref={ref}
        data={items}
        keyExtractor={(label) => label}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
        windowSize={5}
        initialNumToRender={SEEN + 4}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(SEEN / 2) }}
        onScroll={(e) => {
          const i = clamp(e.nativeEvent.contentOffset.y);
          if (i !== shown) setShown(i);
        }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
        extraData={shown}
        renderItem={({ item: label, index: i }) => {
          const far = Math.abs(i - shown);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                ref.current?.scrollToOffset({ offset: i * ROW, animated: true });
                setShown(i);
                onIndex(i);
              }}
              style={{ height: ROW, justifyContent: "center", alignItems: align, paddingHorizontal: 18 }}
            >
              <Text style={{ color: p.ink, fontSize: far === 0 ? 18 : 16, fontWeight: far === 0 ? "600" : "400", opacity: far === 0 ? 1 : far === 1 ? 0.7 : 0.35 }}>{label}</Text>
            </Pressable>
          );
        }}
      />
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
    const name = t.monthName(i);
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

function MonthGrid({ month, setMonth, chosen, pick, min, years, setYears }: { month: string; setMonth: (m: string) => void; chosen: string | null; pick: (date: string) => void; min?: string | null; years: boolean; setYears: (on: boolean) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const first = day(month + "-01");
  const weekStart = data.settings.weekStart;
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const move = (n: number) => {
    const d = day(month + "-01");
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(iso(d).slice(0, 7));
  };
  // A swipe along the month turns the page, like the arrows: to the left the next month, to the right the previous one.
  const turn = useRef({ move, blocked: false });
  turn.current = { move, blocked: !!min && month <= monthOf(min) };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 40) return;
        if (g.dx < 0) turn.current.move(1);
        else if (!turn.current.blocked) turn.current.move(-1);
      },
    }),
  ).current;
  const title = t.monthYear(month + "-01");
  const today = systemClock.today();
  // 2026-11-01 is a Sunday.
  const letters = Array.from({ length: 7 }, (_, i) => t.weekday(weekStart + i, "narrow"));
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const padded = [...cells, ...Array<null>((7 - (cells.length % 7)) % 7).fill(null)];
  const weeks = Array.from({ length: padded.length / 7 }, (_, w) => padded.slice(w * 7, w * 7 + 7));
  const heading = (
    <Pressable accessibilityRole="button" onPress={() => setYears(!years)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 }}>
      <Text style={{ color: p.accentInk, fontSize: 17, fontWeight: "600" }}>{title.charAt(0).toUpperCase() + title.slice(1)}</Text>
      <Icon name={years ? "down" : "right"} size={16} color={p.accentInk} />
    </Pressable>
  );
  if (years)
    return (
      <View>
        <View style={{ alignItems: "flex-start", marginTop: 4, marginBottom: 2 }}>{heading}</View>
        <MonthYearWheels month={month} setMonth={setMonth} done={() => setYears(false)} />
      </View>
    );
  const blocked = !!min && month <= monthOf(min);
  return (
    <View {...swipe.panHandlers}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 2 }}>
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
      <View style={{ flexDirection: "row" }}>
        {letters.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", paddingVertical: 6, color: p.muted, fontSize: 13, textTransform: "uppercase" }}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={{ flexDirection: "row" }}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={{ flex: 1, height: CELL }} />;
            const off = !!min && date < min;
            const active = date === chosen;
            return (
              <View key={i} style={{ flex: 1, height: CELL, alignItems: "center", justifyContent: "center" }}>
                <Pressable
                  disabled={off}
                  onPress={() => pick(date)}
                  style={{ width: CELL, height: CELL, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: active ? p.accent : "transparent", borderWidth: date === today && !active ? 1.5 : 0, borderColor: p.accent, opacity: off ? 0.4 : 1 }}
                >
                  <Text style={{ color: active ? p.onAccent : off ? p.muted : p.ink, fontSize: 15 }}>{Number(date.slice(8))}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Manual entry: the order of the parts follows the setting "Date format" (month | day | year by default).
const ORDER: Record<string, { hint: string; parts: ("y" | "m" | "d")[]; sep: string }> = {
  month: { hint: "MM/DD/YYYY", parts: ["m", "d", "y"], sep: "/" },
  day: { hint: "DD/MM/YYYY", parts: ["d", "m", "y"], sep: "/" },
  iso: { hint: "YYYY-MM-DD", parts: ["y", "m", "d"], sep: "-" },
};
export function typedDate(text: string, format: string): string | null {
  const order = ORDER[format] ?? ORDER.month!;
  const pieces = text.trim().split(/[^0-9]+/).filter(Boolean);
  if (pieces.length !== 3) return null;
  const v: Record<string, number> = {};
  order.parts.forEach((k, i) => (v[k] = Number(pieces[i])));
  const { y, m, d } = v as { y: number; m: number; d: number };
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Typing only digits: the field puts the separators in itself. A month whose first digit is above 1 and a day whose first
// digit is above 3 can only be one digit long, so they are completed (with a leading zero) at once: 8152001 → 08/15/2001.
// `growing` is false while the text is being deleted, so the separator the person just erased does not come back.
export function maskDate(text: string, format: string, growing = true): string {
  const order = ORDER[format] ?? ORDER.month!;
  const digits = text.replace(/[^0-9]/g, "").slice(0, 8);
  let rest = digits;
  const out: string[] = [];
  let complete = false;
  for (const [i, part] of order.parts.entries()) {
    if (rest === "") {
      complete = false;
      break;
    }
    const size = part === "y" ? 4 : part === "m" ? (rest[0]! > "1" ? 1 : 2) : rest[0]! > "3" ? 1 : 2;
    const piece = rest.slice(0, size);
    rest = rest.slice(size);
    complete = piece.length === size;
    out.push(complete && size === 1 ? "0" + piece : piece);
    if (!complete || i === order.parts.length - 1) break;
  }
  const last = out.length;
  return out.join(order.sep) + (growing && complete && last < order.parts.length ? order.sep : "");
}

function CalendarDialog({ value, done, min }: { value: string; done: (date: string) => void; min?: string | null }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const [chosen, setChosen] = useState(value);
  const [month, setMonth] = useState(monthOf(value));
  const [mode, setMode] = useState<"days" | "years" | "input">("days");
  const [text, setText] = useState("");
  const today = systemClock.today();
  const order = ORDER[data.settings.dateFormat] ?? ORDER.month!;
  const typed = mode === "input" ? typedDate(text, data.settings.dateFormat) : null;
  const typedOk = typed !== null && (!min || typed >= min);
  const toggleInput = () => {
    if (mode === "input") {
      setMode("days");
      return;
    }
    const [y, m, d] = [chosen.slice(0, 4), chosen.slice(5, 7), chosen.slice(8, 10)];
    const parts = { y, m, d };
    setText(order.parts.map((k) => parts[k]).join(order.sep));
    setMode("input");
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 14 }}>{t.t("Select date")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 12 }}>
        <Text style={{ flex: 1, color: p.ink, fontSize: 28 }}>{mode === "input" ? t.t("Entered date") : t.shortDate(chosen)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t(mode === "input" ? "Select date" : "Entered date")} onPress={toggleInput} style={{ padding: 6 }}>
          <Icon name={mode === "input" ? "calendar" : "edit"} size={24} color={p.ink} />
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: p.line, marginHorizontal: -24 }} />
      {mode === "input" ? (
        <View style={{ marginTop: 18, marginBottom: 8 }}>
          <Text style={{ position: "absolute", left: 12, top: -9, zIndex: 1, paddingHorizontal: 4, backgroundColor: p.dialog, color: p.accentInk, fontSize: 12 }}>{t.t("Date")}</Text>
          <TextInput
            autoFocus
            value={text}
            onChangeText={(next) => setText((before) => maskDate(next, data.settings.dateFormat, next.length > before.length))}
            placeholder={order.hint}
            placeholderTextColor={p.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={{ height: 56, borderWidth: 2, borderColor: typed === null && text ? p.negative : p.accent, borderRadius: 6, paddingHorizontal: 14, color: p.ink, fontSize: 18 }}
          />
        </View>
      ) : (
        <MonthGrid month={month} setMonth={setMonth} chosen={chosen} pick={setChosen} min={min} years={mode === "years"} setYears={(on) => setMode(on ? "years" : "days")} />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 8, gap: 4 }}>
        {mode !== "days" || (min && min > today) ? null : (
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
          disabled={mode === "input" && !typedOk}
          onPress={() => {
            // In the month and year chooser OK only confirms them: the day is chosen afterwards.
            if (mode === "years") return setMode("days");
            const result = mode === "input" ? typed : chosen;
            if (!result) return;
            close();
            done(result);
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
