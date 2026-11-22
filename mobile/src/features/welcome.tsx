// First start: a short word about what the application does and one button. The application starts empty; the
// data of the first application is brought later, under More → Data (not here: the owner, 2026-11-22).
// A long press on the button starts with the basic set of accounts and categories instead: the emulator checks
// (scripts/emulator-*.sh) need that data, and it does no harm to a person who finds it.
import { Text, View } from "react-native";
import { appStore, usePalette, useT } from "../ui/app-context.tsx";
import { Button } from "../ui/kit.tsx";

export function Welcome() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: 32, justifyContent: "center" }}>
      <Text style={{ color: p.ink, fontSize: 26, fontWeight: "500", textAlign: "center", marginBottom: 12 }}>{t.t("Welcome to {app}", { app: "Monivra" })}</Text>
      <Text style={{ color: p.muted, fontSize: 16, lineHeight: 23, textAlign: "center", marginBottom: 32 }}>
        {t.t("Keep track of your money: note incomes and expenses, plan payments ahead, set budgets and see where the money goes.")}
      </Text>
      <Button label="Start" onPress={() => appStore().begin("empty", t.t)} onLongPress={() => appStore().begin("starter", t.t)} />
    </View>
  );
}
