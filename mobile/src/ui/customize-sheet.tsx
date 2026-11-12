// "Customize icon" (js/ui/icon-picker.js): a dialog with a preview, the choice of an icon and of a
// colour, random choices and Complete. The icon list and the colour page are pages over the whole
// screen; each has a gear that opens its list settings.
import { useState } from "react";
import { Dimensions, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { appStore, useLedger, usePalette, useT } from "./app-context.tsx";
import { PrimaryPill, TextButton } from "./calendar-sheet.tsx";
import { isHex, shadesOf } from "./color-tools.ts";
import { ColorWheel } from "./color-wheel.tsx";
import { DialogActions } from "./dialogs.tsx";
import { ICON_GROUPS, PALETTE, QUICK_COLORS } from "./icon-groups.ts";
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

function Preview({ look, size, tall = false }: { look: Look; size: number; tall?: boolean }) {
  const p = usePalette();
  return (
    <View
      style={{
        height: tall ? 75 : 60,
        borderRadius: tall ? 20 : 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: tall ? 1 : 0,
        borderColor: p.line,
        backgroundColor: mix(look.color, p.dark ? p.sheet : "#fffafe", tall ? 0.17 : 0.18),
      }}
    >
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
    <View style={{ height: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Back")} onPress={close} style={{ width: 34, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="left" size={23} color={p.ink} />
      </Pressable>
      <Text style={{ color: p.ink, fontSize: 23 }}>{t.t(title)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t(gearLabel)} onPress={gear} style={{ width: 34, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="gear" size={23} color={p.ink} />
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

function IconPage({ value, onPick }: { value: string; onPick: (icon: string) => void }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const close = useCloseLayer();
  const flags = (data.settings.iconPickerExclusions as Flags | undefined) ?? {};
  const used = usedBy(data, "icon", flags, "iconAccounts", "iconCategories");
  return (
    <View style={{ flex: 1 }}>
      <Head title="Select an icon" gear={() => sheets.open(<ListSettings mode="icon" />, "dialog")} gearLabel="Icon selection settings" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 28 }}>
        {ICON_GROUPS.map(([title, keys]) => {
          const shown = keys.filter((k) => k === value || !used.has(k.toLowerCase()));
          if (!shown.length) return null;
          return (
            <View key={title} style={{ marginTop: 5, marginBottom: 13 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 9, marginBottom: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
                <Text style={{ color: p.ink, fontSize: 13 }}>{t.t(title)}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {shown.map((k) => (
                  <View key={k} style={{ width: "16.666%", padding: 1.5 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={k}
                      onPress={() => {
                        close();
                        onPick(k);
                      }}
                      style={{ height: 44, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: k === value ? p.accent : p.line, backgroundColor: k === value ? mix(p.accent, p.bg, 0.14) : "transparent" }}
                    >
                      <Icon name={k} size={25} color={k === value ? p.accentInk : p.inkSoft} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Swatch({ color, picked, size, square = false, onPress }: { color: string; picked: boolean; size: number; square?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={color} onPress={onPress} style={{ width: size, height: size, borderRadius: square ? 10 : size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }}>
      {picked ? <Icon name="check" size={16} color="#ffffff" /> : null}
    </Pressable>
  );
}

function ColorPage({ look, onPick }: { look: Look; onPick: (color: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [color, setColor] = useState(look.color.toLowerCase());
  const [hex, setHex] = useState(look.color.toLowerCase());
  const choose = (c: string) => {
    setColor(c.toLowerCase());
    setHex(c.toLowerCase());
  };
  const same = (c: string) => c.toLowerCase() === color;
  const wheel = Math.min(280, Dimensions.get("window").width - 56);
  return (
    <View style={{ flex: 1 }}>
      <Head title="Choose color" gear={() => sheets.open(<ListSettings mode="color" />, "dialog")} gearLabel="Color list customization" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
          <Preview look={{ icon: look.icon, color }} size={32} />
        </View>
        <ColorWheel color={color} size={wheel} onChange={choose} />
        <View style={{ height: 18 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingHorizontal: 20, marginBottom: 14 }}>
          {QUICK_COLORS.map((c) => (
            <Swatch key={c} color={c} size={44} picked={same(c)} onPress={() => choose(c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingHorizontal: 20, marginBottom: 14 }}>
          {shadesOf(color).map((c) => (
            <Swatch key={c} color={c} size={34} square picked={same(c)} onPress={() => choose(c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 14, height: 46, borderRadius: 12, backgroundColor: p.key }}>
          <Text style={{ color: p.inkSoft, fontSize: 13 }}>HEX</Text>
          <TextInput
            accessibilityLabel={t.t("Color code")}
            value={hex}
            maxLength={7}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(v) => {
              setHex(v);
              const code = v.startsWith("#") ? v : "#" + v;
              if (isHex(code)) setColor(code.toLowerCase());
            }}
            style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "500", fontFamily: "monospace", padding: 0 }}
          />
        </View>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          close();
          onPick(color);
        }}
        style={{ marginHorizontal: 16, marginTop: 7, marginBottom: 15, minHeight: 47, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}
      >
        <Text style={{ color: p.onAccent, fontSize: 16, fontWeight: "600" }}>{t.t("Complete")}</Text>
      </Pressable>
    </View>
  );
}

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
  const action = (icon: string, label: string, onPress: () => void, style: object) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 13, minHeight: 52, backgroundColor: pressed ? p.soft : p.key }, style]}>
      <View style={{ width: 24, alignItems: "center" }}>
        <Icon name={icon} size={24} color={p.inkSoft} />
      </View>
      <Text style={{ flex: 1, color: p.ink, fontSize: 13, lineHeight: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <Preview look={look} size={34} tall />
      <Text style={{ color: p.ink, fontSize: 24, textAlign: "center", marginTop: 17, marginBottom: 18 }}>{t.t("Customize icon")}</Text>
      <View style={{ flexDirection: "row", gap: 4, marginBottom: 15 }}>
        <View style={{ flex: 1 }}>{action("smile", "Choose an icon", () => sheets.open(<IconPage value={look.icon} onPick={(icon) => setLook((l) => ({ ...l, icon }))} />, "full"), { minHeight: 57, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 })}</View>
        <View style={{ flex: 1 }}>{action("palette", "Choose color", () => sheets.open(<ColorPage look={look} onPick={(color) => setLook((l) => ({ ...l, color }))} />, "full"), { minHeight: 57, borderTopRightRadius: 16, borderBottomRightRadius: 16 })}</View>
      </View>
      <View style={{ gap: 3, borderRadius: 17, overflow: "hidden" }}>
        {action("gear", "✦ Setting random selection", () => sheets.open(<RandomSettings />, "dialog"), { minHeight: 48 })}
        {action("smile", "✦ Random icon", () => random("icon"), { minHeight: 48 })}
        {action("palette", "✦ Random color", () => random("color"), { minHeight: 48 })}
        {action("spark", "Random icon and color", () => random("both"), { minHeight: 48 })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          close();
          onDone(look);
        }}
        style={{ marginTop: 26, minHeight: 47, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}
      >
        <Text style={{ color: p.onAccent, fontSize: 16, fontWeight: "600" }}>{t.t("Complete")}</Text>
      </Pressable>
    </View>
  );
}

export const openCustomize = (start: Look, onDone: (look: Look) => void): number => sheets.open(<Customize start={start} onDone={onDone} />, "dialog");
