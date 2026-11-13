// The Operations tab (js/screens/operations/list.js): the header with the search, the period bar,
// the filter banner, the opening and closing balance, days with their operations, the round Add
// button, and the selection mode with its own header and actions.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { systemClock } from "../domain/dates.ts";
import { newestFirst } from "../domain/ledger.ts";
import { convert } from "../domain/money.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../domain/periods.ts";
import type { Operation } from "../domain/types.ts";
import { applyBulkChanges, deleteOperations, emptyBulkChanges } from "../domain/operations.ts";
import { appStore, useAppState, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { Card, Icon, Label } from "../ui/kit.tsx";
import { Fab, MoneyText, useFabCollapse } from "../ui/parts.tsx";
import { chrome } from "../ui/theme.ts";
import { openAddMenu } from "./add-menu.tsx";
import { DayHead, FilteredBanner, OperationRow } from "./operation-row.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { RootHero } from "./root-hero.tsx";
import { setView, useView } from "./ui-state.ts";
import { openFilters } from "./filters-panel.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";
import { openBulkEdit } from "./bulk-edit.tsx";
import { confirmDialog, toast } from "../ui/dialogs.tsx";

type Item = { kind: "day"; date: string; ops: Operation[] } | { kind: "op"; op: Operation };

// Balance of the accounts the filter lets through, at the end of a day (or before it).
function balanceAt(data: ReturnType<typeof useLedger>, filters: Filters, date: string, exclusive: boolean): number {
  return data.accounts
    .filter((a) => a.include && !a.archived && (!filters.accounts || filters.accounts.includes(a.id)))
    .reduce((sum, a) => {
      const own = a.opening + data.ops.filter((o) => (exclusive ? o.date < date : o.date <= date)).reduce((n, o) => n + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0), 0);
      return sum + convert(own, a.currency, data.settings.currency, data.rates);
    }, 0);
}

export function OperationsScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { period, filters } = useView();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const setFilters = (next: Filters) => setView({ filters: next });
  const [selected, setSelected] = useState<string[]>([]);
  const [selection, setSelection] = useState(false);
  const fab = useFabCollapse();
  const active = !!(filters.accounts || filters.categories || filters.types || filters.tags || filters.origin || query);
  const ops = useMemo(() => operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst), [data, period, query, filters]);

  // The tab bar gives its place to the actions of the selection.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: selection ? { display: "none" } : undefined });
  }, [navigation, selection]);

  const change = (ids: string[]) => {
    setSelected(ids);
    if (!ids.length) setSelection(false);
  };
  const toggle = (id: string) => change(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  // Rows get handlers that never change; they read the current selection from here.
  const live = useRef({ selection, toggle });
  live.current = { selection, toggle };
  const pressRow = useCallback((id: string) => (live.current.selection ? live.current.toggle(id) : openEditor({ id })), []);
  const holdRow = useCallback((id: string) => {
    setSelection(true);
    live.current.toggle(id);
  }, []);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const here = ops.map((o) => o.id);
  const chosen = here.filter((id) => selected.includes(id)).length;
  const all = !!here.length && chosen === here.length;

  const removeSelected = () => {
    if (!selected.length) return;
    confirmDialog("The selected operations will be permanently deleted. Recovery will only be possible if a backup is available.", () => run((tx) => (deleteOperations(tx, selected), true)) && (setSelected([]), setSelection(false)), true, "Delete", t.t("Balances of the accounts change by them."), () => { try { appStore().createBackup("safety"); return true; } catch { return false; } });
  };
  const changeDate = () =>
    openCalendar(systemClock.today(), (date) => {
      const planned = run((tx, env) => applyBulkChanges(tx, selected, { ...emptyBulkChanges(), date }, env));
      if (planned) toast("Saved as a scheduled payment");
    });

  const header = selection ? (
    <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: p.bg }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Exit selection")} onPress={() => (setSelection(false), setSelected([]))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={24} color={p.ink} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 19, fontWeight: "500" }}>{t.t("Selected: {n}", { n: selected.length })}</Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: all ? true : chosen ? "mixed" : false, disabled: !here.length }}
        disabled={!here.length}
        onPress={() => change(all ? selected.filter((id) => !here.includes(id)) : [...selected.filter((id) => !here.includes(id)), ...here])}
        style={{ minWidth: 42, height: 42, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="clipboardList" size={26} color={p.ink} />
      </Pressable>
    </View>
  ) : search ? (
    <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: p.bg }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Close search")} onPress={() => (setSearch(false), setQuery(""))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
        <Icon name="back" size={24} color={p.ink} />
      </Pressable>
      <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={t.t("Search by comments")} placeholderTextColor={p.muted} style={{ flex: 1, color: p.ink, fontSize: 16, paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: p.muted }} />
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Filters")} onPress={() => openFilters(filters, setFilters)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
        <Icon name={active ? "filterOff" : "filter"} size={24} color={p.ink} />
      </Pressable>
    </View>
  ) : (
    <RootHero icon="more" label="Operation search" onAction={() => setSearch(true)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {header}
      <PeriodPager
        header={
          <>
            <PeriodBar />
            {active ? <FilteredBanner onChange={() => openFilters(filters, setFilters)} onClear={() => (setFilters(emptyFilters()), setQuery(""))} /> : null}
          </>
        }
        render={(shown, isCurrent) => (
          <OperationsPage
            period={shown}
            query={query}
            active={active}
            selection={selection}
            selectedSet={selectedSet}
            onPress={pressRow}
            onLongPress={holdRow}
            onTop={isCurrent ? fab.setAtTop : undefined}
          />
        )}
      />
      {selection ? (
        <View style={{ flexDirection: "row", gap: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(chrome.navMinBottom, insets.bottom), backgroundColor: p.nav }}>
          {([["trash", "Delete", removeSelected], ["calendar", "Date", changeDate], ["circleUp", "More", () => selected.length && openBulkEdit(selected, () => (setSelected([]), setSelection(false)))]] as const).map(([icon, label, action]) => (
            <Pressable key={label} accessibilityRole="button" onPress={action} style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: pressed ? p.soft : p.key })}>
              <Icon name={icon} size={24} color={p.ink} />
              <Text style={{ color: p.ink, fontSize: 13, fontWeight: "500" }}>{t.t(label)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Fab label="Add" collapsed={fab.collapsed} onPress={() => openAddMenu()} />
      )}
    </View>
  );
}

// The list of one period: drawn for the current period and, beforehand, for its neighbours.
export const OperationsPage = memo(function OperationsPage({ period, query, active, selection, selectedSet, onPress, onLongPress, onTop }: { period: Period; query: string; active: boolean; selection: boolean; selectedSet: Set<string>; onPress: (id: string) => void; onLongPress: (id: string) => void; onTop?: (top: boolean) => void }) {
  const data = useLedger();
  const state = useAppState();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { filters } = useView();
  const ops = useMemo(() => operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst), [data, period, query, filters]);
  const posted = state.status === "ready" ? state.posted : [];
  const items = useMemo(() => {
    const out: Item[] = [];
    // One pass: the list is already newest first, so the days follow each other.
    const days = new Map<string, Operation[]>();
    for (const o of ops) {
      const day = days.get(o.date);
      if (day) day.push(o);
      else days.set(o.date, [o]);
    }
    for (const [date, dayOps] of days) out.push({ kind: "day", date, ops: dayOps }, ...dayOps.map((op): Item => ({ kind: "op", op })));
    return out;
  }, [ops]);

  // The day name that stays at the top while its operations pass. It is drawn over the list from what the list
  // reports as the first visible row — not by the scroll view's own sticky headers, which for a list that
  // draws only the rows near the window pin the wrong cell (a stale row stuck at the top) and need the list to
  // be rebuilt whenever the days change.
  const dayOps = useMemo(() => new Map(items.flatMap((x) => (x.kind === "day" ? [[x.date, x.ops] as const] : []))), [items]);
  const [stuck, setStuck] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const headerHeight = useRef(0);
  const viewable = useRef(({ viewableItems }: { viewableItems: { item: Item }[] }) => {
    const first = viewableItems[0]?.item;
    setStuck(first ? (first.kind === "day" ? first.date : first.op.date) : null);
  }).current;
  const scrolled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setPinned((was) => (y >= headerHeight.current && y > 0 ? true : was && y > headerHeight.current - 2 ? was : false));
      onTop?.(y < 12);
    },
    [onTop],
  );
  const [from, to] = periodBounds(period, data.settings);
  const summary = data.settings.opening && ops.length > 0 && !active;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(x) => (x.kind === "day" ? "d" + x.date : x.op.id)}
        onScroll={scrolled}
        scrollEventThrottle={32}
        onViewableItemsChanged={viewable}
        viewabilityConfig={VIEWABILITY}
        // Enough rows are drawn at once to fill the screen, and ahead of the finger a few screens of them, so
        // that a quick scroll does not run into empty space.
        initialNumToRender={28}
        maxToRenderPerBatch={24}
        updateCellsBatchingPeriod={16}
        windowSize={13}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: selection ? 4 : chrome.fab + chrome.edgeGap * 2 }}
        ListHeaderComponent={
          <View style={{ marginHorizontal: -16 }} onLayout={(e) => (headerHeight.current = e.nativeEvent.layout.height)}>
            <View style={{ paddingHorizontal: 16 }}>
              {posted.length ? (
                <Pressable onPress={() => appStore().forgetPosted()}>
                  <Card>
                    <Text style={{ color: p.ink }}>{t.tc("A scheduled payment was added", "{n} scheduled payments were added", posted.length)}</Text>
                    <Label>{t.t("Tap to hide")}</Label>
                  </Card>
                </Pressable>
              ) : null}
              {summary ? (
                <View style={{ flexDirection: "row", justifyContent: "space-around", borderWidth: 1, borderColor: p.line, borderRadius: 10, marginBottom: 4, paddingVertical: 9, paddingHorizontal: 4, minHeight: 54 }}>
                  {([["Opening balance", balanceAt(data, filters, from, true)], ["Closing balance", balanceAt(data, filters, to, false)]] as const).map(([label, value]) => (
                    <View key={label} style={{ alignItems: "center" }}>
                      <Text style={{ color: p.ink, fontSize: 13 }}>{t.t(label)}</Text>
                      <MoneyText text={money(value, data.settings.currency, true)} value={value} size={17} style={{ marginTop: 4 }} />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
            <Text style={{ color: p.ink, fontSize: 20 }}>{t.t("Empty")}</Text>
            <Text style={{ color: p.muted, textAlign: "center" }}>{t.t("Start adding expenses or income and the data will appear")}</Text>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "day" ? (
            <DayHead date={item.date} ops={item.ops} />
          ) : (
            <OperationRow op={item.op} selecting={selection} selected={selectedSet.has(item.op.id)} onPress={onPress} onLongPress={onLongPress} />
          )
        }
      />
      {pinned && stuck && dayOps.get(stuck) ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 16, right: 16 }}>
          <DayHead date={stuck} ops={dayOps.get(stuck)!} />
        </View>
      ) : null}
    </View>
  );
});

const VIEWABILITY = { itemVisiblePercentThreshold: 1, minimumViewTime: 0 } as const;
