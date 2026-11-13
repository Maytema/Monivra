// Fields of the forms, as filmed in the reference (the account form): each field is a card with a thin
// line around it, 16 dp corners and 24 dp inside; the label is 17 dp, the value under it in the accent
// colour. Amount fields keep the label on the left and the figure on the right; switches carry a hint.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { usePalette, useT } from "./app-context.tsx";
import { mix } from "./theme.ts";

const RADIUS = 16;
const box = (p: ReturnType<typeof usePalette>, narrow: boolean) => ({ borderWidth: 1, borderColor: p.line, borderRadius: RADIUS, paddingHorizontal: narrow ? 20 : 24, paddingVertical: 24, backgroundColor: p.bg });
const label = { fontSize: 17, lineHeight: 22, fontWeight: "500" as const };
const useNarrow = () => useWindowDimensions().width < 360;

export function FieldButton({ label: title, value, caption, onPress, right, tone, inline = false, cell }: { label: string; value?: string; caption?: string; onPress: () => void; right?: ReactNode; tone?: "positive" | "negative"; inline?: boolean; cell?: { node: ReactNode; background: string } }) {
  const p = usePalette();
  const t = useT();
  const narrow = useNarrow();
  const color = tone === "positive" ? p.positiveInk : tone === "negative" ? p.negativeInk : p.accentInk;
  // A cell is a tinted block at the right edge of the field (the icon of an account or a category).
  if (cell)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "stretch", height: 71, borderWidth: 1, borderColor: p.line, borderRadius: RADIUS, overflow: "hidden", backgroundColor: pressed ? p.soft : p.bg })}>
        <View style={{ flex: 1, justifyContent: "center", paddingLeft: narrow ? 20 : 24 }}>
          <Text style={[label, { color: p.ink }]}>{t.t(title)}</Text>
        </View>
        <View style={{ width: 72, alignItems: "center", justifyContent: "center", backgroundColor: cell.background }}>{cell.node}</View>
      </Pressable>
    );
  // An inline field keeps the title on the left and the value (or a mark) on the right.
  if (inline)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} onPress={onPress} style={({ pressed }) => [box(p, narrow), { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 75, paddingVertical: 20 }, pressed && { backgroundColor: p.soft }]}>
        <Text style={[label, { color: p.ink, flexShrink: 1 }]}>{t.t(title)}</Text>
        {right ?? <Text numberOfLines={1} style={{ color, fontSize: 22, flexShrink: 1 }}>{value}</Text>}
      </Pressable>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} onPress={onPress} style={({ pressed }) => [box(p, narrow), pressed && { backgroundColor: p.soft }]}>
      <Text style={[label, { color: p.ink, marginBottom: right || value ? 16 : 0 }]}>{t.t(title)}</Text>
      {right ?? <Text style={{ color, fontSize: 16, lineHeight: 22 }}>{value}</Text>}
      {caption ? <Text style={{ color: p.muted, fontSize: 13, marginTop: 4 }}>{caption}</Text> : null}
    </Pressable>
  );
}

// `boxed` is the framed input of a title; the other one is a line under the text, as long as the text
// (a short dash while it is empty).
export function FieldText({ label: title, value, onChange, placeholder, boxed = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; boxed?: boolean }) {
  const p = usePalette();
  const t = useT();
  const narrow = useNarrow();
  return (
    <View style={box(p, narrow)}>
      <Text style={[label, { color: p.ink, marginBottom: boxed ? 18 : 12 }]}>{t.t(title)}</Text>
      <TextInput
        accessibilityLabel={t.t(title)}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ? t.t(placeholder) : ""}
        placeholderTextColor={p.muted}
        style={
          boxed
            ? { color: p.accentInk, fontSize: 17, height: 55, paddingHorizontal: 16, borderWidth: 1, borderColor: p.ink, borderRadius: 6 }
            : { alignSelf: value ? "stretch" : "flex-start", minWidth: 28, color: p.accentInk, fontSize: 16, paddingVertical: 4, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: p.accentInk }
        }
      />
    </View>
  );
}

// The switch of the reference: a 52 × 32 track; on, it is filled with the accent and the white thumb sits
// on the right; off, it is pale with a dark rim and a small dark thumb on the left.
export function Toggle({ value, onChange, label: name }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  const p = usePalette();
  const at = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(at, { toValue: value ? 1 : 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [value, at]);
  const shift = at.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  const grow = at.interpolate({ inputRange: [0, 1], outputRange: [1, 26 / 16] });
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={name} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={8} style={{ width: 52, height: 32, borderRadius: 16, borderWidth: 2, borderColor: value ? p.accent : p.inkSoft, backgroundColor: value ? p.accent : mix(p.ink, p.bg, 0.08), justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", left: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: value ? "#ffffff" : p.inkSoft, transform: [{ translateX: shift }, { scale: grow }] }} />
    </Pressable>
  );
}

export function FieldToggle({ label: title, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  const t = useT();
  const narrow = useNarrow();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={t.t(title)} onPress={() => onChange(!value)} style={[box(p, narrow), { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[label, { color: p.ink }]}>{t.t(title)}</Text>
        {hint ? <Text style={{ color: p.muted, fontSize: 13, lineHeight: 16, marginTop: 6, letterSpacing: 0.2 }}>{t.t(hint)}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} />
    </Pressable>
  );
}
