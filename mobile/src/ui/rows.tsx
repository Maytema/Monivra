// Rows of the settings lists (js/ui/primitives.js `menuRowHtml`, `toggleRowHtml`): a title with a
// caption under it, an icon at the left and a chevron or a switch at the right; no frames, as a list.
import { Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { Toggle } from "./form.tsx";
import type { ReactNode } from "react";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";

// `tall`: the rows of a menu page (.menu .row of the first application).
export function SettingRow({ title, caption, icon, onPress, end, chevron = true, tall = false }: { title: string; caption?: string; icon?: string; onPress?: () => void; end?: ReactNode; chevron?: boolean; tall?: boolean }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(title)} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 17, minHeight: tall ? 84 : 62, paddingVertical: tall ? 22 : 17, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line, backgroundColor: pressed ? p.sheet : "transparent" })}>
      {icon ? <Icon name={icon} size={22} color={p.inkSoft} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 16, lineHeight: 22 }}>{t.t(title)}</Text>
        {caption ? <Text style={{ color: p.muted, fontSize: 13, lineHeight: 18, marginTop: 6 }}>{t.t(caption)}</Text> : null}
      </View>
      {end ?? (onPress && chevron ? <View style={{ marginRight: 10 }}><Icon name="right" size={22} color={p.inkSoft} /></View> : null)}
    </Pressable>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (on: boolean) => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 62, paddingVertical: 17, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 16, lineHeight: 22 }}>{t.t(label)}</Text>
        {hint ? <Text style={{ color: p.muted, fontSize: 13, lineHeight: 18, marginTop: 6 }}>{t.t(hint)}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} />
    </Pressable>
  );
}

export function Footnote({ children }: { children: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 18, paddingVertical: 10 }}>{t.t(children)}</Text>;
}
