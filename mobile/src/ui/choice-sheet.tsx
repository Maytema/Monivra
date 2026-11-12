// "Select type" (as filmed in the reference): a bottom sheet with its title on the left and rows of a
// tinted icon tile, a bold name with a description under it, and a radio mark on the right; thin lines
// between the rows. A tap picks the row and closes the sheet.
import { Pressable, Text, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { mix } from "./theme.ts";

export interface Choice<T extends string> {
  value: T;
  label: string;
  text: string;
  icon: string;
  color: string;
}

function ChoiceSheet<T extends string>({ title, choices, value, onPick }: { title: string; choices: readonly Choice<T>[]; value: T; onPick: (v: T) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ paddingBottom: 4 }}>
      <Text style={{ color: p.ink, fontSize: 24, fontWeight: "600", marginLeft: 8, marginTop: 6, marginBottom: 18 }}>{t.t(title)}</Text>
      {choices.map((c, i) => {
        const chosen = c.value === value;
        return (
          <Pressable
            key={c.value}
            accessibilityRole="radio"
            accessibilityLabel={t.t(c.label)}
            accessibilityState={{ checked: chosen }}
            onPress={() => {
              close();
              onPick(c.value);
            }}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: p.line, backgroundColor: pressed ? p.soft : "transparent" })}
          >
            <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: mix(c.color, p.sheet, 0.14) }}>
              <Icon name={c.icon} size={26} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600" }}>{t.t(c.label)}</Text>
              <Text style={{ color: p.inkSoft, fontSize: 14, lineHeight: 16, marginTop: 4, letterSpacing: 0.2 }}>{t.t(c.text)}</Text>
            </View>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: chosen ? 2.5 : 2, borderColor: chosen ? p.accent : p.inkSoft, alignItems: "center", justifyContent: "center", marginHorizontal: 6 }}>
              {chosen ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export const openChoiceSheet = <T extends string>(title: string, choices: readonly Choice<T>[], value: T, onPick: (v: T) => void): number => sheets.open(<ChoiceSheet title={title} choices={choices} value={value} onPick={onPick} />);
