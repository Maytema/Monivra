// Categories: the tiles with what each received or spent in the period, and the category editor.
import { memo, useCallback, useDeferredValue, useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { categoryTotalIn, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, type Period } from "../domain/periods.ts";
import type { Category } from "../domain/types.ts";
import { useLedger, useMoney } from "../ui/app-context.tsx";
import { Screen } from "../ui/kit.tsx";
import { CategoryTile, SumTabs } from "../ui/parts.tsx";
import { EmptyState } from "../ui/empty-state.tsx";
import { RootHero } from "./root-hero.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { setView, useView } from "./ui-state.ts";
import { openEditor } from "./editor/editor-sheet.tsx";
import { openAccountSheet } from "./account-sheet.tsx";
import { openCategorySheet } from "./category-sheet.tsx";

export function CategoriesScreen() {
  const { catType } = useView();
  // The neighbouring pages follow the type a moment later, at low priority: the shown page switches first.
  const later = useDeferredValue(catType);
  return (
    <View style={{ flex: 1 }}>
      <RootHero icon="edit" label="Change categories" onAction={() => router.push({ pathname: "/categories-manage" })} />
      <PeriodPager header={<PeriodBar />} render={(period, isCurrent) => <CategoriesPage period={period} catType={isCurrent ? catType : later} />} />
    </View>
  );
}

// The sums and the tiles of one period (drawn beforehand for the neighbouring periods too).
const CategoriesPage = memo(function CategoriesPage({ period, catType }: { period: Period; catType: "expense" | "income" }) {
  const data = useLedger();
  const money = useMoney();
  const rows = useMemo(() => reportRows(data, operationsIn(data, period, emptyFilters())), [data, period]);
  const tiles = data.categories.filter((c) => c.type === catType && !c.parent && !c.archived);
  // A debt account can stand among the categories, as an expense or as an income.
  const debts = data.accounts.filter((a) => a.type === "Debt" && !a.archived && (catType === "expense" ? a.showExpense : a.showIncome));
  const tone = (total: number) => (total === 0 ? "muted" : catType === "income" ? "pos" : "neg");
  const create = () => router.push({ pathname: "/category", params: { type: catType } });
  const empty = !tiles.length && !debts.length;
  return (
      <Screen padded={false} bar={false}>
        <SumTabs active={catType} expense={money(totalByType(rows, "expense"), data.settings.currency)} income={money(totalByType(rows, "income"), data.settings.currency)} onChange={(v) => setView({ catType: v })} />
        {empty ? (
          <EmptyState kind="categories" title="Categories will be here" hint="So far, it's empty. Create your first category?" action="Create" onAction={create} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
            {tiles.map((c) => {
              const total = categoryTotalIn(data, rows, c);
              return <CategoryCell key={c.id} id={c.id} type={c.type} icon={c.icon} color={c.color} name={c.name} figure={money(total, c.currency)} tone={tone(total)} />;
            })}
            {debts.map((a) => {
              const asCategory: Category = { id: "debt:" + a.id, name: a.name, type: catType, icon: a.icon, color: a.color, currency: a.currency, parent: null, archived: false };
              const total = categoryTotalIn(data, rows, asCategory);
              return <CategoryTile key={asCategory.id} icon={a.icon} color={a.color} name={a.name} figure={money(total, a.currency)} tone={tone(total)} onPress={() => openAccountSheet(a.id)} />;
            })}
          </View>
        )}
      </Screen>
  );
});

// A tile with handlers of its own, so a redraw of the page leaves tiles whose sum did not change alone.
const CategoryCell = memo(function CategoryCell({ id, type, icon, color, name, figure, tone }: { id: string; type: string; icon: string; color: string; name: string; figure: string; tone: "pos" | "neg" | "muted" }) {
  const open = useCallback(() => openEditor({ type: type === "income" ? "income" : "expense", category: id }), [id, type]);
  const hold = useCallback(() => openCategorySheet(id), [id]);
  return <CategoryTile icon={icon} color={color} name={name} figure={figure} tone={tone} onPress={open} onLongPress={hold} />;
});
