// "Bulk edit" (js/screens/operations/bulk-edit.js, catalog OP 010–013): one sheet with category, account,
// comment, tags and date, each "No changes" until chosen and with a cross that clears the choice; Confirm asks
// "Are you sure?" before the change is applied to all selected operations. Amounts never change with a comment,
// tags or date (domain/operations.ts); nothing changes if one is refused.
import { useState, type ReactNode } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { applyBulkChanges, bulkAccountProblem, emptyBulkChanges, rememberTags, type BulkChanges } from "../domain/operations.ts";
import { useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { PrimaryPill } from "../ui/calendar-sheet.tsx";
import { DialogTitle, confirmDialog, promptDialog, toast } from "../ui/dialogs.tsx";
import { Icon } from "../ui/kit.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { openChoice } from "./editor/party-picker.tsx";

const DAY_MS = 86400000;

function Pill({ label, icon, on = false, danger = false, onPress }: { label: string; icon?: string; on?: boolean; danger?: boolean; onPress: () => void }) {
  const p = usePalette();
  const tone = danger ? p.negativeInk : on ? p.accentInk : p.ink;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: on ? p.accent : p.line, backgroundColor: on ? p.soft : "transparent" }}>
      {icon ? <Icon name={icon} size={14} color={tone} /> : null}
      <Text style={{ color: tone, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

// Write one comment for all selected operations, or remove their comments with a separate button.
function CommentSheet({ initial, onDone }: { initial: string | null; onDone: (comment: string | null) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [text, setText] = useState(initial ?? "");
  return (
    <View>
      <DialogTitle>{t.t("Comment")}</DialogTitle>
      <Text style={{ color: p.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{t.t("The comment replaces the existing comment of every selected operation.")}</Text>
      <Text style={{ color: p.muted, fontSize: 12, marginBottom: 4 }}>{t.t("Add a comment")}</Text>
      <TextInput autoFocus value={text} onChangeText={setText} accessibilityLabel={t.t("Comment")} style={{ borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: p.ink, fontSize: 16 }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 8 }}>
        <Pill
          label={t.t("Remove comments")}
          icon="trash"
          danger
          onPress={() => {
            close();
            onDone("");
          }}
        />
        <PrimaryPill
          label="Complete"
          onPress={() => {
            if (!text.trim()) return toast("Enter a comment");
            close();
            onDone(text);
          }}
        />
      </View>
    </View>
  );
}

// Tags to add to and to remove from the selected operations.
function TagsSheet({ changes, used, onDone }: { changes: BulkChanges; used: string[]; onDone: (add: string[], remove: string[], clear: boolean) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const run = useCommand();
  const [add, setAdd] = useState(changes.addTags);
  const [remove, setRemove] = useState(changes.removeTags);
  const [clear, setClear] = useState(changes.clearTags);
  const toggled = (list: string[], tag: string) => (list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]);
  const create = () =>
    promptDialog(
      "New tag",
      "",
      (value) => {
        const name = value.trim();
        if (!name) return toast("Enter a tag");
        run((tx) => rememberTags(tx, [name]));
        setAdd((a) => [...new Set([...a, name])]);
        setClear(false);
      },
      "Tag name",
    );
  const title = (text: string) => <Text style={{ color: p.muted, fontSize: 13, marginTop: 12, marginBottom: 8 }}>{t.t(text)}</Text>;
  return (
    <View>
      <DialogTitle>{t.t("Tags")}</DialogTitle>
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {title("Add")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {data.tags.map((tag) => (
            <Pill
              key={tag}
              label={tag}
              on={add.includes(tag)}
              onPress={() => {
                setAdd(toggled(add, tag));
                setRemove(remove.filter((x) => x !== tag));
                setClear(false);
              }}
            />
          ))}
          <Pill label={t.t("Add")} icon="plus" onPress={create} />
        </View>
        {title("Remove")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {used.map((tag) => (
            <Pill
              key={tag}
              label={tag}
              on={remove.includes(tag)}
              onPress={() => {
                setRemove(toggled(remove, tag));
                setAdd(add.filter((x) => x !== tag));
                setClear(false);
              }}
            />
          ))}
          <Pill
            label={t.t("Clear all")}
            icon="trash"
            danger
            on={clear}
            onPress={() => {
              if (!clear) (setAdd([]), setRemove([]));
              setClear(!clear);
            }}
          />
        </View>
      </ScrollView>
      <View style={{ alignItems: "flex-end", marginTop: 16 }}>
        <PrimaryPill
          label="Complete"
          onPress={() => {
            close();
            onDone(add, remove, clear);
          }}
        />
      </View>
    </View>
  );
}

function BulkSheet({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const close = useCloseLayer();
  const [changes, setChanges] = useState<BulkChanges>(emptyBulkChanges);
  const set = (patch: Partial<BulkChanges>) => setChanges((c) => ({ ...c, ...patch }));
  const selected = data.ops.filter((o) => ids.includes(o.id));
  const hasTransfers = selected.some((o) => o.type === "transfer");
  const used = [...new Set(selected.flatMap((o) => o.tags ?? []))];

  const chooseAccount = () =>
    openChoice("account", (id) => {
      const problem = bulkAccountProblem(data, ids, id, hasTransfers ? "receiver" : "sender");
      if (problem && !hasTransfers) return toast(problem);
      if (!hasTransfers) return set({ account: id, role: "sender" });
      // "For transfers": which account of a transfer is replaced.
      const choose = (role: "sender" | "receiver") => {
        sheets.closeTop();
        const clash = bulkAccountProblem(data, ids, id, role);
        if (clash) return toast(clash);
        set({ account: id, role });
      };
      sheets.open(<RoleDialog onChoose={choose} />, "dialog");
    });
  const apply = () => {
    const planned = run((tx, env) => {
      rememberTags(tx, changes.addTags);
      return applyBulkChanges(tx, ids, changes, env);
    });
    if (planned === undefined) return;
    close();
    onDone();
    toast(planned ? t.tc("{n} operation moved to scheduled payments", "{n} operations moved to scheduled payments", planned) : t.t("Operations updated"));
  };
  const dateShown = (date: string): string => {
    const shown = t.day(date, true);
    const originals = [...new Set(selected.map((o) => o.date))];
    if (originals.length !== 1) return shown;
    const days = Math.round((Date.parse(date) - Date.parse(originals[0]!)) / DAY_MS);
    if (!days) return `${shown} · ${t.t("same date")}`;
    return `${shown} · ${days > 0 ? t.tc("{n} day later", "{n} days later", days) : t.tc("{n} day earlier", "{n} days earlier", -days)}`;
  };
  const row = (icon: string, label: string, value: string | null, onPress: () => void, clear: () => void, custom?: ReactNode) => (
    <View key={label} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: p.line }}>
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={icon} size={16} color={p.inkSoft} />
          <Text style={{ color: p.inkSoft, fontSize: 14 }}>{t.t(label)}</Text>
        </View>
        {value ? custom ?? <Text numberOfLines={2} style={{ color: p.ink, fontSize: 17, marginTop: 8 }}>{value}</Text> : <Text style={{ color: p.muted, fontSize: 14, marginTop: 8 }}>{t.t("No changes")}</Text>}
      </Pressable>
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Clear")} onPress={clear} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" size={20} color={p.ink} />
        </Pressable>
      ) : null}
    </View>
  );
  const categoryName = data.categories.find((c) => c.id === changes.category)?.name ?? null;
  const accountName = data.accounts.find((a) => a.id === changes.account)?.name ?? null;
  const tagsShown = changes.clearTags ? t.t("Clear all") : [...changes.addTags, ...changes.removeTags].join(", ");
  const commentShown = changes.comment === null ? null : changes.comment || t.t("Remove comments");
  const chips = (label: string, tags: string[], removed: boolean) =>
    tags.length ? (
      <View key={label} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Text style={{ color: p.muted, fontSize: 12 }}>{t.t(label)}</Text>
        {tags.map((tag) => (
          <View key={tag} style={{ paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: removed ? p.negative : p.line, borderRadius: 9 }}>
            <Text style={{ color: removed ? p.negativeInk : p.ink, fontSize: 13 }}>{tag}</Text>
          </View>
        ))}
      </View>
    ) : null;
  return (
    <View>
      <DialogTitle>{t.t("Bulk edit")}</DialogTitle>
      {row("categories", "Category", categoryName, () => openChoice("category", (id) => set({ category: id })), () => set({ category: null }))}
      {row("wallet", "Account", accountName, chooseAccount, () => set({ account: null }))}
      {row("comment", "Comment", commentShown, () => sheets.open(<CommentSheet initial={changes.comment} onDone={(comment) => set({ comment })} />, "sheet"), () => set({ comment: null }))}
      {row(
        "tag",
        "Tags",
        tagsShown || null,
        () => sheets.open(<TagsSheet changes={changes} used={used} onDone={(addTags, removeTags, clearTags) => set({ addTags, removeTags, clearTags })} />, "sheet"),
        () => set({ addTags: [], removeTags: [], clearTags: false }),
        changes.clearTags ? undefined : <View style={{ gap: 6, marginTop: 8 }}>{[chips("Add", changes.addTags, false), chips("Remove", changes.removeTags, true)]}</View>,
      )}
      {row("calendar", "Date", changes.date ? dateShown(changes.date) : null, () => openCalendar(changes.date ?? selected[0]?.date ?? data.ops[0]?.date ?? "2000-01-01", (date) => set({ date })), () => set({ date: null }))}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 18 }}>
        <Pressable accessibilityRole="button" onPress={close} style={{ flex: 1, height: 54, borderRadius: 999, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: p.ink, fontSize: 17 }}>{t.t("Cancel")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => confirmDialog("The selected changes will be applied to all selected operations.", apply, false, "Confirm")} style={{ flex: 1, height: 54, borderRadius: 999, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: p.onAccent, fontSize: 17, fontWeight: "600" }}>{t.t("Confirm")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoleDialog({ onChoose }: { onChoose: (role: "sender" | "receiver") => void }) {
  const p = usePalette();
  const t = useT();
  const button = (label: string, onPress: () => void, primary: boolean) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={{ minHeight: 52, borderRadius: 30, alignItems: "center", justifyContent: "center", marginTop: 12, borderWidth: primary ? 0 : 1, borderColor: p.line, backgroundColor: primary ? p.soft : "transparent" }}>
      <Text style={{ color: p.ink, fontSize: 15, fontWeight: "500" }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <DialogTitle>{t.t("For transfers")}</DialogTitle>
      <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22 }}>{t.t("For transfer operations, which account to replace?")}</Text>
      {button("Sender", () => onChoose("sender"), true)}
      {button("Receiver", () => onChoose("receiver"), true)}
      {button("Cancel", () => sheets.closeTop(), false)}
    </View>
  );
}

export const openBulkEdit = (ids: string[], onDone: () => void): number => sheets.open(<BulkSheet ids={ids} onDone={onDone} />, "sheet");
