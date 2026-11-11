// Categories: the tiles with what each received or spent in the period, and the category editor.
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { blankCategory, deleteCategory, storeCategory } from "../domain/categories.ts";
import { categoryById, categoryTotalIn, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import type { Category } from "../domain/types.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, ChoiceField, Empty, Field, Label, Screen, Segmented } from "../ui/kit.tsx";
import { CategoryTile, SumTabs } from "../ui/parts.tsx";
import { OptionPicker } from "../ui/pickers.tsx";
import { font, radius, space } from "../ui/theme.ts";
import { RootHero } from "./root-hero.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { setView, useView } from "./ui-state.ts";
import { openEditor } from "./editor/editor-sheet.tsx";
import { openAccountSheet } from "./account-sheet.tsx";
import { openCategorySheet } from "./category-sheet.tsx";

export function CategoriesScreen() {
  const data = useLedger();
  const money = useMoney();
  const { period, catType } = useView();
  const rows = useMemo(() => reportRows(data, operationsIn(data, period, emptyFilters())), [data, period]);
  const tiles = data.categories.filter((c) => c.type === catType && !c.parent && !c.archived);
  // A debt account can stand among the categories, as an expense or as an income.
  const debts = data.accounts.filter((a) => a.type === "Debt" && !a.archived && (catType === "expense" ? a.showExpense : a.showIncome));
  const tone = (total: number) => (total === 0 ? "muted" : catType === "income" ? "pos" : "neg");
  const edit = () => router.push({ pathname: "/categories-manage" });
  const create = () => router.push({ pathname: "/category", params: { type: catType } });
  const empty = !tiles.length && !debts.length;
  return (
    <View style={{ flex: 1 }}>
      <RootHero icon="edit" label="Change categories" onAction={edit} />
      <Screen tab padded={false}>
        <PeriodBar />
        <SumTabs active={catType} expense={money(totalByType(rows, "expense"), data.settings.currency)} income={money(totalByType(rows, "income"), data.settings.currency)} onChange={(v) => setView({ catType: v })} />
        {empty ? (
          <View style={{ padding: 24, gap: 14 }}>
            <Empty text="Categories will be here" />
            <Button label="Create" onPress={create} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 11, paddingBottom: 16 }}>
            {tiles.map((c) => {
              const total = categoryTotalIn(data, rows, c);
              return <CategoryTile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(total, c.currency)} tone={tone(total)} onPress={() => openEditor({ type: c.type === "income" ? "income" : "expense", category: c.id })} onLongPress={() => openCategorySheet(c.id)} />;
            })}
            {debts.map((a) => {
              const asCategory: Category = { id: "debt:" + a.id, name: a.name, type: catType, icon: a.icon, color: a.color, currency: a.currency, parent: null, archived: false };
              const total = categoryTotalIn(data, rows, asCategory);
              return <CategoryTile key={asCategory.id} icon={a.icon} color={a.color} name={a.name} figure={money(total, a.currency)} tone={tone(total)} onPress={() => openAccountSheet(a.id)} />;
            })}
          </View>
        )}
      </Screen>
    </View>
  );
}

const COLORS = ["#f57400", "#479ee2", "#45585e", "#2fb585", "#4945a2", "#7064cc", "#b520c5", "#a5a3c8", "#e5322d", "#f2c200", "#22b35e", "#9b3fd1"];
const ICON_CHOICES = ["pizza", "bike", "home", "shield", "tag", "play", "paw", "trend", "briefcase", "gift", "wifi", "repair", "business", "receipt", "percent", "card", "cash"];

export function CategoryEditor() {
  const { id, type } = useLocalSearchParams<{ id?: string; type?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const existing = id ? categoryById(data, id) : undefined;
  const [draft, setDraft] = useState<Category>(() => existing ?? blankCategory({ id: "", type: type === "income" ? "income" : "expense", currency: data.settings.currency, color: "#7064cc", icon: "tag" }));
  const [picking, setPicking] = useState<"parent" | "currency" | null>(null);
  const set = (patch: Partial<Category>) => setDraft((d) => ({ ...d, ...patch }));
  const parents = data.categories.filter((c) => c.type === draft.type && !c.parent && c.id !== draft.id);
  const hasChildren = data.categories.some((c) => c.parent === draft.id);
  const used = existing ? data.ops.filter((o) => o.category === existing.id || categoryById(data, o.category)?.parent === existing.id).length : 0;
  const save = () => {
    const result = run((tx, env) => storeCategory(tx, { ...draft, id: draft.id || null }, env));
    if (result) router.back();
  };
  const remove = () =>
    existing &&
    Alert.alert(t.t("Delete this category?"), t.t("Operations that will be deleted: {n}. Balances of the accounts change by them.", { n: used }), [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t("Delete"), style: "destructive", onPress: () => run((tx) => deleteCategory(tx, existing.id)) && router.back() },
    ]);
  return (
    <Screen>
      <Stack.Screen options={{ title: t.t(existing ? "Change category" : "New category") }} />
      <View style={{ alignItems: "center" }}>
        <Badge icon={draft.icon} color={draft.color} size={64} />
      </View>
      <Field label="Title" value={draft.name} onChange={(name) => set({ name })} placeholder="Enter a name" />
      {!existing ? <Segmented value={draft.type} options={KINDS} onChange={(v) => set({ type: v, parent: null })} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {COLORS.map((c) => (
          <Pressable key={c} onPress={() => set({ color: c })} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: draft.color === c ? 3 : 0, borderColor: p.ink }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ICON_CHOICES.map((icon) => (
          <Pressable key={icon} onPress={() => set({ icon })} style={{ opacity: draft.icon === icon ? 1 : 0.45 }}>
            <Badge icon={icon} color={draft.color} size={36} />
          </Pressable>
        ))}
      </View>
      {!hasChildren ? <ChoiceField label="Parent category" value={categoryById(data, draft.parent)?.name ?? t.t("None")} onPress={() => setPicking("parent")} /> : null}
      <ChoiceField label="Category currency" value={draft.currency} onPress={() => setPicking("currency")} />
      <Button label={existing ? "Save" : "Create"} onPress={save} />
      {existing ? <Button label={existing.archived ? "Return from archive" : "Move to archive"} kind="outline" onPress={() => run((tx, env) => storeCategory(tx, { ...existing, archived: !existing.archived }, env)) && router.back()} /> : null}
      {existing ? <Button label="Delete" kind="danger" onPress={remove} /> : null}
      <OptionPicker visible={picking === "parent"} title="Parent category" options={[{ value: "", label: "None" }, ...parents.map((c) => ({ value: c.id, label: c.name }))]} value={draft.parent ?? ""} onPick={(v) => set({ parent: v || null })} onClose={() => setPicking(null)} />
      <OptionPicker visible={picking === "currency"} title="Category currency" options={Object.keys(data.rates).sort().map((c) => ({ value: c, label: c }))} value={draft.currency} onPick={(currency) => set({ currency })} onClose={() => setPicking(null)} />
    </Screen>
  );
}
