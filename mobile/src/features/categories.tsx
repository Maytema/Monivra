// Categories: the tiles with what each received or spent in the period, and the category editor.
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { blankCategory, deleteCategory, storeCategory } from "../domain/categories.ts";
import { categoryById, categoryTotalIn, reportRows } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import type { Category } from "../domain/types.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, ChoiceField, Field, Label, Screen, Segmented } from "../ui/kit.tsx";
import { OptionPicker } from "../ui/pickers.tsx";
import { font, radius, space } from "../ui/theme.ts";
import { HeaderAdd } from "./accounts.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { setView, useView } from "./ui-state.ts";

const KINDS = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
] as const;

export function CategoriesScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period, catType } = useView();
  const rows = useMemo(() => reportRows(data, operationsIn(data, period, emptyFilters())), [data, period]);
  const tiles = data.categories.filter((c) => c.type === catType && !c.parent && !c.archived);
  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <HeaderAdd onPress={() => router.push({ pathname: "/category", params: { type: catType } })} /> }} />
      <PeriodBar />
      <Segmented value={catType} options={KINDS} onChange={(v) => setView({ catType: v })} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.m }}>
        {tiles.map((c) => {
          const total = categoryTotalIn(data, rows, c);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: "/operation", params: { category: c.id } })}
              onLongPress={() => router.push({ pathname: "/category", params: { id: c.id } })}
              style={({ pressed }) => ({ width: "30%", alignItems: "center", gap: 6, padding: space.s, borderRadius: radius.m, backgroundColor: pressed ? p.soft : "transparent" })}
            >
              <Badge icon={c.icon} color={c.color} size={52} />
              <Text style={{ color: p.ink, fontSize: font.small }} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={{ color: total ? p.ink : p.muted, fontSize: font.small, fontWeight: "600" }} numberOfLines={1}>
                {money(total, c.currency)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!tiles.length ? <Button label="Create category" onPress={() => router.push({ pathname: "/category", params: { type: catType } })} /> : null}
      <Label>{t.t("Tap a category to add an operation, hold it to change the category.")}</Label>
    </Screen>
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
