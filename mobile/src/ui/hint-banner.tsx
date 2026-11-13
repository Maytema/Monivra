// A one-time hint with a close button; once closed it stays closed (settings.dismissedHints), as in
// the first application (js/ui/hint.js).
import { Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useCommand, useLedger, usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";

// `plain`: a row of a menu (the More tab, MR 001) instead of a tinted card.
// `icon`/`onClose`: the same banner for a notice that is not a one-time hint (it goes away by `onClose`).
export function HintBanner({ id, text, onPress, plain = false, icon = "info", onClose }: { id: string; text: string; onPress?: () => void; plain?: boolean; icon?: string; onClose?: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const dismissed = data.settings.dismissedHints ?? [];
  if (!onClose && dismissed.includes(id)) return null;
  const body = (
    <>
      <Icon name={icon} size={plain ? 24 : 20} color={p.ink} />
      <Text style={{ flex: 1, color: p.ink, fontSize: plain ? 17 : 14 }}>{t.t(text)}</Text>
    </>
  );
  return (
    <View style={plain ? { flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 4, paddingLeft: 18, paddingRight: 6, borderBottomWidth: 1, borderBottomColor: p.line } : { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingVertical: 6, paddingLeft: 14, paddingRight: 4, borderRadius: 14, backgroundColor: p.sheet }}>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: plain ? 18 : 12, paddingVertical: plain ? 12 : 6 }}>
          {body}
        </Pressable>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>{body}</View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Dismiss")} onPress={onClose ?? (() => void run((tx) => (tx.setSettings({ dismissedHints: [...dismissed, id] }), true)))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={22} color={p.ink} />
      </Pressable>
    </View>
  );
}
