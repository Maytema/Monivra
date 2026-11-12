// The page "Filtered" (js/screens/operations/list.js `filteredView`, `openFilteredOperations`): the
// operations of one account (all time) or of categories (the period on the screen), with the period bar
// and its swipe, the card of a single category, and Add. The page borrows the filters and the period of
// the Operations tab and gives them back when it closes, as the first application does.
import { useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { systemClock } from "../domain/dates.ts";
import { categoryById, categoryFamily, categoryTotalIn, reportRows } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Fab, ToneBadge } from "../ui/parts.tsx";
import { openAddMenu } from "./add-menu.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";
import { OperationsPage } from "./operations.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { getView, setView, useView } from "./ui-state.ts";

const noSelection = new Set<string>();
const openOne = (id: string) => openEditor({ id });
const nothing = () => undefined;

export function FilteredOperations() {
  const { account, category, categories } = useLocalSearchParams<{ account?: string; category?: string; categories?: string }>();
  const data = useLedger();
  const p = usePalette();
  const [ready, setReady] = useState(false);
  const before = useRef(getView());
  // The filters (and, for an account, all time) are put in place before the first frame and taken back
  // when the page closes.
  useLayoutEffect(() => {
    const saved = before.current;
    const filters = account ? { ...emptyFilters(), accounts: [account] } : category ? { ...emptyFilters(), categories: categoryFamily(data, category) } : { ...emptyFilters(), categories: (categories ?? "").split(",").filter(Boolean) };
    setView({ filters, period: account ? { mode: "all", anchor: systemClock.today() } : saved.period });
    setReady(true);
    return () => setView({ filters: saved.filters, period: saved.period });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [atTop, setAtTop] = useState(true);
  if (!ready) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  const single = category ? categoryById(data, category) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <PeriodPager
        header={
          <>
            <PeriodBar />
            {single ? <CategoryCard id={single.id} /> : null}
          </>
        }
        render={(period, isCurrent) => <OperationsPage period={period} query="" active selection={false} selectedSet={noSelection} onPress={openOne} onLongPress={nothing} onTop={isCurrent ? setAtTop : undefined} />}
      />
      <Fab label="Add" collapsed={!atTop} onPress={() => openAddMenu()} />
    </View>
  );
}

// The card of a single category: what its operations of the period add up to (`filtered-card`).
function CategoryCard({ id }: { id: string }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period, filters } = useView();
  const c = categoryById(data, id);
  if (!c) return null;
  const ops = operationsIn(data, period, filters);
  const total = categoryTotalIn(data, reportRows(data, ops), c);
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 6, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: p.line }}>
      <Text style={{ color: p.muted, fontSize: 13, marginBottom: 10 }}>{t.t("Sum of operations for the period")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ToneBadge icon={c.icon} color={c.color} size={44} iconSize={24} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.ink, fontSize: 16, fontWeight: "600" }}>{c.name}</Text>
          <Text style={{ color: p.muted, fontSize: 13 }}>{t.t("Operations: {n}", { n: ops.length })}</Text>
        </View>
        <Text style={{ color: p.ink, fontSize: 17 }}>{money(total, c.currency)}</Text>
      </View>
    </View>
  );
}
