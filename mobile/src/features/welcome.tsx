// First start: begin empty, with a basic set, or bring the data of the first application (a data file
// saved there under More → Data).
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { FileProblem } from "../domain/datafile.ts";
import { appStore, usePalette, useT } from "../ui/app-context.tsx";
import { Button } from "../ui/kit.tsx";
import { pickTextFile } from "../platform/files.ts";

export function Welcome() {
  const p = usePalette();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const importFile = async () => {
    setBusy(true);
    try {
      const text = await pickTextFile();
      if (text === null) return;
      const counts = appStore().importDataFile(text);
      Alert.alert(t.t("Data imported"), t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: counts.accounts, o: counts.ops, s: counts.scheduled }));
    } catch (error) {
      const reason = error instanceof FileProblem && error.problem ? `${t.t(error.problem.what)} ${error.problem.number || ""}: ${t.t(error.problem.reason)}` : "";
      Alert.alert(t.t(error instanceof FileProblem ? error.message : "The file could not be read."), reason);
    } finally {
      setBusy(false);
    }
  };
  // As the first application's welcome (js/screens/welcome.js): a title, a line, two ways to begin; and a
  // third way that only this application has, bringing the data of the first one.
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: 32, justifyContent: "center" }}>
      <Text style={{ color: p.ink, fontSize: 26, fontWeight: "500", textAlign: "center", marginBottom: 12 }}>{t.t("Welcome to {app}", { app: "Monivra" })}</Text>
      <Text style={{ color: p.muted, fontSize: 16, lineHeight: 23, textAlign: "center", marginBottom: 28 }}>{t.t("Start with a basic set of accounts and categories, or begin with a blank page. You can edit or delete everything later.")}</Text>
      <View style={{ gap: 12 }}>
        <Button label="Start with basic set" onPress={() => appStore().begin("starter", t.t)} disabled={busy} />
        <Button label="Start empty" kind="outline" onPress={() => appStore().begin("empty", t.t)} disabled={busy} />
        <Button label="Bring data from the old app" kind="text" onPress={() => void importFile()} disabled={busy} />
      </View>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 }}>{t.t("In the old app open More → Data → Save data file, then choose that file here. The old app keeps its data.")}</Text>
    </View>
  );
}
