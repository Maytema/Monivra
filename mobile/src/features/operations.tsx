// The Operations tab (js/screens/operations/list.js): the header with the search, the period bar,
// the filter banner, the opening and closing balance, days with their operations, the round Add
// button, and the selection mode with its own header and actions.
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { FlatList, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { systemClock } from "../domain/dates.ts";
import { balancesAround, newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../domain/periods.ts";
import type { Operation } from "../domain/types.ts";
import { applyBulkChanges, deleteOperations, emptyBulkChanges } from "../domain/operations.ts";
import { haptic } from "../platform/haptics.ts";
import { appStore, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { Icon } from "../ui/kit.tsx";
import { Fab, MoneyText, useFabCollapse } from "../ui/parts.tsx";
import { useSpotlit } from "../ui/spotlight.tsx";
import { chrome } from "../ui/theme.ts";
import { openAddMenu } from "./add-menu.tsx";
import { DayHead, FilteredBanner, OperationRow } from "./operation-row.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { RootHero } from "./root-hero.tsx";
import { setView, useView } from "./ui-state.ts";
import { openFilters } from "./filters-panel.tsx";
import { PostedBanner } from "./posted-banner.tsx";
import { listingOnTop } from "./reveal.ts";
import { openEditor } from "./editor/editor-sheet.tsx";
import { openBulkEdit } from "./bulk-edit.tsx";
import { confirmDialog, toast } from "../ui/dialogs.tsx";
import { EmptyState } from "../ui/empty-state.tsx";

type Item = { kind: "day"; date: string; ops: Operation[] } | { kind: "op"; op: Operation };

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

  // The list is on the screen while this tab is in focus (a saved operation is lit there, else a notice leads to it).
  useFocusEffect(
    useCallback(() => {
      listingOnTop(true);
      return () => listingOnTop(false);
    }, []),
  );
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
    // The selection starts with a short touch signal (js/app/long-press.js).
    if (!live.current.selection) haptic("tick");
    setSelection(true);
    live.current.toggle(id);
  }, []);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const here = ops.map((o) => o.id);
  const chosen = here.filter((id) => selected.includes(id)).length;
  const all = !!here.length && chosen === here.length;

  // The three actions of the selection bar work on what is selected; with nothing selected they say so.
  const withSelection = (action: () => void) => () => (selected.length ? action() : toast("Select operations"));
  const removeSelected = withSelection(() => {
    confirmDialog("The selected operations will be permanently deleted. Recovery will only be possible if a backup is available.", () => run((tx) => (deleteOperations(tx, selected), true)) && (setSelected([]), setSelection(false)), true, "Delete", t.t("Balances of the accounts change by them."), () => { try { appStore().createBackup("safety"); return true; } catch { return false; } });
  });
  const changeDate = withSelection(() =>
    openCalendar(systemClock.today(), (date) => {
      const planned = run((tx, env) => applyBulkChanges(tx, selected, { ...emptyBulkChanges(), date }, env));
      if (planned) toast("Saved as a scheduled payment");
    }),
  );
  const openMore = withSelection(() => openBulkEdit(selected, () => (setSelected([]), setSelection(false))));

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
        accessibilityLabel={t.t(all ? "Deselect all in this period" : "Select all in this period")}
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
            current={isCurrent}
            onTop={isCurrent ? fab.setAtTop : undefined}
          />
        )}
      />
      {selection ? (
        <View style={{ flexDirection: "row", gap: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(chrome.navMinBottom, insets.bottom), backgroundColor: p.nav }}>
          {([["trash", "Delete", removeSelected], ["calendar", "Date", changeDate], ["circleUp", "More", openMore]] as const).map(([icon, label, action]) => (
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

// The day name that stays at the top while its operations pass. It is drawn over the list from what the list
// reports as the first visible row — not by the scroll view's own sticky headers, which for a list that
// draws only the rows near the window pin the wrong cell (a stale row stuck at the top) and need the list to
// be rebuilt whenever the days change. It keeps its own state, so scrolling draws only this small piece again,
// never the list.
interface StickyHandle {
  first(date: string | null): void;
  scrolled(y: number, headerHeight: number): void;
}
function StickyDay({ days, ref }: { days: Map<string, Operation[]>; ref: Ref<StickyHandle> }) {
  const [date, setDate] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      first: setDate,
      scrolled: (y, headerHeight) => setPinned((was) => (y >= headerHeight && y > 0 ? true : was && y > headerHeight - 2 ? was : false)),
    }),
    [],
  );
  const ops = pinned && date ? days.get(date) : undefined;
  if (!ops || !date) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 16, right: 16 }}>
      <DayHead date={date} ops={ops} />
    </View>
  );
}

// The list of one period: drawn for the current period and, beforehand, for its neighbours. The current page
// draws a few screens of rows around the window; a neighbour only what the first screen shows (that is all a
// swipe can uncover), and the rest when it becomes the current one.
export const OperationsPage = memo(function OperationsPage({ period, query, active, selection, selectedSet, onPress, onLongPress, onTop, current = true }: { period: Period; query: string; active: boolean; selection: boolean; selectedSet: Set<string>; onPress: (id: string) => void; onLongPress: (id: string) => void; onTop?: (top: boolean) => void; current?: boolean }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { filters } = useView();
  const ops = useMemo(() => operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst), [data, period, query, filters]);
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

  const list = useRef<FlatList<Item>>(null);
  // What was just saved or looked for is scrolled to: one row to the middle, several from the top one on.
  const lit = useSpotlit();
  useEffect(() => {
    if (!active || !lit.length) return;
    const found = items.map((x, i) => (x.kind === "op" && lit.includes(x.op.id) ? i : -1)).filter((i) => i >= 0);
    if (!found.length) return;
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: found[0]!, viewPosition: found.length > 1 ? 0 : 0.5, animated: true }), 120);
    return () => clearTimeout(timer);
  }, [active, lit, items]);
  const dayOps = useMemo(() => new Map(items.flatMap((x) => (x.kind === "day" ? [[x.date, x.ops] as const] : []))), [items]);
  const sticky = useRef<StickyHandle>(null);
  const headerHeight = useRef(0);
  const viewable = useRef(({ viewableItems }: { viewableItems: { item: Item }[] }) => {
    const first = viewableItems[0]?.item;
    sticky.current?.first(first ? (first.kind === "day" ? first.date : first.op.date) : null);
  }).current;
  const scrolled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      sticky.current?.scrolled(y, headerHeight.current);
      onTop?.(y < 12);
    },
    [onTop],
  );
  const [from, to] = periodBounds(period, data.settings);
  const summary = data.settings.opening && ops.length > 0 && !active;
  const balances = useMemo(() => (summary ? balancesAround(data, filters.accounts, from, to) : null), [summary, data, filters.accounts, from, to]);
  // The list is given the same pieces while nothing in them changed, so a scroll or the tick of the Add
  // button does not make it go through its rows again.
  const header = useMemo(
    () => (
      <View style={{ marginHorizontal: -16 }} onLayout={(e) => (headerHeight.current = e.nativeEvent.layout.height)}>
        <View style={{ paddingHorizontal: 16 }}>
          <PostedBanner />
          {balances ? (
            <View style={{ flexDirection: "row", justifyContent: "space-around", borderWidth: 1, borderColor: p.line, borderRadius: 10, marginBottom: 4, paddingVertical: 9, paddingHorizontal: 4, minHeight: 54 }}>
              {([["Opening balance", balances.opening], ["Closing balance", balances.closing]] as const).map(([label, value]) => (
                <View key={label} style={{ alignItems: "center" }}>
                  <Text style={{ color: p.ink, fontSize: 13 }}>{t.t(label)}</Text>
                  <MoneyText text={money(value, data.settings.currency, true)} value={value} size={17} style={{ marginTop: 4 }} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    ),
    [balances, p, t, money, data.settings.currency],
  );
  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === "day" ? <DayHead date={item.date} ops={item.ops} /> : <OperationRow op={item.op} selecting={selection} selected={selectedSet.has(item.op.id)} onPress={onPress} onLongPress={onLongPress} />,
    [selection, selectedSet, onPress, onLongPress],
  );
  const content = useMemo(() => ({ paddingHorizontal: 16, paddingBottom: selection ? 4 : chrome.fab + chrome.edgeGap * 2 }), [selection]);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength - 200), animated: true })}
        data={items}
        keyExtractor={keyOfItem}
        onScroll={scrolled}
        scrollEventThrottle={32}
        onViewableItemsChanged={viewable}
        viewabilityConfig={VIEWABILITY}
        // The first screen at once; then, for the current page, four screens of rows on each side of the
        // window, a screen at a time, so a quick scroll does not run into empty space and opening the tab or
        // moving to another period does not draw hundreds of rows before the first touch is answered.
        initialNumToRender={FIRST_SCREEN}
        maxToRenderPerBatch={FIRST_SCREEN}
        updateCellsBatchingPeriod={40}
        windowSize={current ? 9 : 1}
        contentContainerStyle={content}
        ListHeaderComponent={header}
        ListEmptyComponent={EMPTY}
        renderItem={renderItem}
      />
      <StickyDay ref={sticky} days={dayOps} />
    </View>
  );
});

const VIEWABILITY = { itemVisiblePercentThreshold: 1, minimumViewTime: 0 } as const;
// Rows that fill one screen (a row is about 74 dp high).
const FIRST_SCREEN = 12;
const keyOfItem = (x: Item): string => (x.kind === "day" ? "d" + x.date : x.op.id);
const EMPTY = <EmptyState kind="operations" title="Empty" hint="Start adding expenses or income and the data will appear" />;
