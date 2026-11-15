// The sheet to choose a currency (js/ui/currency-picker.js): a search field (code, sign, name or country), the
// order of the list, and sections: used first, major, other. The chosen currency is marked.
import { memo, useMemo, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { CURRENCIES } from "../domain/currencies.ts";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { byText, currencyName, currencySign, searchCurrencies, sortKey } from "./currency-names.ts";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { Icon } from "./kit.tsx";

const POPULAR = ["USD", "EUR", "GBP", "CNY", "JPY", "CHF", "CAD", "AUD"];
const SORTS = [
  ["groups", "Used first"],
  ["name", "By name"],
  ["code", "By code"],
] as const;

// A page over the whole screen, as in the first application (js/ui/currency-picker.js, "full").
export const openCurrencySheet = (value: string, onPick: (code: string) => void): number => sheets.open(<CurrencySheet value={value} onPick={onPick} />, "full");

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
  // One flat, virtualized list: the headings and the rows; only what is on the screen is drawn. The rows of
  // a section sit on one tinted card (the first and the last round its corners).
  const rows = useMemo(
    () =>
      shown.flatMap(([title, codes]): Row[] => [
        ...(title ? [{ kind: "head" as const, title }] : []),
        ...codes.map((code, i) => ({ kind: "code" as const, code, first: i === 0, last: i === codes.length - 1 })),
      ]),
    [shown],
  );
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const r of rows) out.push(y), (y += rowHeight(r));
    return out;
  }, [rows]);
  const pick = (code: string) => {
    close();
    onPick(code);
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Close")} onPress={close} hitSlop={8} style={{ width: 52, height: 44, alignItems: "flex-start", justifyContent: "center", paddingLeft: 4 }}>
          <Icon name="close" size={24} color={p.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 22 }}>{t.t("Select currency")}</Text>
        <View style={{ width: 52 }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 17, marginBottom: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: p.line, borderRadius: 14, backgroundColor: p.bg }}>
        <Icon name="search" size={20} color={p.muted} />
        <TextInput value={text} onChangeText={setText} placeholder={t.t("Code, name or country")} placeholderTextColor={p.muted} autoCorrect={false} style={{ flex: 1, minHeight: 48, color: p.ink, fontSize: 16, paddingVertical: 0 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 17 }}>
        {SORTS.map(([id, label]) => (
          <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: by === id }} onPress={() => run((tx) => (tx.setSettings({ currencySort: id }), true))} style={{ flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: by === id ? p.accent : p.line, backgroundColor: by === id ? p.accent : "transparent" }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ width: "100%", textAlign: "center", color: by === id ? p.onAccent : p.ink, fontSize: 14 }}>{t.t(label)}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "head" ? "h:" + r.title : r.code)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={16}
        windowSize={13}
        // Every row and heading has a fixed height, so the list knows where any row is without drawing the ones
        // before it: a fast fling lands on rows that are drawn at once, not on empty space being measured.
        getItemLayout={(_rows, index) => ({ length: rowHeight(rows[index]), offset: offsets[index] ?? 0, index })}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16 }}
        renderItem={({ item }) =>
          item.kind === "head" ? (
            <View style={{ height: HEAD_HEIGHT, justifyContent: "flex-end", paddingBottom: 8, paddingHorizontal: 4 }}>
              <Text numberOfLines={1} style={{ color: p.muted, fontSize: 14, fontWeight: "500" }}>{t.t(item.title)}</Text>
            </View>
          ) : (
            <View style={{ height: rowHeight(item), paddingTop: item.first ? 4 : 0, paddingBottom: item.last ? 4 : 0 }}>
              <CurrencyRow code={item.code} chosen={item.code === value} locale={t.locale} onPick={pick} />
            </View>
          )
        }
        ListEmptyComponent={<Text style={{ color: p.muted, textAlign: "center", padding: 24 }}>{t.t("No currencies found")}</Text>}
      />
    </View>
  );
}

type Row = { kind: "head"; title: string } | { kind: "code"; code: string; first: boolean; last: boolean };
// Heights of the list's pieces (dp): a heading, a currency row (the first and last of a card are 4 dp taller).
const HEAD_HEIGHT = 44;
const ROW_HEIGHT = 56;
const rowHeight = (r: Row | undefined): number => (!r ? ROW_HEIGHT : r.kind === "head" ? HEAD_HEIGHT : ROW_HEIGHT + (r.first ? 4 : 0) + (r.last ? 4 : 0));

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
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, height: ROW_HEIGHT, paddingVertical: 6, paddingHorizontal: 18, borderRadius: 14, backgroundColor: pressed || chosen ? p.tint : "transparent" })}
    >
      <View style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: chosen ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{chosen ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 16 }}>{name}</Text>
        <Text style={{ color: p.muted, fontSize: 12 }}>{code}</Text>
      </View>
      <Text style={{ minWidth: 45, textAlign: "right", color: p.ink, fontSize: 16 }}>{sign === code ? "" : sign}</Text>
    </Pressable>
  );
});
