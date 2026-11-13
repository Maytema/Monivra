// Shown instead of the application when the stored data cannot be opened (js/screens/recovery.js). The
// database file is neither changed nor deleted until the person decides: a copy can be saved or shared
// first; restoring or starting empty puts the unreadable file aside under a dated name.
import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, useColorScheme, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { FileProblem, readDataFile } from "../domain/datafile.ts";
import type { LedgerData } from "../domain/types.ts";
import { translator, type Translator } from "../i18n/index.ts";
import { appStore, phoneLanguage } from "../platform/app-store.ts";
import { databaseBytes } from "../platform/database.ts";
import { pickFile, saveTextFile, shareTextFile } from "../platform/files.ts";
import { buildPalette } from "../ui/theme.ts";

const two = (n: number) => String(n).padStart(2, "0");
function moment(t: Translator, iso: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  return `${t.day(day)}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function Recovery({ error, tooNew }: { error: string; tooNew: boolean }) {
  const t = useMemo(() => translator(phoneLanguage()), []);
  const p = buildPalette("#a000b8", useColorScheme() === "dark");
  const [busy, setBusy] = useState(false);
  const inside = useMemo(() => (tooNew ? null : appStore().newestWholeBackup()), [tooNew]);
  const today = new Date();
  const copyName = `monivra-unreadable-data-${today.getFullYear()}-${two(today.getMonth() + 1)}-${two(today.getDate())}.db`;
  const guard = (job: () => Promise<void> | void) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await job();
    } catch (e) {
      Alert.alert(t.t("Something went wrong"), e instanceof Error ? t.t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };
  const ask = (message: string, yes: string, run: () => void) =>
    Alert.alert(t.t("Are you sure?"), t.t(message), [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t(yes), onPress: () => void guard(run)() },
    ]);
  const bringBack = (data: LedgerData) => ask("Replace current data with this backup?", "Confirm", () => appStore().recoverWith(data));
  const fromFile = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      bringBack(readDataFile(file.text, phoneLanguage()).data);
    } catch (e) {
      const why = e instanceof FileProblem && e.problem ? `${t.t(e.problem.what)} ${e.problem.number || ""}: ${t.t(e.problem.reason)}` : e instanceof Error ? t.t(e.message) : "";
      Alert.alert(t.t("The file cannot be used"), why);
    }
  };
  const button = (label: string, onPress: () => void, look: "primary" | "outline" | "text") => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: 30, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, marginTop: 12, opacity: busy ? 0.5 : pressed ? 0.85 : 1, borderWidth: look === "outline" ? 1 : 0, borderColor: p.line, backgroundColor: look === "primary" ? p.accent : "transparent" })}
    >
      <Text style={{ color: look === "primary" ? p.onAccent : look === "text" ? p.accentInk : p.ink, fontSize: 16, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={{ color: p.ink, fontSize: 26, fontWeight: "600", marginBottom: 14 }}>{t.t("Your data could not be read")}</Text>
      <Text style={{ color: p.ink, fontSize: 16, lineHeight: 23, marginBottom: 10 }}>
        {tooNew ? t.t("The data was saved by a newer version of the application. Update the application.") : t.t("{app} found data saved on this device but cannot open it. Nothing has been changed or deleted.", { app: "Monivra" })}
      </Text>
      <Text style={{ color: p.negativeInk, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{error}</Text>
      <Text style={{ color: p.ink, fontSize: 16, lineHeight: 23 }}>{t.t("First save a copy of the data, then choose how to continue.")}</Text>
      {button(t.t("Save a copy of the data"), () => void guard(async () => void (await saveTextFile(copyName, await databaseBytes(), "application/octet-stream")))(), "primary")}
      {button(t.t("Share the copy"), () => void guard(async () => shareTextFile(copyName, await databaseBytes(), "application/octet-stream"))(), "outline")}
      {tooNew ? null : (
        <>
          {inside ? button(t.t("Restore the newest backup kept inside ({date})", { date: moment(t, inside.at) }), () => bringBack(inside.data), "outline") : null}
          {button(t.t("Restore from a data file"), () => void guard(fromFile)(), "outline")}
          {button(t.t("Start with empty data"), () => ask("Start with empty data? What could not be read stays on this device as a separate copy, but this application will no longer use it.", "Start empty", () => appStore().startEmpty()), "text")}
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
