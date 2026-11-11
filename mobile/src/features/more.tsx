// More: budgets, scheduled payments, exchange rates, data, settings; and those pages.
import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { FileProblem } from "../domain/datafile.ts";
import { csvText } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { fetcher } from "../platform/network.ts";
import { pickTextFile, shareTextFile } from "../platform/files.ts";
import { RATE_PROVIDERS } from "../services/rates/providers.ts";
import type { RateUpdateState } from "../services/rates/refresh.ts";
import { appStore, showError, useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Card, Field, Icon, Label, Row, Screen, Toggle } from "../ui/kit.tsx";
import { Panel } from "../ui/pickers.tsx";
import { BrandMark } from "../ui/brand-mark.tsx";
import { font, space } from "../ui/theme.ts";

// The groups of the menu (js/screens/more/menu.js). Pages that are not built yet are not listed.
const GROUPS = [
  [
    ["Subscription", "star", "subscription"],
    ["Profile", "user", "profile"],
  ],
  [
    ["Scheduled payments", "calendar", "/scheduled"],
    ["Budgets", "budget", "/budgets"],
  ],
  [
    ["Settings", "gear", "/settings"],
    ["Data", "receipt", "/data"],
  ],
  [
    ["Instructions", "play", "instructions"],
    ["Support", "help", "support"],
    ["About our team", "info", "about"],
    ["Privacy policy", "shield", "privacyPolicy"],
    ["Terms of use", "receipt", "terms"],
  ],
] as const;

export function MoreScreen() {
  const t = useT();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: p.bg }}>
      <Screen tab padded={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 59, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={p.dark ? { backgroundColor: "#ffffff", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 4 } : undefined}>
            <BrandMark height={38} />
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: p.ink, fontSize: 29, fontWeight: "600" }}>
            Monivra
          </Text>
          <View style={{ backgroundColor: "#000000", borderRadius: 9, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 10 }}>
            <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "500" }}>{t.t("Premium")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 15, height: 41, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <Icon name="cloud" size={23} color={p.positive} />
          <Text style={{ color: p.muted, fontSize: 14 }}>{t.t("Local data · Closed Beta")}</Text>
        </View>
        {GROUPS.map((group, i) => (
          <View key={i} style={{ paddingVertical: 9, borderBottomWidth: i === GROUPS.length - 1 ? 0 : 1, borderBottomColor: p.line }}>
            {group.map(([label, icon, href]) => (
              <Pressable key={href} accessibilityRole="button" onPress={() => (href.startsWith("/") ? router.push(href as "/settings") : router.push({ pathname: "/info", params: { kind: href } }))} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 18, height: 56, paddingHorizontal: 18, backgroundColor: pressed ? p.sheet : "transparent" })}>
                <Icon name={icon} size={24} color={p.inkSoft} />
                <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <Text style={{ color: p.muted, fontSize: 14, textAlign: "center", paddingTop: 22, paddingBottom: 24 }}>{`Monivra · ${APP_VERSION} (${t.t("Closed Beta")}) · React Native`}</Text>
      </Screen>
    </View>
  );
}

// ---- Data: moving data between the applications ---------------------------------------------------
export function DataScreen() {
  const t = useT();
  const data = useLedger();
  const [busy, setBusy] = useState(false);
  const exportFile = async () => {
    setBusy(true);
    try {
      await shareTextFile(`monivra-backup-${appStore().env.clock.today()}.json`, appStore().exportDataFile());
    } catch (error) {
      showError(t, error);
    } finally {
      setBusy(false);
    }
  };
  const importFile = () =>
    Alert.alert(t.t("Replace the data with a file?"), t.t("Everything in this application is replaced by the file. Save a data file first if you may need what is here now."), [
      { text: t.t("Cancel"), style: "cancel" },
      {
        text: t.t("Choose file"),
        onPress: async () => {
          setBusy(true);
          try {
            const text = await pickTextFile();
            if (text === null) return;
            const counts = appStore().importDataFile(text);
            Alert.alert(t.t("Data imported"), t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: counts.accounts, o: counts.ops, s: counts.scheduled }));
          } catch (error) {
            const why = error instanceof FileProblem && error.problem ? `${t.t(error.problem.what)} ${error.problem.number || ""}: ${t.t(error.problem.reason)}` : error instanceof Error ? error.message : "";
            Alert.alert(t.t("The file could not be used. Nothing was changed."), why);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <Screen>
      <Card>
        <Label>{t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: data.accounts.length, o: data.ops.length, s: data.scheduled.length })}</Label>
      </Card>
      <Button label="Save data file" onPress={() => void exportFile()} disabled={busy} />
      <Label>{t.t("A data file holds everything you recorded. The old app can read it too.")}</Label>
      <Button
        label="Save operations as CSV"
        kind="outline"
        disabled={busy}
        onPress={() =>
          void shareTextFile(`monivra-operations-${appStore().env.clock.today()}.csv`, csvText(data, [...data.ops].sort(newestFirst)), "text/csv").catch((e: unknown) => showError(t, e))
        }
      />
      <Label>{t.t("All operations in the columns the old app uses; a spreadsheet opens them.")}</Label>
      <Button label="Bring data from a file" kind="outline" onPress={importFile} disabled={busy} />
      <Label>{t.t("Use a data file saved in the old app (More → Data) or in this one.")}</Label>
    </Screen>
  );
}

// ---- Exchange rates ---------------------------------------------------------------------------------
export function RatesScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const state = data.settings.rateUpdate as RateUpdateState | undefined;
  const used = useMemo(
    () => [...new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...data.categories.map((c) => c.currency), "USD", "EUR", "RUB", "KZT", "CNY"])].filter((c) => c !== "KGS" && c in data.rates).sort(),
    [data],
  );
  const update = async () => {
    setBusy(true);
    const result = await appStore().updateRates(fetcher, true);
    setBusy(false);
    if (result && !result.ok) Alert.alert(t.t("The rates could not be updated"), t.t("No source answered. The rates stay as they were; you can edit them by hand."));
  };
  const fixed = data.settings.fixedRates ?? [];
  const usedProviders = new Set(Object.values(state?.sources ?? {}).map((s) => s.provider));
  return (
    <Screen>
      <Toggle label="Automatic rates" value={!!data.settings.autoRates} onChange={(autoRates) => run((tx) => (tx.setSettings({ autoRates }), true))} hint="Updated about twice a day from free public sources when the internet is available." />
      <Button label={busy ? "Updating…" : "Update now"} kind="outline" onPress={() => void update()} disabled={busy} />
      {state ? (
        <Label>{`${t.t("Last attempt")}: ${state.at.slice(0, 16).replace("T", " ")} UTC · ${state.ok ? t.t("updated") : t.t("no source answered")}`}</Label>
      ) : null}
      {RATE_PROVIDERS.filter((x) => x.attribution && usedProviders.has(x.id)).map((x) => (
        <Text key={x.id} style={{ color: p.accentInk, fontSize: font.small }} onPress={() => void Linking.openURL(x.attribution!.url)}>
          {x.attribution!.text}
        </Text>
      ))}
      <Label>{t.t("Rates are how many KGS one unit is worth. An edited rate is kept out of automatic updates. Saved operations keep their amounts.")}</Label>
      <Card style={{ paddingHorizontal: space.s }}>
        {used.map((code) => (
          <Row
            key={code}
            title={code}
            subtitle={fixed.includes(code) ? t.t("Kept by hand") : state?.sources[code] ? `${t.t("Source")}: ${state.sources[code]!.provider}` : undefined}
            right={<Text style={{ color: p.ink }}>{data.rates[code]}</Text>}
            onPress={() => (setEditing(code), setValue(String(data.rates[code] ?? "")))}
          />
        ))}
      </Card>
      <Panel visible={editing !== null} title={editing ?? ""} onClose={() => setEditing(null)}>
        <View style={{ padding: space.l, gap: space.m }}>
          <Field label="KGS for one unit" value={value} onChange={setValue} keyboard="decimal-pad" />
          <Button
            label="Save"
            onPress={() => {
              const rate = Number(value.replace(",", "."));
              if (!editing || !(rate > 0) || !Number.isFinite(rate)) return Alert.alert(t.t("Enter a valid amount"));
              run((tx) => {
                tx.setRates({ ...tx.data.rates, [editing]: rate });
                tx.setSettings({ fixedRates: [...new Set([...(tx.data.settings.fixedRates ?? []), editing])] });
                return true;
              });
              setEditing(null);
            }}
          />
          {editing && fixed.includes(editing) ? (
            <Button label="Update automatically again" kind="outline" onPress={() => (run((tx) => (tx.setSettings({ fixedRates: fixed.filter((c) => c !== editing) }), true)), setEditing(null))} />
          ) : null}
        </View>
      </Panel>
    </Screen>
  );
}
