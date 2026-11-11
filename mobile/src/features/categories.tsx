// Categories: the tiles with what each received or spent in the period, and the category editor.
import { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { categoryTotalIn, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import type { Category } from "../domain/types.ts";
import { useLedger, useMoney } from "../ui/app-context.tsx";
import { Button, Empty, Screen } from "../ui/kit.tsx";
import { CategoryTile, SumTabs } from "../ui/parts.tsx";
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
