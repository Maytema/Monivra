// The category form (js/screens/categories.js `categoryEditView`): title, icon, type, currency, the
// subcategories with their planned actions (applied on Save), nest/move into another category,
// archive and delete.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { moveInOrder } from "../domain/accounts.ts";
import { blankCategory, deleteCategory, storeCategory, type SubcategoryAction } from "../domain/categories.ts";
import { categoryById } from "../domain/ledger.ts";
import type { Category } from "../domain/types.ts";
import { showError, useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { appStore } from "../ui/app-context.tsx";
import { openCurrencySheet } from "../ui/currency-sheet.tsx";
import { openCustomize } from "../ui/customize-sheet.tsx";
import { confirmDialog, DialogActions, DialogTitle, promptDialog, toast } from "../ui/dialogs.tsx";
import { FieldButton, FieldText } from "../ui/form.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { ToneBadge } from "../ui/parts.tsx";
import { currencyName } from "../ui/currency-names.ts";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { TextButton } from "../ui/calendar-sheet.tsx";
import { Sortable } from "../ui/sortable.tsx";
import { mix, space } from "../ui/theme.ts";
import { useView } from "./ui-state.ts";

type Mode = SubcategoryAction["mode"];
const PLANNED: Record<Mode, string> = { moveSub: "Move to {name}", mergeSub: "Merge into {name}", promoteSub: "Make a category", archiveSub: "Move to archive", restoreSub: "Return from archive", deleteSub: "Delete" };

function MenuRow({ icon, label, onPress, danger = false }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        close();
        onPress();
      }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14, paddingHorizontal: 6, backgroundColor: pressed ? p.soft : "transparent" })}
    >
      <Icon name={icon} size={24} color={danger ? p.negativeInk : p.ink} />
      <Text style={{ color: danger ? p.negativeInk : p.ink, fontSize: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
}

function TypeSheet({ value, parent, onPick }: { value: Category["type"]; parent: Category | undefined; onPick: (type: Category["type"]) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const choice = (type: Category["type"], label: string, icon: string, color: string) => (
    <Pressable
      key={type}
      accessibilityRole="radio"
      accessibilityState={{ selected: value === type }}
      onPress={() => {
        if (parent && parent.type !== type) return toast("Subcategory type follows its parent");
        close();
        onPick(type);
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: mix(color, p.bg, 0.15) }}>
        <Icon name={icon} size={26} color={color} />
      </View>
      <Text style={{ flex: 1, color: p.ink, fontSize: 17 }}>{t.t(label)}</Text>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: value === type ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{value === type ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
    </Pressable>
  );
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{t.t("Select type")}</Text>
      {choice("expense", "Expenses", "arrowExpense", "#e5322d")}
      {choice("income", "Incomes", "arrowIncome", "#22b35e")}
    </View>
  );
}

// The target of a nest/move/merge: categories (or the subcategories of this one) as a list.
function TargetSheet({ title, options, onPick }: { title: string; options: readonly Category[]; onPick: (c: Category) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {options.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => {
              close();
              onPick(c);
            }}
            style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderWidth: 1, borderColor: p.line, borderRadius: 14 }}
          >
            <ToneBadge icon={c.icon} color={c.color} size={40} iconSize={22} />
            <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 15 }}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
      </DialogActions>
    </View>
  );
}

export function CategoryEditor() {
  const { id, type, parent } = useLocalSearchParams<{ id?: string; type?: string; parent?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const { catType } = useView();
  const existing = id ? categoryById(data, id) : undefined;
  const start = (): Category => {
    if (existing) return { ...existing };
    const owner = categoryById(data, parent);
    const kind: Category["type"] = owner?.type ?? (type === "income" || (!type && catType === "income") ? "income" : "expense");
    return blankCategory({ id: "", type: kind, icon: kind === "income" ? "trend" : "pizza", color: "#9d00b5", currency: data.settings.currency, parent: owner?.id ?? null });
  };
  const [draft, setDraft] = useState<Category>(start);
  const [fresh, setFresh] = useState<Category[]>([]);
  const [held, setHeld] = useState(false);
  const [actions, setActions] = useState<SubcategoryAction[]>([]);
  const set = (patch: Partial<Category>) => setDraft((d) => ({ ...d, ...patch }));
  const editing = !!existing;
  const children = existing ? data.categories.filter((c) => c.parent === existing.id) : [];
  const active = children.filter((c) => !c.archived);
  const archived = children.filter((c) => c.archived);
  const planned = (sub: string) => actions.find((a) => a.id === sub);
  const used = existing ? [...data.ops, ...data.scheduled].filter((o) => o.category === existing.id || children.some((c) => c.id === o.category)).length : 0;
  const plan = (action: SubcategoryAction) => setActions((list) => [...list.filter((a) => a.id !== action.id), action]);

  const apply = (relocate: { mode: "nest" | "merge"; target: string } | null) => {
    if (!draft.name.trim()) return toast("Enter a name");
    const go = () => {
      if (run((tx, env) => storeCategory(tx, { ...draft, id: draft.id || null }, env, { newSubcategories: fresh, subActions: actions, relocate }))) {
        toast("Category saved");
        router.back();
      }
    };
    if (actions.some((a) => ["moveSub", "mergeSub", "promoteSub"].includes(a.mode))) confirmDialog("Apply changes?", go, true, "Confirm", t.t("The planned actions on subcategories will be applied."));
    else go();
  };
  const save = () => {
    try {
      apply(null);
    } catch (e) {
      showError(t, e);
    }
  };

  const target = (mode: "nest" | "merge" | "moveSub" | "mergeSub", sub?: string) => {
    const options = data.categories.filter((c) => !c.archived && c.type === draft.type && c.id !== draft.id && (mode === "mergeSub" ? c.parent === draft.id && c.id !== sub : !c.parent));
    sheets.open(
      <TargetSheet
        title={mode === "mergeSub" ? "Choose a subcategory" : "Choose a category"}
        options={options}
        onPick={(c) => {
          if (mode === "nest" || mode === "merge")
            confirmDialog(
              mode === "nest" ? "Nest into category?" : "Move into category?",
              () => apply({ mode, target: c.id }),
              true,
              "Confirm",
              t.t(
                mode === "nest"
                  ? 'This category and its subcategories will become subcategories of "{name}". Their operations will be re-pointed to "{name}" accordingly.'
                  : 'All operations of this category will be moved to "{name}", and this category will be deleted.',
                { name: c.name },
              ),
            );
          else if (sub) scheduleSub(sub, mode, c.id);
        }}
      />,
      "dialog",
    );
  };

  const scheduleSub = (sub: string, mode: Mode, to?: string) => {
    const act = () => plan({ id: sub, mode, ...(to ? { target: to } : {}) });
    const name = categoryById(data, to)?.name ?? "";
    if (mode === "mergeSub") confirmDialog("Merge into a subcategory?", act, false, "Schedule", t.t('All operations of this subcategory will be moved to "{name}", and this subcategory will be deleted.\n\nThe change will be applied after you tap "Save".', { name }));
    else if (mode === "promoteSub") confirmDialog("Convert to a category?", act, false, "Schedule", t.t('This subcategory will become a standalone category, and its operations will be re-pointed to it directly.\n\nThe change will be applied after you tap "Save".'));
    else act();
  };

  const subMenu = (c: Category) =>
    sheets.open(
      <View>
        <Text style={{ color: p.ink, fontSize: 18, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{c.name}</Text>
        <MenuRow icon="edit" label="Edit" onPress={() => router.push({ pathname: "/category", params: { id: c.id } })} />
        <MenuRow icon="transfer" label="Move to a category" onPress={() => target("moveSub", c.id)} />
        <MenuRow icon="transfer" label="Merge into a subcategory" onPress={() => target("mergeSub", c.id)} />
        <MenuRow icon="categories" label="Convert to a category" onPress={() => scheduleSub(c.id, "promoteSub")} />
        <MenuRow icon="archive" label={c.archived ? "Return from archive" : "Move to archive"} onPress={() => scheduleSub(c.id, c.archived ? "restoreSub" : "archiveSub")} />
        <MenuRow icon="trash" label="Delete" danger onPress={() => confirmDialog("Delete this subcategory and its associated operations?", () => plan({ id: c.id, mode: "deleteSub" }), true, "Delete")} />
      </View>,
      "sheet",
    );
  const newSubMenu = (c: Category) =>
    sheets.open(
      <View>
        <Text style={{ color: p.ink, fontSize: 18, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{c.name}</Text>
        <MenuRow icon="edit" label="Edit" onPress={() => promptDialog("Subcategory", c.name, (v) => setFresh((l) => l.map((x) => (x.id === c.id ? { ...x, name: v.trim() || x.name } : x))), "Title")} />
        <MenuRow icon="trash" label="Delete" danger onPress={() => setFresh((l) => l.filter((x) => x.id !== c.id))} />
      </View>,
      "sheet",
    );
  const addSub = () =>
    promptDialog(
      "Subcategory",
      "",
      (v) => {
        const name = v.trim();
        if (!name) return toast("Enter a name");
        setFresh((l) => [...l, { id: appStore().env.newId(), name, type: draft.type, parent: draft.id || null, icon: draft.icon, color: draft.color, currency: draft.currency, archived: false } as Category]);
      },
      "Name",
    );

  const chip = (c: Category, isNew: boolean, ignoreTap?: () => boolean) => {
    const a = planned(c.id);
    const label = a ? t.t(PLANNED[a.mode], { name: categoryById(data, a.target)?.name ?? "" }) : "";
    return (
      <View key={c.id}>
        <Pressable accessibilityRole="button" onPress={() => !ignoreTap?.() && (isNew ? newSubMenu(c) : subMenu(c))} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 19, backgroundColor: pressed ? p.soft : "transparent" })}>
          <Text style={{ flex: 1, color: p.accentInk, fontSize: 17 }}>{c.name}</Text>
          <Icon name="right" size={20} color={p.inkSoft} />
        </Pressable>
        {label ? <Text style={{ color: p.muted, fontSize: 12, paddingBottom: 6, paddingLeft: 16 }}>→ {label}</Text> : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(editing ? "Change category" : "New category") }} />
      <ScrollView scrollEnabled={!held} contentContainerStyle={{ padding: space.l, gap: 24 }} keyboardShouldPersistTaps="handled">
        <FieldText boxed label="Title" value={draft.name} onChange={(name) => set({ name })} placeholder="Enter the title" />
        <FieldButton inline label="Icon" onPress={() => openCustomize({ icon: draft.icon, color: draft.color }, (look) => set(look))} cell={{ node: <Icon name={draft.icon} size={26} color={draft.color} />, background: mix(draft.color, p.bg, 0.14) }} />
        <FieldButton label="Type" right={<View style={{ flexDirection: "row", alignItems: "center", gap: 20, minHeight: 36 }}><Icon name={draft.type === "expense" ? "arrowExpense" : "arrowIncome"} size={28} color={p.accentInk} /><Text style={{ color: p.accentInk, fontSize: 16 }}>{t.t(draft.type === "expense" ? "Expenses" : "Incomes")}</Text></View>} onPress={() => sheets.open(<TypeSheet value={draft.type} parent={categoryById(data, draft.parent)} onPick={(type) => set({ type })} />, "sheet")} />
        <FieldButton label="Category currency" value={currencyName(draft.currency, t.locale)} onPress={() => openCurrencySheet(draft.currency, (currency) => set({ currency }))} />
        {!draft.parent ? (
          <View style={{ borderWidth: 1, borderColor: p.line, borderRadius: 16, overflow: "hidden" }}>
            <Text style={{ color: p.ink, fontSize: 17, lineHeight: 22, fontWeight: "500", paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.line }}>{t.t("Subcategories")}</Text>
            <Sortable
              items={[...active.map((c) => ({ c, isNew: false })), ...fresh.map((c) => ({ c, isNew: true }))]}
              keyOf={(x) => x.c.id}
              onHold={setHeld}
              onReorder={(ids) => {
                const saved = ids.filter((id) => active.some((c) => c.id === id));
                if (saved.length) run((tx) => (moveInOrder(tx, "categories", saved), true));
                setFresh((list) => [...list].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
              }}
              render={(x, ignoreTap) => chip(x.c, x.isNew, ignoreTap)}
            />
            <Pressable accessibilityRole="button" onPress={addSub} style={({ pressed }) => ({ minHeight: 56, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: p.line, backgroundColor: pressed ? p.soft : "transparent" })}>
              <Text style={{ color: p.accentInk, fontSize: 17 }}>{t.t("Add subcategory")}</Text>
            </Pressable>
            {archived.length ? (
              <>
                <Text style={{ color: p.muted, fontSize: 14, paddingTop: 6 }}>{t.t("Archive")}</Text>
                {archived.map((c) => chip(c, false))}
              </>
            ) : null}
          </View>
        ) : null}
        <View style={{ gap: 10, paddingTop: 6 }}>
          <Button label={editing ? "Save" : "Create"} onPress={save} />
          {editing && !draft.parent ? <Button label="Nest into category" kind="outline" onPress={() => target("nest")} /> : null}
          {editing && !draft.parent ? <Button label="Move into category" kind="outline" onPress={() => target("merge")} /> : null}
          {editing ? <Button label={draft.archived ? "Return from archive" : "Move to archive"} kind="outline" onPress={() => set({ archived: !draft.archived })} /> : null}
          {existing ? (
            <Button
              label="Delete"
              kind="danger"
              onPress={() =>
                confirmDialog(
                  "Delete this category?",
                  () => {
                    if (run((tx) => deleteCategory(tx, existing.id))) {
                      toast("Category deleted");
                      router.back();
                    }
                  },
                  true,
                  "Delete",
                  t.t("All operations ({n}) associated with the category will be removed. This applies to both normal operations and scheduled ones.\n\nThe category and transactions cannot be restored. If you only want to hide the category - select Move to archive.\n\nIf this category or subcategory was in the budget, it will be removed from there. If this was the only category in the budget, the budget will also be deleted.", { n: used }),
                )
              }
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
