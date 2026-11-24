// The Operations tab (js/screens/operations/list.js): the header with the search, the period bar,
// the filter banner, the opening and closing balance, days with their operations, the round Add
// button, and the selection mode with its own header and actions.
import { countRender, now, perfFlags, perfLog, PERF_BUILD, selfTime } from "../platform/perf.ts";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { usePageReady } from "../ui/pager.tsx";
import { BackHandler, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { systemClock } from "../domain/dates.ts";
import { balancesAround, newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../domain/periods.ts";
import type { Operation } from "../domain/types.ts";
import { applyBulkChanges, deleteOperations, emptyBulkChanges } from "../domain/operations.ts";
import { haptic } from "../platform/haptics.ts";
import { appStore, useCommand, useLedgerView, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar } from "../ui/calendar-sheet.tsx";
import { Icon } from "../ui/kit.tsx";
import { Fab, MoneyText, useFabCollapse } from "../ui/parts.tsx";
import { useSpotlit } from "../ui/spotlight.tsx";
import { chrome } from "../ui/theme.ts";
import { openAddMenu } from "./add-menu.tsx";
import { DayHead, FilteredBanner, OperationRow } from "./operation-row.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { RootHero } from "./root-hero.tsx";
import { setView, useViewFilters, useViewPeriodWhile } from "./ui-state.ts";
import { openFilters } from "./filters-panel.tsx";
import { PostedBanner } from "./posted-banner.tsx";
import { listingOnTop } from "./reveal.ts";
import { openEditor, dateOfShownPeriod } from "./editor/editor-sheet.tsx";
import { openBulkEdit } from "./bulk-edit.tsx";
import { confirmDialog, toast } from "../ui/dialogs.tsx";
import { EmptyState } from "../ui/empty-state.tsx";

type Item = { kind: "day"; date: string; ops: Operation[] } | { kind: "op"; op: Operation };

export function OperationsScreen() {
  countRender("operations screen");
  const data = useLedgerView();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const filters = useViewFilters();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const setFilters = (next: Filters) => setView({ filters: next });
  const [selected, setSelected] = useState<string[]>([]);
  const [selection, setSelection] = useState(false);
  // The period matters to this screen only while operations are being selected ("select all"): a swipe of the period
  // does not draw the screen (its hero, its bars) again.
  const period = useViewPeriodWhile(selection);
  const fab = useFabCollapse();
  const active = !!(filters.accounts || filters.categories || filters.types || filters.tags || filters.origin || query);
  // The operations of the period are needed here only for "select all" of the selection; the pages list their own.
  // (Made on every swipe before, for nothing.)
  const ops = useMemo(() => (selection && period ? operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst) : []), [selection, data, period, query, filters]);

  // The list is on the screen while this tab is in focus (a saved operation is lit there, else a notice leads to it).
  useFocusEffect(
    useCallback(() => {
      listingOnTop(true);
      return () => listingOnTop(false);
    }, []),
  );
  // The system Back first leaves the selection, then the search, as in the first application
  // (js/ui/navigation.js goBack); only then does it go to the previous tab.
  const exits = useRef({ selection, search });
  exits.current = { selection, search };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (exits.current.selection) return setSelection(false), setSelected([]), true;
        if (exits.current.search) return setSearch(false), setQuery(""), true;
        return false;
      });
      return () => sub.remove();
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
        // Experiment (task "stable paging", 2026-11-21): the lists of two periods on each side are drawn beforehand —
        // a new list takes the longest to show its first rows of all the paged screens (speed check: 268 ms on the
        // emulator), and quick swipes reached undrawn pages here only (12–39 % of quick swipes, builds 117–119).
        around={2}
        header={
          <>
            <PeriodBar />
            {active ? <FilteredBanner onChange={() => openFilters(filters, setFilters)} onClear={() => (setFilters(emptyFilters()), setQuery(""))} /> : null}
          </>
        }
        render={(shown) => (
          <OperationsPage
            period={shown}
            query={query}
            active={active}
            selection={selection}
            selectedSet={selectedSet}
            onPress={pressRow}
            onLongPress={holdRow}
            onTop={fab.setAtTop}
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
        <Fab label="Add" collapsed={fab.collapsed} onPress={() => openAddMenu(undefined, dateOfShownPeriod())} />
      )}
    </View>
  );
}

// The list of one period: drawn for the current period and, beforehand, for its neighbours, all alike (nothing on a
// page depends on whether it is the current one, so a swipe does not draw the pages that are already there).
export const OperationsPage = memo(function OperationsPage({ period, query, active, selection, selectedSet, onPress, onLongPress, onTop }: { period: Period; query: string; active: boolean; selection: boolean; selectedSet: Set<string>; onPress: (id: string) => void; onLongPress: (id: string) => void; onTop?: (top: boolean) => void }) {
  countRender("operations page");
  const done = selfTime("page body");
  const began = PERF_BUILD ? now() : 0;
  // Speed-check build: a page drawn again, and which input changed (a new page counts as a mount).
  const seen = useRef<Record<string, unknown> | null>(null);
  if (PERF_BUILD) {
    const now_ = { period, query, active, selection, selectedSet, onPress, onLongPress, onTop };
    if (seen.current === null) perfLog("operations page mount", 0);
    else
      for (const k of Object.keys(now_) as (keyof typeof now_)[])
        if (seen.current[k] !== now_[k]) perfLog(`operations page prop changed: ${k}`, 0);
    seen.current = now_;
  }
  useLayoutEffect(() => {
    if (PERF_BUILD) perfLog("operations page built", now() - began);
  });
  // (An empty period has no rows to load: its picture is the content.)
  useLayoutEffect(() => {
    if (PERF_BUILD && (items.length === 0 || perfFlags.noList)) ready();
  });
  const data = useLedgerView();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const filters = useViewFilters();
  const ready = usePageReady();
  const ops = useMemo(() => timed("page: operations of the period", () => operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst)), [data, period, query, filters]);
  const items = useMemo(() => timed("page: rows and days", () => {
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
  }), [ops]);

  const list = useRef<FlashListRef<Item>>(null);
  // What was just saved or looked for is scrolled to: one row to the middle, several from the top one on.
  const lit = useSpotlit();
  useEffect(() => {
    if (!active || !lit.length) return;
    const found = items.map((x, i) => (x.kind === "op" && lit.includes(x.op.id) ? i : -1)).filter((i) => i >= 0);
    if (!found.length) return;
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: found[0]!, viewPosition: found.length > 1 ? 0 : 0.5, animated: true }), 120);
    return () => clearTimeout(timer);
  }, [active, lit, items]);
  const scrolled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      onTop?.(e.nativeEvent.contentOffset.y < 12);
    },
    [onTop],
  );
  const [from, to] = periodBounds(period, data.settings);
  const summary = data.settings.opening && ops.length > 0 && !active;
  const balances = useMemo(() => (summary ? timed("page: opening and closing balances", () => balancesAround(data, filters.accounts, from, to)) : null), [summary, data, filters.accounts, from, to]);
  // The list is given the same pieces while nothing in them changed, so a scroll or the tick of the Add
  // button does not make it go through its rows again.
  const header = useMemo(
    () => (
      <View>
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
      // The side margins are on each item, not on the list: the sticky head is drawn over the list without the list's
      // padding, and with it there its first letters were cut at the edge of the screen.
      item.kind === "day" ? (
        <View style={{ paddingHorizontal: 16, backgroundColor: p.bg }}>
          <DayHead date={item.date} ops={item.ops} />
        </View>
      ) : PERF_BUILD && perfFlags.plainRows ? (
        <View style={{ paddingHorizontal: 16, minHeight: 70 }}>
          <Text numberOfLines={1}>{item.op.id}</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <OperationRow op={item.op} selecting={selection} selected={selectedSet.has(item.op.id)} onPress={onPress} onLongPress={onLongPress} />
        </View>
      ),
    [selection, selectedSet, onPress, onLongPress, p.bg],
  );
  // The head of a day stays at the top while that day's rows pass under it, until the next day pushes it away.
  const sticky = useMemo(() => items.flatMap((x, i) => (x.kind === "day" ? [i] : [])), [items]);
  const content = useMemo(() => ({ paddingBottom: selection ? 4 : chrome.fab + chrome.edgeGap * 2 }), [selection]);
  const page = (
    <View style={{ flex: 1 }}>
      {PERF_BUILD && perfFlags.noList ? (
        // Speed-check build: the same rows without a list (the first 14, one after another): what the list itself costs.
        <View>
          {header}
          {items.slice(0, 14).map((item) => (
            <View key={keyOfItem(item)}>{renderItem({ item })}</View>
          ))}
        </View>
      ) : (
      <FlashList
        ref={list}
        // No scroll bar on a swiped page (components.css .swipe-page > .content).
        showsVerticalScrollIndicator={false}
        data={items}
        keyExtractor={keyOfItem}
        // Day heads and rows are kept apart, so a row scrolled away is reused for the next row, not for a head.
        getItemType={typeOfItem}
        onScroll={scrolled}
        scrollEventThrottle={32}
        // FlashList draws what is on the screen (and a little around it) and reuses the rows that leave it. The same
        // for every page, current or not, so a swipe changes nothing on the pages that are already drawn.
        contentContainerStyle={content}
        // The head of a day stays at the top while that day's rows pass under it, until the next day pushes it away:
        // one head drawn over the list and moved by the platform, not a head per day following the scroll.
        stickyHeaderIndices={sticky}
        stickyHeaderConfig={STICKY}
        ListHeaderComponent={header}
        ListEmptyComponent={EMPTY}
        renderItem={renderItem}
        onLoad={PERF_BUILD ? ({ elapsedTimeInMs }: { elapsedTimeInMs: number }) => (perfLog("list ready", elapsedTimeInMs), ready()) : undefined}
      />
      )}
    </View>
  );
  done();
  return page;
});

// Speed-check build: the time of one part of drawing a page.
function timed<T>(label: string, work: () => T): T {
  if (!PERF_BUILD) return work();
  const start = now();
  const result = work();
  perfLog(label, now() - start);
  return result;
}
const keyOfItem = (x: Item): string => (x.kind === "day" ? "d" + x.date : x.op.id);
const typeOfItem = (x: Item): string => x.kind;
const STICKY = { useNativeDriver: true, hideRelatedCell: true } as const;
const EMPTY = <EmptyState kind="operations" title="Empty" hint="Start adding expenses or income and the data will appear" />;
