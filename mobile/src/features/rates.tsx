// The exchange rates page (js/screens/rates.js plus the automatic update): the switch for automatic rates, the
// search, one row per currency with its rate and a tick that keeps it out of the update, and the reset.
import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { defaultRates } from "../domain/currencies.ts";
import { fetcher } from "../platform/network.ts";
import { RATE_PROVIDERS } from "../services/rates/providers.ts";
import type { RateUpdateState } from "../services/rates/refresh.ts";
import { appStore, useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { currencyName, searchCurrencies } from "../ui/currency-names.ts";
import { confirmDialog, toast } from "../ui/dialogs.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { openNumberSheet } from "../ui/number-sheet.tsx";
import { Footnote, SwitchRow } from "../ui/rows.tsx";
import { mix } from "../ui/theme.ts";

export function RatesScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const fixed = data.settings.fixedRates ?? [];
  const state = data.settings.rateUpdate as RateUpdateState | undefined;
  const codes = useMemo(() => {
    const found = searchCurrencies(query, t.locale).filter((c) => c in data.rates);
    if (query.trim()) return found;
    const used = new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...data.categories.map((c) => c.currency)]);
    return [...found.filter((c) => used.has(c)), ...found.filter((c) => !used.has(c))];
  }, [query, t.locale, data.rates, data.settings.currency, data.accounts, data.categories]);
  const usedProviders = new Set(Object.values(state?.sources ?? {}).map((s) => s.provider));

  const update = async () => {
    setBusy(true);
    const result = await appStore().updateRates(fetcher, true);
    setBusy(false);
    toast(result?.ok ? "Rates updated" : "The rates could not be updated: no source answered");
  };
  const setFixed = (code: string, on: boolean) => run((tx) => (tx.setSettings({ fixedRates: on ? [...fixed.filter((c) => c !== code), code] : fixed.filter((c) => c !== code) }), true));
  const edit = (code: string) =>
    openNumberSheet(
      "Exchange rate",
      String(data.rates[code] ?? ""),
      (text) => {
        const n = Number(text);
        if (!Number.isFinite(n) || n <= 0) {
          toast("Use a positive number");
          return false;
        }
        if (code === "KGS" && n !== 1) {
          toast("KGS is the base currency (1)");
          return false;
        }
        run((tx) => {
          tx.setRates({ ...tx.data.rates, [code]: n });
          if (code !== "KGS" && !fixed.includes(code)) tx.setSettings({ fixedRates: [...fixed, code] });
          return true;
        });
      },
      { decimal: true },
    );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Exchange rates") }} />
      <FlatList
        data={codes}
        keyExtractor={(code) => code}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={9}
        ListHeaderComponent={
          <>
        <SwitchRow label="Automatic rates" hint="Updated about twice a day from free public sources when the internet is available." value={!!data.settings.autoRates} onChange={(autoRates) => run((tx) => (tx.setSettings({ autoRates }), true))} />
        <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
          <Button label={busy ? "Updating…" : "Update now"} kind="outline" onPress={() => void update()} disabled={busy} />
        </View>
        {state ? <Footnote>{`${t.t("Last attempt")}: ${state.at.slice(0, 16).replace("T", " ")} UTC · ${state.ok ? t.t("updated") : t.t("no source answered")}`}</Footnote> : null}
        {RATE_PROVIDERS.filter((x) => x.attribution && usedProviders.has(x.id)).map((x) => (
          <Text key={x.id} style={{ color: p.accentInk, fontSize: 13, paddingHorizontal: 18, paddingBottom: 6 }} onPress={() => void Linking.openURL(x.attribution!.url)}>
            {x.attribution!.text}
          </Text>
        ))}
        <Footnote>Tick a currency to keep its rate out of the automatic update. An edited rate is ticked automatically.</Footnote>
        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <TextInput value={query} onChangeText={setQuery} placeholder={t.t("Code, name or country")} placeholderTextColor={p.muted} autoCorrect={false} style={{ borderWidth: 1, borderColor: p.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, color: p.ink, fontSize: 16 }} />
        </View>
          </>
        }
        renderItem={({ item: code }) => {
          const kept = fixed.includes(code);
          return (
            <View key={code} style={{ flexDirection: "row", alignItems: "center", minHeight: 64 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${currencyName(code, t.locale)} ${code}`} onPress={() => edit(code)} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 18 }}>
                <Text style={{ color: p.ink, fontSize: 16 }}>{currencyName(code, t.locale)}</Text>
                <Text style={{ color: p.muted, fontSize: 13, marginTop: 2 }}>{`1 ${code} = ${data.rates[code]} KGS`}</Text>
              </Pressable>
              {code === "KGS" ? null : (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: kept }} accessibilityLabel={`${t.t("Do not update automatically")}: ${code}`} onPress={() => setFixed(code, !kept)} style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: kept ? p.accent : p.muted, backgroundColor: kept ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>{kept ? <Icon name="check" size={16} color={p.onAccent} /> : null}</View>
                </Pressable>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <>
        {codes.length ? null : <Text style={{ color: p.muted, textAlign: "center", padding: 24 }}>{t.t("No currencies found")}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            confirmDialog(
              "Every rate returns to its example value and the ticks are cleared.",
              () => {
                run((tx) => (tx.setRates(defaultRates()), tx.setSettings({ fixedRates: [] }), true));
                toast("Rates restored");
              },
              false,
              "Restore",
            )
          }
          style={{ flexDirection: "row", alignItems: "center", gap: 18, minHeight: 56, paddingHorizontal: 18, backgroundColor: mix(p.accent, p.bg, 0.04) }}
        >
          <Icon name="repeat" size={24} color={p.inkSoft} />
          <Text style={{ color: p.ink, fontSize: 16 }}>{t.t("Restore example rates")}</Text>
        </Pressable>
          </>
        }
      />
    </View>
  );
}
