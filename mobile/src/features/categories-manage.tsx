// The page "Change categories" (js/screens/categories.js `categoryManageView`): two tabs, a button that
// creates a category, the tiles that open the editor, and the archive that unfolds.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { categoryTotalIn, reportRows } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon, Screen } from "../ui/kit.tsx";
import { CategoryTile, TopTabs } from "../ui/parts.tsx";
import { setView, useView } from "./ui-state.ts";

export function CategoriesManage() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period, catType } = useView();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const rows = reportRows(data, operationsIn(data, period, emptyFilters()));
  const mine = data.categories.filter((c) => c.type === catType && !c.parent);
  const active = mine.filter((c) => !c.archived);
  const archived = mine.filter((c) => c.archived);
  const open = (id?: string) => router.push({ pathname: "/category", params: id ? { id } : { type: catType } });
  const tile = (c: (typeof mine)[number]) => {
    const total = categoryTotalIn(data, rows, c);
    return <CategoryTile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(total, c.currency)} tone={total === 0 ? "muted" : catType === "income" ? "pos" : "neg"} onPress={() => open(c.id)} />;
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Change categories") }} />
      <TopTabs
        tabs={[
          { id: "expense" as const, label: "Expenses" },
          { id: "income" as const, label: "Incomes" },
        ]}
        active={catType}
        onChange={(type) => setView({ catType: type })}
      />
      <Screen padded={false}>
        <Pressable accessibilityRole="button" onPress={() => open()} style={{ margin: 16, minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: p.accent }}>
          <Icon name="plus" size={17} color={p.accentInk} />
          <Text style={{ color: p.accentInk, fontSize: 16, fontWeight: "500" }}>{t.t("Create a new category")}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 11 }}>{active.map(tile)}</View>
        {archived.length ? (
          <View style={{ paddingHorizontal: 11 }}>
            <Pressable accessibilityRole="button" onPress={() => setArchiveOpen(!archiveOpen)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 14, paddingHorizontal: 5 }}>
              <Text style={{ color: p.ink, fontSize: 15 }}>{t.t("Archive ({n})", { n: archived.length })}</Text>
              <Icon name={archiveOpen ? "up" : "down"} size={17} color={p.ink} />
            </Pressable>
            {archiveOpen ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, opacity: 0.7 }}>{archived.map(tile)}</View> : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
