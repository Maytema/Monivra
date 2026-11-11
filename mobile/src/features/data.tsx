// The Data page (js/data/import-export.js): rows that save a data file, bring one back, and export the
// operations as CSV. Bringing a file back replaces everything, so it asks first and says what it found.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { FileProblem } from "../domain/datafile.ts";
import { csvText } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { pickTextFile, shareTextFile } from "../platform/files.ts";
import { appStore, showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { confirmDialog, DialogActions, DialogTitle } from "../ui/dialogs.tsx";
import { PrimaryPill } from "../ui/calendar-sheet.tsx";
import { Footnote, SettingRow } from "../ui/rows.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

function Notice({ title, text }: { title: string; text: string }) {
  const p = usePalette();
  const close = useCloseLayer();
  return (
    <View>
      <DialogTitle>{title}</DialogTitle>
      <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22 }}>{text}</Text>
      <DialogActions>
        <PrimaryPill label="OK" onPress={close} />
      </DialogActions>
    </View>
  );
}
const notice = (title: string, text: string): number => sheets.open(<Notice title={title} text={text} />, "dialog");

export function DataScreen() {
  const t = useT();
  const p = usePalette();
  const data = useLedger();
  const [busy, setBusy] = useState(false);
  const guard = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await job();
    } catch (error) {
      showError(t, error);
    } finally {
      setBusy(false);
    }
  };
  const save = () => guard(() => shareTextFile(`monivra-backup-${appStore().env.clock.today()}.json`, appStore().exportDataFile()));
  const csv = () => guard(() => shareTextFile(`monivra-operations-${appStore().env.clock.today()}.csv`, csvText(data, [...data.ops].sort(newestFirst)), "text/csv"));
  const restore = () =>
    confirmDialog(
      "Replace the data with a file?",
      () =>
        void guard(async () => {
          const text = await pickTextFile();
          if (text === null) return;
          try {
            const counts = appStore().importDataFile(text);
            notice(t.t("Data imported"), t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: counts.accounts, o: counts.ops, s: counts.scheduled }));
          } catch (error) {
            const why = error instanceof FileProblem && error.problem ? `${t.t(error.problem.what)} ${error.problem.number || ""}: ${t.t(error.problem.reason)}` : error instanceof Error ? error.message : "";
            notice(t.t("The file could not be used. Nothing was changed."), why);
          }
        }),
      true,
      "Choose file",
      t.t("Everything in this application is replaced by the file. Save a data file first if you may need what is here now."),
    );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Data") }} />
      <ScrollView>
        <Footnote>{t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: data.accounts.length, o: data.ops.length, s: data.scheduled.length })}</Footnote>
        <SettingRow title="Data file" icon="receipt" caption="Create and restore data from a manual backup file" chevron={false} onPress={() => void save()} />
        <SettingRow title="Import data" icon="upload" caption="Use a data file saved in the old app (More → Data) or in this one." chevron={false} onPress={restore} />
        <SettingRow title="Export data" icon="download" caption="Save a copy of your data as a file" chevron={false} onPress={() => void csv()} />
        <Footnote>A data file holds everything you recorded. The old app can read it too.</Footnote>
      </ScrollView>
    </View>
  );
}
