// Fields of the forms (js/ui/primitives.js `fieldButtonHtml`, `textFieldHtml`, `toggleRowHtml`):
// a bordered box with a small label and the value in the accent color.
import { Pressable, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import type { ReactNode } from "react";

// `.field` of css/components.css: 22px padding (17 on narrow screens), 13px corners, 15px label.
const box = (p: ReturnType<typeof usePalette>, narrow = false) => ({ borderWidth: 1, borderColor: p.line, borderRadius: 13, padding: narrow ? 17 : 22, backgroundColor: p.bg });
const label = { fontSize: 15, fontWeight: "500" as const };

export function FieldButton({ label: title, value, onPress, right, tone, inline = false }: { label: string; value?: string; onPress: () => void; right?: ReactNode; tone?: "positive" | "negative"; inline?: boolean }) {
  const p = usePalette();
  const t = useT();
  const narrow = useWindowDimensions().width < 360;
  const color = tone === "positive" ? p.positiveInk : tone === "negative" ? p.negativeInk : p.accentInk;
  // An inline field keeps the title on the left and the value (or a mark) on the right.
  if (inline)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} onPress={onPress} style={({ pressed }) => [box(p, narrow), { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 75 }, pressed && { backgroundColor: p.soft }]}>
        <Text style={label}>{t.t(title)}</Text>
        {right ?? <Text style={{ color, fontSize: 18 }}>{value}</Text>}
      </Pressable>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} onPress={onPress} style={({ pressed }) => [box(p, narrow), pressed && { backgroundColor: p.soft }]}>
      <Text style={[label, { color: p.ink, marginBottom: right || value ? 18 : 0 }]}>{t.t(title)}</Text>
      {right ?? <Text style={{ color, fontSize: 15 }}>{value}</Text>}
    </Pressable>
  );
}

// `boxed` is the framed input of a title; the other one is a line under the text.
export function FieldText({ label: title, value, onChange, placeholder, boxed = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; boxed?: boolean }) {
  const p = usePalette();
  const t = useT();
  const narrow = useWindowDimensions().width < 360;
  return (
    <View style={box(p, narrow)}>
      <Text style={[label, { color: p.ink, marginBottom: 14 }]}>{t.t(title)}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ? t.t(placeholder) : ""}
        placeholderTextColor={p.muted}
        style={boxed ? { color: p.ink, fontSize: 16, height: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: p.ink, borderRadius: 4 } : { color: p.accentInk, fontSize: 15, paddingVertical: 8, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: p.accentInk }}
      />
    </View>
  );
}

export function FieldToggle({ label: title, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  const t = useT();
  const narrow = useWindowDimensions().width < 360;
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[box(p, narrow), { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 75 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[label, { color: p.ink }]}>{t.t(title)}</Text>
        {hint ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{t.t(hint)}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.accent, false: p.line }} thumbColor="#ffffff" />
    </Pressable>
  );
}
