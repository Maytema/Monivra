// Reusable pieces of every screen, built only from the theme tokens.
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { ICONS } from "./icon-paths.ts";
import { usePalette, useT } from "./app-context.tsx";
import { font, radius, space } from "./theme.ts";

export function Icon({ name, size = 22, color, filled = false }: { name: string; size?: number; color?: ColorValue; filled?: boolean }) {
  const p = usePalette();
  const heavy = name === "more" || name === "apps";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? (color ?? p.ink) : "none"} stroke={color ?? p.ink} strokeWidth={heavy ? 3.8 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name] ?? ICONS.wallet ?? ""} />
    </Svg>
  );
}

// A round coloured badge with an icon (accounts, categories).
export function Badge({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.55} color="#ffffff" />
    </View>
  );
}

// A page. The stack (app/_layout.tsx) keeps every page above the system's bottom bar and the tab
// bar carries the inset itself, so a page adds none.
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const p = usePalette();
  const style = { flex: 1, backgroundColor: p.bg };
  const content = { padding: padded ? space.l : 0, gap: space.m };
  return scroll ? (
    <ScrollView style={style} contentContainerStyle={content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[style, content]}>{children}</View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.ink, fontSize: font.title, fontWeight: "600" }}>{children}</Text>;
}

export function Label({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  const p = usePalette();
  return <Text style={{ color: muted ? p.muted : p.ink, fontSize: font.small }}>{children}</Text>;
}

export function Body({ children, color, bold = false, size = font.body }: { children: ReactNode; color?: string; bold?: boolean; size?: number }) {
  const p = usePalette();
  return <Text style={{ color: color ?? p.ink, fontSize: size, fontWeight: bold ? "600" : "400" }}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const p = usePalette();
  const box = [{ backgroundColor: p.sheet, borderRadius: radius.l, padding: space.l, gap: space.s }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...box, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={box}>{children}</View>
  );
}

export function Button({ label, onPress, kind = "primary", disabled = false }: { label: string; onPress: () => void; kind?: "primary" | "outline" | "danger" | "text"; disabled?: boolean }) {
  const p = usePalette();
  const t = useT();
  const bg = kind === "primary" ? p.accent : kind === "danger" ? p.negative : "transparent";
  const fg = kind === "primary" ? p.onAccent : kind === "danger" ? "#ffffff" : p.accentInk;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: space.xl, alignItems: "center" },
        kind === "outline" && { borderWidth: 1, borderColor: p.accent },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
      ]}
    >
      <Text style={{ color: fg, fontSize: font.body, fontWeight: "600" }}>{t.t(label)}</Text>
    </Pressable>
  );
}

// A row: icon/badge on the left, text in the middle, value on the right.
export function Row({ left, title, subtitle, right, onPress, onLongPress, selected = false }: { left?: ReactNode; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; onLongPress?: () => void; selected?: boolean }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [styles.row, (pressed || selected) && { backgroundColor: p.soft }]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: font.body }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: p.muted, fontSize: font.small }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Money({ text, value, size = font.body }: { text: string; value: number; size?: number }) {
  const p = usePalette();
  return <Text style={{ color: value > 0 ? p.positiveInk : value < 0 ? p.negativeInk : p.muted, fontSize: size, fontWeight: "600" }}>{text}</Text>;
}

// Choices side by side (expense / income / transfer…).
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flexDirection: "row", backgroundColor: p.nav, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: o.value === value ? p.accent : "transparent", alignItems: "center" }}>
          <Text style={{ color: o.value === value ? p.onAccent : p.ink, fontWeight: "600" }}>{t.t(o.label)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, value, onChange, placeholder, multiline = false, keyboard = "default" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboard?: "default" | "decimal-pad" | "numeric" }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ gap: 4 }}>
      <Label>{t.t(label)}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ? t.t(placeholder) : ""}
        placeholderTextColor={p.muted}
        multiline={multiline}
        keyboardType={keyboard}
        style={{ borderWidth: 1, borderColor: p.line, borderRadius: radius.m, paddingHorizontal: space.l, paddingVertical: 11, color: p.ink, fontSize: font.body }}
      />
    </View>
  );
}

// A field that opens a choice (account, category, date…).
export function ChoiceField({ label, value, onPress, left }: { label: string; value: string; onPress: () => void; left?: ReactNode }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ borderWidth: 1, borderColor: p.line, borderRadius: radius.m, padding: space.m, flexDirection: "row", alignItems: "center", gap: space.m }, pressed && { backgroundColor: p.soft }]}>
      {left}
      <View style={{ flex: 1 }}>
        <Label>{t.t(label)}</Label>
        <Text style={{ color: p.ink, fontSize: font.body }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Icon name="right" size={18} color={p.muted} />
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s }}>
      <View style={{ flex: 1 }}>
        <Body>{t.t(label)}</Body>
        {hint ? <Label>{t.t(hint)}</Label> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? p.accent : p.line, padding: 3, alignItems: value ? "flex-end" : "flex-start" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#ffffff" }} />
      </View>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.muted, textAlign: "center", paddingVertical: space.xl }}>{t.t(text)}</Text>;
}

// A list of choices in a bottom panel (pickers).
export function SheetList<T>({ items, keyOf, render, onPick }: { items: readonly T[]; keyOf: (x: T) => string; render: (x: T) => ReactNode; onPick: (x: T) => void }) {
  return (
    <View>
      {items.map((x) => (
        <Pressable key={keyOf(x)} onPress={() => onPick(x)}>
          {render(x)}
        </Pressable>
      ))}
    </View>
  );
}

export function useBottomInset(): number {
  return useSafeAreaInsets().bottom;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 10, paddingHorizontal: space.s, borderRadius: radius.m },
});
