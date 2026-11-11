// More: budgets, scheduled payments, exchange rates, data, settings; and those pages.
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { FileProblem } from "../domain/datafile.ts";
import { csvText } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { pickTextFile, shareTextFile } from "../platform/files.ts";
import { appStore, showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Card, Icon, Label, Screen } from "../ui/kit.tsx";
import { BrandMark } from "../ui/brand-mark.tsx";

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
