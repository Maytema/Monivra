// The time of day dialog (js/ui/time-picker.js): the big hour and minute (and AM/PM), a dial with a hand that
// follows the finger (outer ring 1–12, inner ring 13–00 on a 24-hour clock), and a keyboard mode with two typed
// fields. Releasing the finger on the hour moves on to the minute.
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { usePalette, useT } from "./app-context.tsx";
import { PrimaryPill, TextButton } from "./calendar-sheet.tsx";
import { toast } from "./dialogs.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

const DIAL = 256;
const OUTER = 102;
const INNER = 64;
const INNER_SHARE = 0.62;
const pad = (n: number): string => String(n).padStart(2, "0");
const place = (turns: number, radius: number) => ({ x: Math.sin(turns * 2 * Math.PI) * radius, y: -Math.cos(turns * 2 * Math.PI) * radius });
const outerHour = (slot: number) => (slot === 0 ? 12 : slot);
const innerHour = (slot: number) => (slot === 0 ? 0 : slot + 12);

// Whether the language writes the time with AM and PM.
export const twelveHour = (locale: string): boolean => {
  try {
    return /^h1[12]$/.test(new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle ?? "");
  } catch {
    return false;
  }
};

function Part({ text, chosen, onPress, label }: { text: string; chosen: boolean; onPress: () => void; label: string }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, height: 88, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: chosen ? p.tint : p.soft }}>
      <Text style={{ color: chosen ? p.accentInk : p.ink, fontSize: 54 }}>{text}</Text>
    </Pressable>
  );
}

function TimeDialog({ value, onDone }: { value: string; onDone: (time: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const twelve = twelveHour(t.locale);
  const [hour, setHour] = useState(Number(value.slice(0, 2)) || 0);
  const [minute, setMinute] = useState(Number(value.slice(3, 5)) || 0);
  const [part, setPart] = useState<"hour" | "minute">("hour");
  const [typing, setTyping] = useState(false);
  const [hourText, setHourText] = useState("");
  const [minuteText, setMinuteText] = useState("");
  const live = useRef({ hour, minute, part });
  live.current = { hour, minute, part };
  const shownHour = twelve ? hour % 12 || 12 : hour;

  const hand = (() => {
    if (part === "minute") return { turns: minute / 60, radius: OUTER, text: pad(minute) };
    const inner = !twelve && (hour === 0 || hour > 12);
    return { turns: (hour % 12) / 12, radius: inner ? INNER : OUTER, text: twelve ? String(shownHour) : pad(hour) };
  })();
  const knob = place(hand.turns, hand.radius);

  const pick = (x: number, y: number) => {
    const dx = x - DIAL / 2;
    const dy = y - DIAL / 2;
    const turns = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    const share = Math.hypot(dx, dy) / (DIAL / 2);
    if (live.current.part === "minute") setMinute(Math.round(turns * 60) % 60);
    else {
      const slot = Math.round(turns * 12) % 12;
      if (twelve) setHour(slot + (live.current.hour >= 12 ? 12 : 0));
      else setHour(share < INNER_SHARE ? innerHour(slot) : outerHour(slot) % 24);
    }
  };

  const typed = (): { hour: number; minute: number } | null => {
    const h = Number(hourText);
    const m = Number(minuteText);
    if (hourText === "" || minuteText === "" || m > 59) return null;
    if (twelve) return h >= 1 && h <= 12 ? { hour: (h % 12) + (hour >= 12 ? 12 : 0), minute: m } : null;
    return h <= 23 ? { hour: h, minute: m } : null;
  };
  const toggleTyping = () => {
    if (typing) {
      const v = typed();
      if (!v) return toast("Enter a valid time");
      setHour(v.hour);
      setMinute(v.minute);
    } else {
      setHourText(pad(shownHour));
      setMinuteText(pad(minute));
    }
    setTyping(!typing);
    setPart("hour");
  };
  const confirm = () => {
    let h = hour;
    let m = minute;
    if (typing) {
      const v = typed();
      if (!v) return toast("Enter a valid time");
      h = v.hour;
      m = v.minute;
    }
    close();
    onDone(`${pad(h)}:${pad(m)}`);
  };

  const field = (label: string, text: string, set: (v: string) => void) => (
    <View style={{ flex: 1 }}>
      <TextInput accessibilityLabel={t.t(label)} value={text} onChangeText={(v) => set(v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" selectTextOnFocus style={{ height: 88, borderRadius: 10, borderWidth: 2, borderColor: p.accent, backgroundColor: p.sheet, color: p.ink, fontSize: 54, textAlign: "center", padding: 0 }} />
      <Text style={{ color: p.muted, fontSize: 12, marginTop: 4, textAlign: "center" }}>{t.t(label)}</Text>
    </View>
  );
  const marks = part === "minute" ? Array.from({ length: 12 }, (_, s) => ({ text: pad(s * 5), ...place(s / 12, OUTER), on: false })) : [...Array.from({ length: 12 }, (_, s) => ({ text: String(outerHour(s)), ...place(s / 12, OUTER), on: false })), ...(twelve ? [] : Array.from({ length: 12 }, (_, s) => ({ text: pad(innerHour(s)), ...place(s / 12, INNER), on: false })))];
  return (
    <View>
      <Text style={{ color: p.muted, fontSize: 13 }}>{t.t("Select time")}</Text>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: 6, marginTop: 18 }}>
        {typing ? (
          <>
            {field("Hour", hourText, setHourText)}
            <Text style={{ alignSelf: "center", color: p.ink, fontSize: 52 }}>:</Text>
            {field("Minute", minuteText, setMinuteText)}
          </>
        ) : (
          <>
            <Part text={pad(shownHour)} chosen={part === "hour"} onPress={() => setPart("hour")} label={t.t("Hour")} />
            <Text style={{ alignSelf: "center", color: p.ink, fontSize: 52 }}>:</Text>
            <Part text={pad(minute)} chosen={part === "minute"} onPress={() => setPart("minute")} label={t.t("Minute")} />
          </>
        )}
        {twelve ? (
          <View style={{ width: 52, gap: 4 }}>
            {["AM", "PM"].map((name, i) => (
              <Pressable key={name} accessibilityRole="button" onPress={() => setHour((hour % 12) + i * 12)} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center", backgroundColor: Math.floor(hour / 12) === i ? p.tint : p.bg }}>
                <Text style={{ color: p.ink, fontSize: 15, fontWeight: "600" }}>{name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {typing ? null : (
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t.t(part === "hour" ? "Hour" : "Minute")}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onResponderMove={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onResponderRelease={() => {
            if (live.current.part === "hour") setPart("minute");
          }}
          style={{ width: DIAL, height: DIAL, alignSelf: "center", marginTop: 22, borderRadius: DIAL / 2, backgroundColor: p.soft }}
        >
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: DIAL, height: DIAL }}>
            <Svg width={DIAL} height={DIAL}>
              <Line x1={DIAL / 2} y1={DIAL / 2} x2={DIAL / 2 + knob.x} y2={DIAL / 2 + knob.y} stroke={p.accent} strokeWidth={2} />
              <Circle cx={DIAL / 2} cy={DIAL / 2} r={3} fill={p.accent} />
            </Svg>
            {marks.map((m) => (
              <Text key={m.text + m.x} style={{ position: "absolute", left: DIAL / 2 + m.x - 20, top: DIAL / 2 + m.y - 11, width: 40, textAlign: "center", color: p.ink, fontSize: 16 }}>
                {m.text}
              </Text>
            ))}
            <View style={{ position: "absolute", left: DIAL / 2 + knob.x - 22, top: DIAL / 2 + knob.y - 22, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}>
              <Text style={{ color: p.onAccent, fontSize: 16 }}>{hand.text}</Text>
            </View>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t(typing ? "Dial" : "Keyboard")} onPress={toggleTyping} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 }}>
          <Icon name={typing ? "clock" : "keyboard"} size={24} color={p.inkSoft} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill label="OK" onPress={confirm} />
      </View>
    </View>
  );
}

export const openTime = (value: string, onDone: (time: string) => void): number => sheets.open(<TimeDialog value={value} onDone={onDone} />, "dialog");
