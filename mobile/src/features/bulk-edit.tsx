// "Bulk edit" (catalog OP 010–013): one sheet with category, account, comment, tags and date, each "No changes"
// until chosen, and Confirm, which asks "Are you sure?" before the change is applied to all selected operations.
// Amounts never change with a comment, tags or date (domain/operations.ts); nothing changes if one is refused.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { applyBulkChanges, emptyBulkChanges, rememberTags, type BulkChanges } from "../domain/operations.ts";
import { useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { confirmDialog, promptDialog, toast } from "../ui/dialogs.tsx";
import { Icon } from "../ui/kit.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { openChoice } from "./editor/party-picker.tsx";
import { openTags } from "./editor/options.tsx";

function BulkSheet({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const close = useCloseLayer();
  const [changes, setChanges] = useState<BulkChanges>(emptyBulkChanges);
  const set = (patch: Partial<BulkChanges>) => setChanges((c) => ({ ...c, ...patch }));
  const row = (icon: string, label: string, value: string | null, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name={icon} size={20} color={p.inkSoft} />
        <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: value ? p.accentInk : p.muted, fontSize: 18, marginTop: 10 }}>
        {value ?? t.t("No changes")}
      </Text>
    </Pressable>
  );
  const apply = () => {
    const planned = run((tx, env) => {
      rememberTags(tx, changes.addTags);
      return applyBulkChanges(tx, ids, changes, env);
    });
    if (planned === undefined) return;
    close();
    onDone();
    if (planned) toast("Saved as a scheduled payment");
  };
  const categoryName = data.categories.find((c) => c.id === changes.category)?.name ?? null;
  const accountName = data.accounts.find((a) => a.id === changes.account)?.name ?? null;
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 24, fontWeight: "500", marginTop: 4, marginBottom: 6 }}>{t.t("Bulk edit")}</Text>
      {row("categories", "Category", categoryName, () => openChoice("category", (id) => set({ category: id })))}
      {row("wallet", "Account", accountName, () => openChoice("account", (id) => set({ account: id })))}
      {row("comment", "Comment", changes.comment, () => promptDialog("Comment", changes.comment ?? "", (comment) => set({ comment: comment.trim() || null }), "Comment"))}
      {row("tag", "Tags", changes.addTags.length ? changes.addTags.join(", ") : null, () => openTags(changes.addTags, (addTags) => set({ addTags })))}
      {row("calendar", "Date", changes.date ? t.day(changes.date, true) : null, () => openCalendar(changes.date ?? data.ops[0]?.date ?? "2000-01-01", (date) => set({ date })))}
      <View style={{ paddingTop: 16 }}>
        <Pressable accessibilityRole="button" onPress={() => confirmDialog("Are you sure?", apply, false, "Confirm", t.t("The selected changes will be applied to all selected operations."))} style={{ height: 54, borderRadius: 999, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: p.onAccent, fontSize: 17, fontWeight: "600" }}>{t.t("Confirm")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const openBulkEdit = (ids: string[], onDone: () => void): number => sheets.open(<BulkSheet ids={ids} onDone={onDone} />, "sheet");
