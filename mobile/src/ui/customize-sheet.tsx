// "Customize icon" (js/ui/icon-picker.js): a dialog with a preview, the choice of an icon and of a
// colour, random choices and Complete. The icon list and the colour page are pages over the whole
// screen; each has a gear that opens its list settings.
import { memo, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { appStore, useLedger, usePalette, useT } from "./app-context.tsx";
import { PrimaryPill, TextButton } from "./calendar-sheet.tsx";
import { cleanHexInput, parseHex, prettyShades, shadeRow } from "./color-tools.ts";
import { ColorWheel } from "./color-wheel.tsx";
import { DialogActions } from "./dialogs.tsx";
import { ICON_GROUPS, PALETTE } from "./icon-groups.ts";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { mix } from "./theme.ts";

export interface Look {
  icon: string;
  color: string;
}

type Flags = Record<string, boolean>;
type SettingsKey = "randomSelectionFlags" | "iconPickerExclusions" | "colorPickerExclusions";

const setFlags = (key: SettingsKey, value: Flags) => appStore().run((tx) => (tx.setSettings({ [key]: value }), true));

// Icons and colours the accounts and categories already use, for the lists that leave them out.
function usedBy(data: ReturnType<typeof useLedger>, what: "icon" | "color", flags: Flags, accounts: string, categories: string): Set<string> {
  const used = new Set<string>();
  if (flags[accounts]) for (const a of data.accounts) used.add(String(a[what] || "").toLowerCase());
  if (flags[categories]) for (const c of data.categories) used.add(String(c[what] || "").toLowerCase());
  return used;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => onChange(!on)}
      style={{ width: 48, height: 27, borderRadius: 25, borderWidth: 2, borderColor: on ? p.accent : p.muted, backgroundColor: on ? p.accent : mix(p.ink, p.bg, 0.14), padding: 3, justifyContent: "center", alignItems: on ? "flex-end" : "flex-start" }}
    >
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: on ? "#ffffff" : p.muted }} />
    </Pressable>
  );
}

// The preview of the icon in its colour (the dialog and the colour page): the colour at 17 % over the
// panel, a thin line around it.
function Preview({ look, size, height }: { look: Look; size: number; height: number }) {
  const p = usePalette();
  return (
    <View style={{ height, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: p.line, backgroundColor: mix(look.color, p.dark ? p.sheet : "#fffafe", 0.17) }}>
      <Icon name={look.icon} size={size} color={look.color} />
    </View>
  );
}

// The head of a page: back, the title, the gear.
function Head({ title, gear, gearLabel }: { title: string; gear: () => void; gearLabel: string }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Back")} onPress={close} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="back" size={24} color={p.ink} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 23 }}>{t.t(title)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t(gearLabel)} onPress={gear} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="gear" size={24} color={p.ink} />
      </Pressable>
    </View>
  );
}

// "Icon list customization" / "Colors list customization": leave out what is already in use.
function ListSettings({ mode }: { mode: "icon" | "color" }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const key: SettingsKey = mode === "color" ? "colorPickerExclusions" : "iconPickerExclusions";
  const [working, setWorking] = useState<Flags>({ ...((data.settings[key] as Flags | undefined) ?? {}) });
  const names = mode === "color" ? (["colorAccounts", "colorCategories"] as const) : (["iconAccounts", "iconCategories"] as const);
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 21, lineHeight: 25 }}>{t.t(mode === "color" ? "Colors list customization" : "Icon list customization")}</Text>
      <Text style={{ color: p.ink, fontSize: 12, lineHeight: 17, marginTop: 11, marginBottom: 14 }}>
        {t.t(mode === "color" ? "With this setting, you can exclude colors selected for current accounts and categories from the colors list." : "With this setting, you can exclude icons selected for current accounts and categories from the icons list.")}
      </Text>
      <View style={{ backgroundColor: p.key, borderRadius: 14, overflow: "hidden" }}>
        {names.map((name, i) => (
          <View key={name} style={{ minHeight: 57, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9, borderTopWidth: i ? 1 : 0, borderTopColor: p.line }}>
            <Text style={{ flex: 1, color: p.ink, fontSize: 12 }}>{t.t(i ? "Exclude selected in categories" : "Exclude selected in accounts")}</Text>
            <Switch on={!!working[name]} label={name} onChange={(v) => setWorking({ ...working, [name]: v })} />
          </View>
        ))}
      </View>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="Complete"
          onPress={() => {
            setFlags(key, working);
            close();
          }}
        />
      </DialogActions>
    </View>
  );
}

// "Setting random selection": what the random icon and colour must leave out.
function RandomSettings() {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const [working, setWorking] = useState<Flags>({ iconAccounts: false, iconCategories: false, colorAccounts: false, colorCategories: false, ...((data.settings.randomSelectionFlags as Flags | undefined) ?? {}) });
  const card = (names: readonly [string, string]) => (
    <View style={{ backgroundColor: p.key, borderRadius: 16, overflow: "hidden" }}>
      {names.map((name, i) => (
        <View key={name} style={{ minHeight: 49, paddingVertical: 6, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: p.line }}>
          <Text style={{ flex: 1, color: p.ink, fontSize: 12 }}>{t.t(i ? "Exclude selected in categories" : "Exclude selected in accounts")}</Text>
          <Switch on={!!working[name]} label={name} onChange={(v) => setWorking({ ...working, [name]: v })} />
        </View>
      ))}
    </View>
  );
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 21, lineHeight: 25, marginBottom: 11 }}>{t.t("Setting random selection")}</Text>
      <Text style={{ color: p.ink, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>{t.t("With this setting, you can exclude icons and colors selected for current accounts and categories from random selection.")}</Text>
      <Text style={{ color: p.ink, fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 7 }}>{t.t("Icons")}</Text>
      {card(["iconAccounts", "iconCategories"])}
      <Text style={{ color: p.ink, fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 7 }}>{t.t("Colors")}</Text>
      {card(["colorAccounts", "colorCategories"])}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="Complete"
          onPress={() => {
            setFlags("randomSelectionFlags", working);
            close();
          }}
        />
      </DialogActions>
    </View>
  );
}

// The icon list (as filmed in the reference): groups under a title with lines to both edges of the
// screen, cells of 44 dp every 64 dp from the left, as many in a row as fit. A virtualized list of rows,
// so the page opens at once although it holds hundreds of icons.
const CELL = 44;
const PITCH = 64;
const LEFT = 10;
type IconRow = { kind: "title"; title: string } | { kind: "icons"; key: string; icons: string[] };

const IconCell = memo(function IconCell({ icon, chosen, onPick }: { icon: string; chosen: boolean; onPick: (icon: string) => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon}
      accessibilityState={{ selected: chosen }}
      onPress={() => onPick(icon)}
      style={({ pressed }) => ({ width: CELL, height: CELL, marginRight: PITCH - CELL, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: chosen ? p.accent : p.line, backgroundColor: chosen ? mix(p.accent, p.bg, 0.14) : pressed ? p.soft : "transparent" })}
    >
      <Icon name={icon} size={26} color={chosen ? p.accentInk : p.ink} />
    </Pressable>
  );
});

function IconPage({ value, onPick }: { value: string; onPick: (icon: string) => void }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const { width } = useWindowDimensions();
  const perRow = Math.max(1, Math.floor((width - LEFT + (PITCH - CELL)) / PITCH));
  const exclusions = data.settings.iconPickerExclusions as Flags | undefined;
  const rows = useMemo(() => {
    const used = usedBy(data, "icon", exclusions ?? {}, "iconAccounts", "iconCategories");
    const out: IconRow[] = [];
    for (const [title, keys] of ICON_GROUPS) {
      const shown = keys.filter((k) => k === value || !used.has(k.toLowerCase()));
      if (!shown.length) continue;
      out.push({ kind: "title", title });
      for (let i = 0; i < shown.length; i += perRow) out.push({ kind: "icons", key: `${title}:${i}`, icons: shown.slice(i, i + perRow) });
    }
    return out;
  }, [data, exclusions, value, perRow]);
  const pick = (icon: string) => {
    close();
    onPick(icon);
  };
  return (
    <View style={{ flex: 1 }}>
      <Head title="Select an icon" gear={() => sheets.open(<ListSettings mode="icon" />, "dialog")} gearLabel="Icon selection settings" />
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "title" ? "t:" + r.title : r.key)}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) =>
          item.kind === "title" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14, marginBottom: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: p.ink }} />
              <Text style={{ color: p.ink, fontSize: 20 }}>{t.t(item.title)}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: p.ink }} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", paddingLeft: LEFT, height: PITCH }}>
              {item.icons.map((icon) => (
                <IconCell key={icon} icon={icon} chosen={icon === value} onPick={pick} />
              ))}
            </View>
          )
        }
      />
    </View>
  );
}

// The colour page: our wheel (the owner keeps it rather than the reference's grid of tiles), one row of
// shades of the chosen colour that fills the width, and the HEX code.
function ColorPage({ look, onPick }: { look: Look; onPick: (color: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const { width } = useWindowDimensions();
  const [color, setColor] = useState(look.color.toLowerCase());
  // The shades follow the colour taken on the wheel or typed, not a shade tapped in the row.
  const [base, setBase] = useState(color);
  const [hex, setHex] = useState(color.slice(1));
  const [focused, setFocused] = useState(false);
  const [onWheel, setOnWheel] = useState(false);
  const scroller = useRef<{ scrollToEnd(o: { animated: boolean }): void } | null>(null);
  const typed = parseHex(hex);
  const wrong = hex.length > 0 && !typed && !(focused && hex.length < 6 && hex.length !== 3);
  const choose = (c: string, fromRow = false) => {
    setColor(c);
    if (!fromRow) setBase(c);
    setHex(c.slice(1));
  };
  const row = shadeRow(width);
  const shades = useMemo(() => prettyShades(base, row.count), [base, row.count]);
  const wheel = Math.min(280, width - 56);
  return (
    <View style={{ flex: 1 }}>
      <Head title="Choose color" gear={() => sheets.open(<ListSettings mode="color" />, "dialog")} gearLabel="Color list customization" />
      <ScrollView ref={(r: { scrollToEnd(o: { animated: boolean }): void } | null) => void (scroller.current = r)} scrollEnabled={!onWheel} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={{ marginHorizontal: 24, marginBottom: 18 }}>
          <Preview look={{ icon: look.icon, color }} size={32} height={62} />
        </View>
        <ColorWheel color={color} size={wheel} onChange={(c) => choose(c)} onHold={setOnWheel} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 22, marginBottom: 18 }}>
          {shades.map((c) => {
            const picked = c === color;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={c}
                accessibilityState={{ selected: picked }}
                onPress={() => choose(c, true)}
                style={{ width: row.size, height: row.size, borderRadius: row.size / 2, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: picked ? 3 : 1, borderColor: picked ? p.ink : "rgba(0,0,0,0.12)" }}
              >
                {picked ? <Icon name="check" size={18} color={parseInt(c.slice(1), 16) > 0xa0a0a0 ? "#222222" : "#ffffff"} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 20, paddingHorizontal: 14, height: 48, borderRadius: 12, backgroundColor: p.key, borderWidth: wrong ? 1.5 : 1, borderColor: wrong ? p.negative : p.line }}>
          <Text style={{ color: p.inkSoft, fontSize: 13, marginRight: 12 }}>HEX</Text>
          <Text style={{ color: p.ink, fontSize: 16, fontWeight: "500", fontFamily: "monospace" }}>#</Text>
          <TextInput
            accessibilityLabel={t.t("Color code")}
            value={hex}
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="visible-password"
            returnKeyType="done"
            onFocus={() => {
              setFocused(true);
              // The field comes up above the keyboard once the window has shortened.
              setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 350);
            }}
            onBlur={() => {
              setFocused(false);
              // An unfinished code goes back to the colour that is shown.
              if (!parseHex(hex)) setHex(color.slice(1));
            }}
            onChangeText={(v) => {
              const clean = cleanHexInput(v);
              setHex(clean);
              const code = parseHex(clean);
              if (code) {
                setColor(code);
                setBase(code);
              }
            }}
            style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "500", fontFamily: "monospace", paddingVertical: 0, paddingLeft: 2 }}
          />
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: color, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
        </View>
        {wrong ? <Text style={{ color: p.negative, fontSize: 12, marginHorizontal: 24, marginTop: 6 }}>{t.t("Enter 6 characters: 0–9 and A–F")}</Text> : null}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          close();
          onPick(color);
        }}
        style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 8, marginBottom: 14, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 })}
      >
        <Text style={{ color: p.onAccent, fontSize: 17, fontWeight: "600" }}>{t.t("Complete")}</Text>
      </Pressable>
    </View>
  );
}

// "Customize icon" (as filmed): the preview, the title, two cells side by side, a column of the random
// choices, Complete.
function Customize({ start, onDone }: { start: Look; onDone: (look: Look) => void }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const [look, setLook] = useState(start);
  const random = (what: "icon" | "color" | "both") => {
    const flags = (data.settings.randomSelectionFlags as Flags | undefined) ?? {};
    const usedIcons = usedBy(data, "icon", flags, "iconAccounts", "iconCategories");
    const usedColors = usedBy(data, "color", flags, "colorAccounts", "colorCategories");
    const icons = ICON_GROUPS.flatMap(([, keys]) => keys).filter((x) => !usedIcons.has(x.toLowerCase()));
    const colors = PALETTE.filter((x) => !usedColors.has(x.toLowerCase()));
    if ((what !== "color" && !icons.length) || (what !== "icon" && !colors.length)) return void import("./dialogs.tsx").then((d) => d.toast("No icons or colors available"));
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
    setLook((l) => ({ icon: what === "color" ? l.icon : pick(icons), color: what === "icon" ? l.color : pick(colors) }));
  };
  const cell = p.dark ? p.key : "#faf8ff";
  // An icon with the little sparkle of a random choice beside it.
  const glyph = (icon: string, spark: boolean) => (
    <View style={{ width: spark ? 38 : 26, height: 26, flexDirection: "row" }}>
      <Icon name={icon} size={26} color={p.ink} />
      {spark ? <Icon name="spark" size={12} color={p.ink} /> : null}
    </View>
  );
  const action = (icon: string, spark: boolean, label: string, onPress: () => void, corners: object) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 52, borderRadius: 3, backgroundColor: pressed ? p.soft : cell }, corners]}>
      {glyph(icon, spark)}
      <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 14 }}>{t.t(label)}</Text>
    </Pressable>
  );
  const choice = (icon: string, label: string, onPress: () => void, corners: object) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 63, borderRadius: 4, backgroundColor: pressed ? p.soft : cell }, corners]}>
      <Icon name={icon} size={26} color={p.ink} />
      <Text numberOfLines={2} style={{ flex: 1, color: p.ink, fontSize: 14, lineHeight: 20 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <Preview look={look} size={34} height={61} />
      <Text style={{ color: p.ink, fontSize: 24, textAlign: "center", marginTop: 20, marginBottom: 20 }}>{t.t("Customize icon")}</Text>
      <View style={{ flexDirection: "row", gap: 4, marginBottom: 16 }}>
        {choice("smile", "Choose an icon", () => sheets.open(<IconPage value={look.icon} onPick={(icon) => setLook((l) => ({ ...l, icon }))} />, "full"), { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 })}
        {choice("palette", "Choose color", () => sheets.open(<ColorPage look={look} onPick={(color) => setLook((l) => ({ ...l, color }))} />, "full"), { borderTopRightRadius: 16, borderBottomRightRadius: 16 })}
      </View>
      <View style={{ gap: 4 }}>
        {action("gear", true, "Setting random selection", () => sheets.open(<RandomSettings />, "dialog"), { borderTopLeftRadius: 16, borderTopRightRadius: 16 })}
        {action("smile", true, "Random icon", () => random("icon"), {})}
        {action("palette", true, "Random color", () => random("color"), {})}
        {action("spark", false, "Random icon and color", () => random("both"), { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          close();
          onDone(look);
        }}
        style={({ pressed }) => ({ marginTop: 28, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 })}
      >
        <Text style={{ color: p.onAccent, fontSize: 16, fontWeight: "500" }}>{t.t("Complete")}</Text>
      </Pressable>
    </View>
  );
}

export const openCustomize = (start: Look, onDone: (look: Look) => void): number => sheets.open(<Customize start={start} onDone={onDone} />, "dialog");
