// "Customize icon" (js/ui/icon-picker.js): a preview, the choice of an icon and of a color, random
// choices, and Complete. The icon list and the color page are sheets over this dialog.
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import { PrimaryPill } from "./calendar-sheet.tsx";
import { isHex, shadesOf } from "./color-tools.ts";
import { ICON_GROUPS, PALETTE, QUICK_COLORS } from "./icon-groups.ts";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { mix } from "./theme.ts";

export interface Look {
  icon: string;
  color: string;
}

function Preview({ look, size = 72 }: { look: Look; size?: number }) {
  const p = usePalette();
  return (
    <View style={{ alignSelf: "center", width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: mix(look.color, p.bg, 0.17) }}>
      <Icon name={look.icon} size={size / 2} color={look.color} />
    </View>
  );
}

function Head({ title }: { title: string }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 52 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Back")} onPress={close} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <Icon name="left" size={23} color={p.ink} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 22, fontWeight: "500", marginRight: 48 }}>{t.t(title)}</Text>
    </View>
  );
}

function IconList({ value, onPick }: { value: string; onPick: (icon: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ maxHeight: 560 }}>
      <Head title="Select an icon" />
      <ScrollView>
        {ICON_GROUPS.map(([title, keys]) => (
          <View key={title}>
            <Text style={{ color: p.muted, fontSize: 14, paddingTop: 14, paddingBottom: 8, paddingHorizontal: 4 }}>{t.t(title)}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {keys.map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={k}
                  onPress={() => {
                    close();
                    onPick(k);
                  }}
                  style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: k === value ? p.accent : p.line, backgroundColor: k === value ? mix(p.accent, p.bg, 0.14) : "transparent" }}
                >
                  <Icon name={k} size={25} color={p.ink} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Swatch({ color, picked, size, onPress }: { color: string; picked: boolean; size: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={color} onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      {picked ? <Icon name="check" size={size / 2.4} color="#ffffff" /> : null}
    </Pressable>
  );
}

function ColorPage({ look, onPick }: { look: Look; onPick: (color: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [color, setColor] = useState(look.color);
  const [hex, setHex] = useState(look.color);
  const choose = (c: string) => {
    setColor(c.toLowerCase());
    setHex(c.toLowerCase());
  };
  const same = (c: string) => c.toLowerCase() === color.toLowerCase();
  return (
    <View style={{ maxHeight: 620 }}>
      <Head title="Choose color" />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Preview look={{ icon: look.icon, color }} />
        <Text style={{ color: p.muted, fontSize: 14, paddingTop: 16, paddingBottom: 8 }}>{t.t("Colors")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {PALETTE.map((c) => (
            <Swatch key={c} color={c} size={40} picked={same(c)} onPress={() => choose(c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 18 }}>
          {QUICK_COLORS.map((c) => (
            <Swatch key={c} color={c} size={44} picked={same(c)} onPress={() => choose(c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 16 }}>
          {shadesOf(color).map((c) => (
            <Swatch key={c} color={c} size={34} picked={same(c)} onPress={() => choose(c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 18 }}>
          <Text style={{ color: p.muted, fontSize: 14 }}>HEX</Text>
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
            style={{ flex: 1, borderWidth: 1, borderColor: p.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: p.ink, fontSize: 16 }}
          />
        </View>
      </ScrollView>
      <View style={{ alignItems: "flex-end", paddingTop: 12 }}>
        <PrimaryPill
          label="Complete"
          onPress={() => {
            close();
            onPick(color);
          }}
        />
      </View>
    </View>
  );
}

function Customize({ start, onDone }: { start: Look; onDone: (look: Look) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [look, setLook] = useState(start);
  const random = (what: "icon" | "color" | "both") => {
    const icons = ICON_GROUPS.flatMap(([, keys]) => keys);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
    setLook((l) => ({ icon: what === "color" ? l.icon : pick(icons), color: what === "icon" ? l.color : pick(PALETTE) }));
  };
  const action = (icon: string, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: mix(p.accent, p.bg, 0.12) }}>
        <Icon name={icon} size={25} color={p.accentInk} />
      </View>
      <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <Preview look={look} size={80} />
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginVertical: 12 }}>{t.t("Customize icon")}</Text>
      {action("smile", "Choose an icon", () => sheets.open(<IconList value={look.icon} onPick={(icon) => setLook((l) => ({ ...l, icon }))} />))}
      {action("palette", "Choose color", () => sheets.open(<ColorPage look={look} onPick={(color) => setLook((l) => ({ ...l, color }))} />))}
      <View style={{ height: 1, backgroundColor: p.line, marginVertical: 6 }} />
      {action("smile", "Random icon", () => random("icon"))}
      {action("palette", "Random color", () => random("color"))}
      {action("spark", "Random icon and color", () => random("both"))}
      <View style={{ alignItems: "flex-end", paddingTop: 10 }}>
        <PrimaryPill
          label="Complete"
          onPress={() => {
            close();
            onDone(look);
          }}
        />
      </View>
    </View>
  );
}

export const openCustomize = (start: Look, onDone: (look: Look) => void): number => sheets.open(<Customize start={start} onDone={onDone} />, "dialog");
