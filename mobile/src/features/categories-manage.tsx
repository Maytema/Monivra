// The page "Change categories" (js/screens/categories.js `categoryManageView`): two tabs, a button that
// creates a category, the tiles that open the editor, and the archive that unfolds.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { moveInOrder } from "../domain/accounts.ts";
import { categoryTotalIn, reportRows } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon, Screen } from "../ui/kit.tsx";
import { CategoryTile, SegmentTabs } from "../ui/parts.tsx";
import { Sortable } from "../ui/sortable.tsx";
import { setView, useView } from "./ui-state.ts";

export function CategoriesManage() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period, catType } = useView();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [held, setHeld] = useState(false);
  const run = useCommand();
  const rows = reportRows(data, operationsIn(data, period, emptyFilters()));
  const mine = data.categories.filter((c) => c.type === catType && !c.parent);
  const active = mine.filter((c) => !c.archived);
  const archived = mine.filter((c) => c.archived);
  const open = (id?: string) => router.push({ pathname: "/category", params: id ? { id } : { type: catType } });
  const tile = (c: (typeof mine)[number], ignoreTap?: () => boolean) => {
    const total = categoryTotalIn(data, rows, c);
    return <CategoryTile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(total, c.currency)} tone={total === 0 ? "muted" : catType === "income" ? "pos" : "neg"} onPress={() => !ignoreTap?.() && open(c.id)} width="100%" />;
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Change categories") }} />
      <SegmentTabs
        tabs={[
          { id: "expense" as const, label: "Expenses" },
          { id: "income" as const, label: "Incomes" },
        ]}
        active={catType}
        onChange={(type) => setView({ catType: type })}
      />
      <Screen padded={false} scrollEnabled={!held}>
        <Pressable accessibilityRole="button" onPress={() => open()} style={({ pressed }) => ({ marginHorizontal: 11, marginTop: 14, marginBottom: 16, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: p.line, backgroundColor: pressed ? p.soft : p.key })}>
          <View style={{ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: p.nav }}>
            <Icon name="plus" size={22} color={p.muted} />
          </View>
          <Text style={{ color: p.muted, fontSize: 17 }}>{t.t("Create a new category")}</Text>
        </Pressable>
        <Sortable
          items={active}
          keyOf={(c) => c.id}
          onHold={setHeld}
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 11 }}
          itemStyle={{ width: "48.5%" }}
          onReorder={(ids) => void run((tx) => (moveInOrder(tx, "categories", ids), true))}
          render={(c, ignoreTap) => tile(c, ignoreTap)}
        />
        {archived.length ? (
          <View style={{ paddingHorizontal: 11 }}>
            <Pressable accessibilityRole="button" onPress={() => setArchiveOpen(!archiveOpen)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 14, paddingHorizontal: 5 }}>
              <Text style={{ color: p.ink, fontSize: 15 }}>{t.t("Archive ({n})", { n: archived.length })}</Text>
              <Icon name={archiveOpen ? "up" : "down"} size={17} color={p.ink} />
            </Pressable>
            {archiveOpen ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, opacity: 0.7 }}>{archived.map((c) => (
              <View key={c.id} style={{ width: "48.5%" }}>
                {tile(c)}
              </View>
            ))}</View> : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
