// Pieces that make the first application recognisable, built from the same measures as its CSS
// (components.css, accounts.css): the header block ("hero"), the strip of tabs, section labels,
// the tinted badge, the progress meter and the round action tiles of a sheet.
import type { ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { alpha, chrome, mix } from "./theme.ts";

// Header of a root screen: a caption with the eye, the figure, and one round action at the right.
// It starts below the status bar (the application is drawn edge to edge).
export function Hero({
  caption,
  figure,
  hidden,
  onToggleHidden,
  actionIcon,
  actionLabel,
  onAction,
  below,
}: {
  caption: string;
  figure: string;
  hidden: boolean;
  onToggleHidden: () => void;
  actionIcon?: string;
  actionLabel?: string;
  onAction?: () => void;
  below?: ReactNode;
}) {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, alignItems: "center", backgroundColor: p.bg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.t("Toggle balance visibility")}
        accessibilityState={{ selected: hidden }}
        onPress={onToggleHidden}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          minHeight: 30,
          paddingHorizontal: 10,
          borderRadius: 10,
          backgroundColor: pressed ? alpha(p.accent, 0.11) : "transparent",
        })}
      >
        <Text style={{ color: p.ink, fontSize: 13 }}>{t.t(caption)}</Text>
        <Icon name={hidden ? "eye" : "eyeOpen"} size={16} color={p.ink} />
      </Pressable>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.ink, fontSize: 27, lineHeight: 42, paddingHorizontal: 53, fontVariant: ["tabular-nums"] }}>
        {figure}
      </Text>
      {actionIcon && onAction ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.t(actionLabel ?? actionIcon)}
        onPress={onAction}
        style={({ pressed }) => ({
          position: "absolute",
          top: insets.top + 19,
          right: 12,
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? p.soft : "transparent",
        })}
      >
        <Icon name={actionIcon} size={24} color={p.ink} />
      </Pressable>
      ) : null}
      {below}
    </View>
  );
}

// The strip of tabs under a header: the open one has a thick accent line (components.css .tabs).
export function TopTabs<T extends string>({ tabs, active, onChange }: { tabs: readonly { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: p.line }}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.id === active }}
          onPress={() => onChange(tab.id)}
          style={{ flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: tab.id === active ? p.accent : "transparent", marginBottom: -1 }}
        >
          <Text style={{ color: p.ink, fontSize: 14, fontWeight: tab.id === active ? "600" : "500" }}>{t.t(tab.label)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// A title of a group, with its total at the right (components.css .section-label).
export function SectionLabel({ title, right, first = false }: { title: string; right?: ReactNode; first?: boolean }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 30, marginTop: first ? 12 : 23, marginBottom: 14 }}>
      <Text style={{ color: p.ink, fontSize: 17 }}>{t.t(title)}</Text>
      {right}
    </View>
  );
}

// The coloured square with an icon (components.css .badge): a light tint of the colour, the icon in it.
export function ToneBadge({ icon, color, size = 48, iconSize, radius = 9 }: { icon: string; color: string; size?: number; iconSize?: number; radius?: number }) {
  const p = usePalette();
  return (
    <View style={{ width: size, height: size, borderRadius: radius, alignItems: "center", justifyContent: "center", backgroundColor: mix(color, p.bg, 0.12) }}>
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.52)} color={color} />
    </View>
  );
}

// A thin outline with a fill set a little inside it, like a charging cell (components.css .meter).
export function Meter({ percent, owed = false, height = 12 }: { percent: number; owed?: boolean; height?: number }) {
  const p = usePalette();
  const tone = owed ? mix(p.negative, p.bg, 0.78) : p.positive;
  const share = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ flex: 1, minWidth: 24, height, padding: 2, borderWidth: 1.5, borderColor: alpha(tone, 0.75), borderRadius: 999 }}>
      <View style={{ width: `${share}%`, height: "100%", borderRadius: 999, backgroundColor: tone }} />
    </View>
  );
}

// A round action of a sheet: a tinted tile with an icon and its name under it.
export function ActionTile({ icon, label, tone, onPress }: { icon: string; label: string; tone: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ width: "33.33%", alignItems: "center", gap: 8, paddingBottom: 30 }}>
      <View style={{ width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: alpha(tone, 0.18) }}>
        <Icon name={icon} size={26} color={tone} />
      </View>
      <Text style={{ color: p.ink, fontSize: 14, lineHeight: 17, textAlign: "center" }}>{t.t(label)}</Text>
    </Pressable>
  );
}

// The grid of action tiles of a sheet (accounts.css .sheet-actions).
export function ActionGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", paddingTop: 24, paddingHorizontal: 4, marginBottom: -8 }}>{children}</View>;
}

export function MoneyText({ text, value, size = 18, style }: { text: string; value: number; size?: number; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const color = value > 0 ? p.positiveInk : value < 0 ? p.negativeInk : p.muted;
  return <Text style={[{ color, fontSize: size, fontVariant: ["tabular-nums"] }, style]}>{text}</Text>;
}

// The floating "Add" button of the operations tab (css/fab.css): a tinted square with a plus; at the
// top of the list its name shows next to the plus, scrolled it is only the plus. It sits above the
// tab bar (the scene ends there) at the design's gap from the edge.
export function Fab({ label, collapsed, onPress }: { label: string; collapsed: boolean; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.t("New operation")}
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        right: chrome.edgeGap,
        bottom: chrome.edgeGap,
        height: chrome.fab,
        paddingHorizontal: 18,
        borderRadius: 22,
        flexDirection: "row",
        alignItems: "center",
        gap: collapsed ? 0 : 10,
        backgroundColor: p.tint,
        elevation: 3,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {collapsed ? null : <Text style={{ color: p.ink, fontSize: 19, fontWeight: "600" }}>{t.t(label)}</Text>}
      <Icon name="plus" size={26} color={p.ink} />
    </Pressable>
  );
}

// The two sums of the categories and statistics tabs (components.css .sum-tabs): the chosen one is
// lifted, the other one is muted; expenses in red, incomes in green.
// `tinted` is the statistics look: the open tab takes the colour of its type.
export function SumTabs({ active, expense, income, onChange, tinted = false }: { active: "expense" | "income"; expense: string; income: string; onChange: (type: "expense" | "income") => void; tinted?: boolean }) {
  const p = usePalette();
  const t = useT();
  const tab = (type: "expense" | "income", label: string, text: string) => {
    const on = active === type;
    const tint = type === "expense" ? p.negative : p.positive;
    return (
      <Pressable
        key={type}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(type)}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: on && tinted ? tint : "transparent", backgroundColor: on ? (tinted ? mix(tint, p.bg, 0.16) : p.bg) : "transparent" }}
      >
        <Text style={{ color: on ? p.ink : p.muted, fontSize: 14 }}>{t.t(label)}</Text>
        <Text style={{ color: type === "expense" ? p.negativeInk : p.positiveInk, opacity: on ? 1 : 0.6, fontSize: 21, marginTop: 7 }} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
    );
  };
  return <View style={{ flexDirection: "row", gap: 5, backgroundColor: p.nav, borderRadius: 13, marginHorizontal: 16, marginTop: 9, marginBottom: 18, padding: 8, minHeight: 90 }}>{[tab("expense", "Expenses", expense), tab("income", "Incomes", income)]}</View>;
}

// A tile of a category (categories.css .cat-tile): badge, name, the sum of the period.
export function CategoryTile({ icon, color, name, figure, tone, onPress, onLongPress, width = "48.5%" }: { icon: string; color: string; name: string; figure: string; tone: "pos" | "neg" | "muted"; onPress: () => void; onLongPress?: () => void; width?: `${number}%` }) {
  const p = usePalette();
  const ink = tone === "pos" ? p.positiveInk : tone === "neg" ? p.negativeInk : p.muted;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ width, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6, paddingHorizontal: 7, borderWidth: 1, borderColor: p.line, borderRadius: 12, backgroundColor: pressed ? p.soft : p.key })}
    >
      <ToneBadge icon={icon} color={color} size={42} iconSize={23} radius={10} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 14, marginBottom: 3 }}>
          {name}
        </Text>
        <Text numberOfLines={1} style={{ color: ink, fontSize: 13 }}>
          {figure}
        </Text>
      </View>
    </Pressable>
  );
}
