// Categories: the tiles with what each received or spent in the period, and the category editor.
import { perfFlags, PERF_BUILD } from "../platform/perf.ts";
import { useCoachTarget } from "../ui/coach.tsx";
import { memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { usePageReady } from "../ui/pager.tsx";
import { router } from "expo-router";
import { categoriesEmptyOf, categoriesNone } from "../domain/categories.ts";
import { categoryTotalIn, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, type Period } from "../domain/periods.ts";
import type { Category } from "../domain/types.ts";
import { useLedger, useLedgerView } from "../ui/app-context.tsx";
import { Screen } from "../ui/kit.tsx";
import { CategoryTile, SumTabs, WithMoney } from "../ui/parts.tsx";
import { EmptyState } from "../ui/empty-state.tsx";
import { RootHero } from "./root-hero.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { periodOps } from "./period-read.ts";
import { setView, useViewCatType } from "./ui-state.ts";
import { dateOfShownPeriod, openEditor } from "./editor/editor-sheet.tsx";
import { openAccountSheet } from "./account-sheet.tsx";
import { openCategorySheet } from "./category-sheet.tsx";

export function CategoriesScreen() {
  const catType = useViewCatType();
  return (
    <View style={{ flex: 1 }}>
      <RootHero icon="edit" label="Change categories" onAction={() => router.push({ pathname: "/categories-manage" })} />
      <PeriodPager header={<PeriodBar />} render={(period) => <CategoriesPage period={period} catType={catType} />} />
    </View>
  );
}

// The sums and the tiles of one period (drawn beforehand for the neighbouring periods too).
const CategoriesPage = memo(function CategoriesPage({ period, catType }: { period: Period; catType: "expense" | "income" }) {
  // Speed-check build: the page's content is on the screen once it is first committed (no virtualized parts).
  const ready = usePageReady();
  useLayoutEffect(() => {
    if (PERF_BUILD) ready();
  }, [ready]);
  const data = useLedgerView();
  const rows = useMemo(() => reportRows(data, periodOps(data, period, emptyFilters())), [data, period]);
  // Both kinds are kept drawn once the page has settled and only shown or hidden: switching Expenses / Incomes then
  // changes a style and the highlighted tab instead of building a dozen tiles with their icons on the spot.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  const create = () => router.push({ pathname: "/category", params: { type: catType } });
  const emptyOf = (kind: "expense" | "income") => categoriesEmptyOf(data, kind);
  // No categories at all (the first launch, or all of them deleted): the Expenses / Incomes switch has nothing to switch, so it is not shown.
  const none = categoriesNone(data);
  return (
      <Screen padded={false} bar={false} pinned={none ? undefined : <SumTabs active={catType} expense={<WithMoney>{(money) => money(totalByType(rows, "expense"), data.settings.currency)}</WithMoney>} income={<WithMoney>{(money) => money(totalByType(rows, "income"), data.settings.currency)}</WithMoney>} onChange={(v) => setView({ catType: v })} />}>
        {emptyOf(catType) ? (
          <EmptyState kind="categories" title="Categories will be here" hint="So far, it's empty. Create your first category?" action="Create" onAction={create} />
        ) : null}
        {(["expense", "income"] as const).map((kind) =>
          (kind === catType || (warm && !(PERF_BUILD && perfFlags.noWarm))) && !emptyOf(kind) ? (
            <View key={kind} style={kind === catType ? undefined : { display: "none" }}>
              <TileGrid data={data} rows={rows} kind={kind} />
            </View>
          ) : null,
        )}
      </Screen>
  );
});

const TileGrid = memo(function TileGrid({ data, rows, kind }: { data: ReturnType<typeof useLedger>; rows: ReturnType<typeof reportRows>; kind: "expense" | "income" }) {
  const tiles = data.categories.filter((c) => c.type === kind && !c.parent && !c.archived);
  // A debt account can stand among the categories, as an expense or as an income.
  const debts = data.accounts.filter((a) => a.type === "Debt" && !a.archived && (kind === "expense" ? a.showExpense : a.showIncome));
  const tone = (total: number) => (total === 0 ? "muted" : kind === "income" ? "pos" : "neg");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
      {tiles.map((c, index) => {
        const total = categoryTotalIn(data, rows, c);
        return <CategoryCell key={c.id} first={index === 0} id={c.id} type={c.type} icon={c.icon} color={c.color} name={c.name} figure={<WithMoney>{(money) => money(total, c.currency)}</WithMoney>} tone={tone(total)} />;
      })}
      {debts.map((a) => {
        const asCategory: Category = { id: "debt:" + a.id, name: a.name, type: kind, icon: a.icon, color: a.color, currency: a.currency, parent: null, archived: false };
        const total = categoryTotalIn(data, rows, asCategory);
        return <CategoryTile key={asCategory.id} icon={a.icon} color={a.color} name={a.name} figure={<WithMoney>{(money) => money(total, a.currency)}</WithMoney>} tone={tone(total)} onPress={() => openAccountSheet(a.id)} />;
      })}
    </View>
  );
});

// A tile with handlers of its own, so a redraw of the page leaves tiles whose sum did not change alone.
const CategoryCell = memo(function CategoryCell({ id, type, icon, color, name, figure, tone, first = false }: { first?: boolean; id: string; type: string; icon: string; color: string; name: string; figure: ReactNode; tone: "pos" | "neg" | "muted" }) {
  const open = useCallback(() => openEditor({ type: type === "income" ? "income" : "expense", category: id, date: dateOfShownPeriod() }), [id, type]);
  const hold = useCallback(() => openCategorySheet(id), [id]);
  const coach = useCoachTarget("first-category");
  // The first tile can be lit by the introduction tour; it sits in a box of its own for that (the box has the tile's width).
  if (first)
    return (
      <View ref={coach} collapsable={false} style={{ width: "48.5%" }}>
        <CategoryTile icon={icon} color={color} name={name} figure={figure} tone={tone} onPress={open} onLongPress={hold} width="100%" />
      </View>
    );
  return <CategoryTile icon={icon} color={color} name={name} figure={figure} tone={tone} onPress={open} onLongPress={hold} />;
});
