// Fields of the forms (js/ui/primitives.js `fieldButtonHtml`, `textFieldHtml`, `toggleRowHtml`):
// a bordered box with a small label and the value in the accent color.
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import type { ReactNode } from "react";

const box = (p: ReturnType<typeof usePalette>) => ({ borderWidth: 1, borderColor: p.line, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: p.bg });

export function FieldButton({ label, value, onPress, right }: { label: string; value?: string; onPress: () => void; right?: ReactNode }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => [box(p), pressed && { backgroundColor: p.soft }]}>
      <Text style={{ color: p.ink, fontSize: 13, fontWeight: "600", marginBottom: right || value ? 10 : 0 }}>{t.t(label)}</Text>
      {right ?? <Text style={{ color: p.accentInk, fontSize: 14 }}>{value}</Text>}
    </Pressable>
  );
}

export function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={box(p)}>
      <Text style={{ color: p.ink, fontSize: 13, fontWeight: "600" }}>{t.t(label)}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder ? t.t(placeholder) : ""} placeholderTextColor={p.muted} style={{ color: p.accentInk, fontSize: 14, paddingVertical: 6, paddingHorizontal: 0 }} />
    </View>
  );
}

export function FieldToggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[box(p), { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 75 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 13, fontWeight: "600" }}>{t.t(label)}</Text>
        {hint ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{t.t(hint)}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.accent, false: p.line }} thumbColor="#ffffff" />
    </Pressable>
  );
}
