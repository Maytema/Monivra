// A one-time hint with a close button; once closed it stays closed (settings.dismissedHints), as in
// the first application (js/ui/hint.js).
import { Pressable, Text, View } from "react-native";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";

export function HintBanner({ id, text, onPress }: { id: string; text: string; onPress?: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const dismissed = data.settings.dismissedHints ?? [];
  if (dismissed.includes(id)) return null;
  const body = (
    <>
      <Icon name="info" size={20} color={p.ink} />
      <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>{t.t(text)}</Text>
    </>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingVertical: 6, paddingLeft: 14, paddingRight: 4, borderRadius: 14, backgroundColor: p.sheet }}>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
          {body}
        </Pressable>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>{body}</View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Dismiss")} onPress={() => void run((tx) => (tx.setSettings({ dismissedHints: [...dismissed, id] }), true))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={22} color={p.ink} />
      </Pressable>
    </View>
  );
}
