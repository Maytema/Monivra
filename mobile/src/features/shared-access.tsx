// What "Shared access" in the More menu opens: a page over the whole screen with what is planned, a check box
// "Don't show this again" (it takes the row off the menu) and a button. A swipe down closes it, as the system
// back does.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

export const SHARED_HINT = "shared-access";

function SharedAccess() {
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const data = useLedger();
  const close = useCloseLayer();
  const [never, setNever] = useState(false);
  const para = { color: p.ink, fontSize: 16, lineHeight: 24, marginBottom: 14 } as const;
  const done = () => {
    if (never) {
      const dismissed = data.settings.dismissedHints ?? [];
      if (!dismissed.includes(SHARED_HINT)) void run((tx) => (tx.setSettings({ dismissedHints: [...dismissed, SHARED_HINT] }), true));
    }
    close();
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: p.line, marginTop: 10 }} />
      <Text style={{ color: p.ink, fontSize: 22, textAlign: "center", marginTop: 14, marginBottom: 18 }}>{t.t("Shared access")}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={para}>{t.t("Shared access will be added together with sign-in: you will be able to manage finances together through one shared account.")}</Text>
        <Text style={para}>{t.t("Data will sync automatically between the devices that signed in to the same account.")}</Text>
        <Text style={{ ...para, marginBottom: 6 }}>{t.t("How it will work:")}</Text>
        <Text style={para}>{"1. " + t.t("Create an account.")}</Text>
        <Text style={para}>{"2. " + t.t("Sign in with the same account on the second device.")}</Text>
        <Text style={para}>{"3. " + t.t("Done — all operations sync automatically.")}</Text>
        <Text style={{ ...para, color: p.muted }}>{t.t("For now the application keeps all data on this device only.")}</Text>
      </ScrollView>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: never }} onPress={() => setNever(!never)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingVertical: 14 }}>
        <Text style={{ color: p.ink, fontSize: 15 }}>{t.t("Don't show this again")}</Text>
        <View style={{ width: 26, height: 26, borderRadius: 5, borderWidth: 2, borderColor: never ? p.accent : p.inkSoft, backgroundColor: never ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {never ? <Icon name="check" size={16} color={p.onAccent} /> : null}
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <Button label="I understood" onPress={done} />
      </View>
    </View>
  );
}

export const openSharedAccess = (): number => sheets.open(<SharedAccess />, "full", { swipeDown: true });
