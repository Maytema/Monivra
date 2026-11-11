// The sheet to choose a currency (js/ui/currency-picker.js): the codes of all currencies, the chosen one marked.
import { Pressable, Text, View } from "react-native";
import { CURRENCIES } from "../domain/currencies.ts";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

export const openCurrencySheet = (value: string, onPick: (code: string) => void): number => sheets.open(<CurrencySheet value={value} onPick={onPick} />);

function CurrencySheet({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 20, textAlign: "center", marginTop: 6, marginBottom: 12 }}>{t.t("Currency")}</Text>
      {CURRENCIES.map((c) => (
        <Pressable
          key={c.code}
          accessibilityRole="radio"
          accessibilityState={{ selected: c.code === value }}
          onPress={() => {
            onPick(c.code);
            close();
          }}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? p.soft : "transparent" })}
        >
          <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{c.code}</Text>
          {c.code === value ? <Icon name="check" size={20} color={p.accentInk} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
