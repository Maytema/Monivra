// The sheet to choose a currency (js/ui/currency-picker.js): a search field (code, sign, name or country), the
// order of the list, and sections: used first, major, other. The chosen currency is marked.
import { memo, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { CURRENCIES } from "../domain/currencies.ts";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { byText, currencyName, currencySign, searchCurrencies, sortKey } from "./currency-names.ts";
import { sheets, useCloseLayer } from "./sheets.tsx";

const POPULAR = ["USD", "EUR", "GBP", "CNY", "JPY", "CHF", "CAD", "AUD"];
const SORTS = [
  ["groups", "Used first"],
  ["name", "By name"],
  ["code", "By code"],
] as const;

export const openCurrencySheet = (value: string, onPick: (code: string) => void): number => sheets.open(<CurrencySheet value={value} onPick={onPick} />, "sheet", { scrolls: true });

function CurrencySheet({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const close = useCloseLayer();
  const [text, setText] = useState("");
  const by = (data.settings.currencySort as string) || "groups";
  const sections = useMemo((): [string, string[]][] => {
    if (text.trim()) return [["", searchCurrencies(text, t.locale)]];
    const key = (code: string) => (by === "code" ? code.toLowerCase() : sortKey(code, t.locale));
    const all = CURRENCIES.map((c) => c.code).sort((a, b) => byText(key(a), key(b)));
    if (by !== "groups") {
      const letters = new Map<string, string[]>();
      for (const code of all) {
        const first = key(code).charAt(0).toUpperCase();
        letters.set(first, [...(letters.get(first) ?? []), code]);
      }
      return [...letters];
    }
    const used = new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...data.categories.map((c) => c.currency)]);
    return [
      ["Currencies used", all.filter((c) => used.has(c))],
      ["Major currencies", POPULAR.filter((c) => !used.has(c))],
      ["Other currencies", all.filter((c) => !used.has(c) && !POPULAR.includes(c))],
    ];
  }, [text, by, t.locale, data.settings.currency, data.accounts, data.categories]);
  const shown = sections.filter(([, codes]) => codes.length);
  // One flat, virtualized list: the headings and the rows; only what is on the screen is drawn.
  const rows = useMemo(() => shown.flatMap(([title, codes]): Row[] => [...(title ? [{ kind: "head" as const, title }] : []), ...codes.map((code) => ({ kind: "code" as const, code }))]), [shown]);
  const pick = (code: string) => {
    close();
    onPick(code);
  };
  return (
    <View style={{ maxHeight: 640 }}>
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{t.t("Select currency")}</Text>
      <TextInput value={text} onChangeText={setText} placeholder={t.t("Code, name or country")} placeholderTextColor={p.muted} autoCorrect={false} style={{ borderWidth: 1, borderColor: p.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, color: p.ink, fontSize: 16 }} />
      <View style={{ flexDirection: "row", gap: 8, paddingVertical: 10 }}>
        {SORTS.map(([id, label]) => (
          <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: by === id }} onPress={() => run((tx) => (tx.setSettings({ currencySort: id }), true))} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: by === id ? p.accent : p.line, backgroundColor: by === id ? p.accent : "transparent" }}>
            <Text style={{ color: by === id ? p.onAccent : p.ink, fontSize: 13 }}>{t.t(label)}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "head" ? "h:" + r.title : r.code)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={16}
        windowSize={9}
        renderItem={({ item }) =>
          item.kind === "head" ? (
            <Text style={{ color: p.muted, fontSize: 14, paddingTop: 12, paddingBottom: 4 }}>{t.t(item.title)}</Text>
          ) : (
            <CurrencyRow code={item.code} chosen={item.code === value} locale={t.locale} onPick={pick} />
          )
        }
        ListEmptyComponent={<Text style={{ color: p.muted, textAlign: "center", padding: 24 }}>{t.t("No currencies found")}</Text>}
      />
    </View>
  );
}

type Row = { kind: "head"; title: string } | { kind: "code"; code: string };

const CurrencyRow = memo(function CurrencyRow({ code, chosen, locale, onPick }: { code: string; chosen: boolean; locale: string; onPick: (code: string) => void }) {
  const p = usePalette();
  const sign = currencySign(code);
  const name = currencyName(code, locale);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${name} ${code}`}
      accessibilityState={{ selected: chosen }}
      onPress={() => onPick(code)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingHorizontal: 6, backgroundColor: pressed ? p.soft : "transparent" })}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: chosen ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{chosen ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 16 }}>{name}</Text>
        <Text style={{ color: p.muted, fontSize: 12 }}>{code}</Text>
      </View>
      {sign === code ? null : <Text style={{ color: p.inkSoft, fontSize: 16 }}>{sign}</Text>}
    </Pressable>
  );
});
