// First start: begin empty, with a basic set, or bring the data of the first application (a data file
// saved there under More → Data).
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { FileProblem } from "../domain/datafile.ts";
import { appStore, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Card, Label } from "../ui/kit.tsx";
import { pickTextFile } from "../platform/files.ts";
import { font, space } from "../ui/theme.ts";

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
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: space.xl, justifyContent: "center", gap: space.l }}>
      <Text style={{ color: p.ink, fontSize: font.hero, fontWeight: "700" }}>Monivra</Text>
      <Text style={{ color: p.inkSoft, fontSize: font.body }}>{t.t("How would you like to begin?")}</Text>
      <Card>
        <Button label="Start with a basic set" onPress={() => appStore().begin("starter", t.t)} disabled={busy} />
        <Label>{t.t("A few accounts and categories that you can change or delete.")}</Label>
      </Card>
      <Card>
        <Button label="Start empty" kind="outline" onPress={() => appStore().begin("empty", t.t)} disabled={busy} />
      </Card>
      <Card>
        <Button label="Bring data from the old app" kind="outline" onPress={() => void importFile()} disabled={busy} />
        <Label>{t.t("In the old app open More → Data → Save data file, then choose that file here. The old app keeps its data.")}</Label>
      </Card>
    </View>
  );
}
