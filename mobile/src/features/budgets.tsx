// Budgets (js/screens/budgets.js, category-select.js): the list grouped by period under the period bar,
// the page of one budget with the operations it counts, the form, and the choice of its categories.
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { budgetOperations, budgetState, deleteBudget, saveBudget } from "../domain/categories.ts";
import { categoryById } from "../domain/ledger.ts";
import { convert, shownPercent } from "../domain/money.ts";
import type { Budget, BudgetPeriod, Category } from "../domain/types.ts";
import { showError, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { appStore } from "../ui/app-context.tsx";
import { openAmountSheet } from "../ui/amount-sheet.tsx";
import { PrimaryPill, TextButton } from "../ui/calendar-sheet.tsx";
import { currencyName } from "../ui/currency-names.ts";
import { openCurrencySheet } from "../ui/currency-sheet.tsx";
import { confirmDialog, DialogActions, optionDialog, toast } from "../ui/dialogs.tsx";
import { FieldButton, FieldText } from "../ui/form.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { Meter, ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { ChosenMark, useSelection, useSelectionHeader } from "../ui/selection.tsx";
import { space } from "../ui/theme.ts";
import { periodTitle } from "../ui/period-title.ts";
import { compactText, numberText } from "../ui/number-text.ts";
import { EmptyState } from "../ui/empty-state.tsx";
import { DayHead, OperationRow } from "./operation-row.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";
import { getView, setView, useViewPeriod } from "./ui-state.ts";

const PERIODS: readonly BudgetPeriod[] = ["day", "week", "month", "year"];
const NAMES: Record<BudgetPeriod, string> = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
const DAYS: Record<BudgetPeriod, number> = { day: 1, week: 7, month: 30, year: 365 };
type Draft = Omit<Budget, "id"> & { id: string | null };

// A calendar icon with the number of days of the period.
function PeriodIcon({ period, size = 30 }: { period: BudgetPeriod; size?: number }) {
  const p = usePalette();
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Icon name="calendarBlank" size={size} color={p.accentInk} />
      <Text style={{ position: "absolute", top: size * 0.4, color: p.accentInk, fontSize: size * 0.3, fontWeight: "700" }}>{DAYS[period]}</Text>
    </View>
  );
}

// What is left of a limit, or by how much it is passed.
function Remainder({ left, currency }: { left: number; currency: string }) {
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const amount = money(Math.abs(left), currency);
  return <Text style={{ color: left < 0 ? p.negativeInk : p.positiveInk, fontSize: 14 }}>{left < 0 ? t.t("Over by {amount}", { amount }) : left === 0 ? t.t("Limit reached") : t.t("Left: {amount}", { amount })}</Text>;
}

function Scope({ b }: { b: Budget }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  if (!b.categories) return <Text style={{ color: p.muted, fontSize: 13 }}>{`${t.t("Categories")}: ${t.t("Entire expenses")}`}</Text>;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {b.categories.map((id) => {
        const c = categoryById(data, id);
        return c ? <ToneBadge key={id} icon={c.icon} color={c.color} size={30} iconSize={17} radius={15} /> : null;
      })}
    </View>
  );
}

function BudgetBody({ state, pinned = false, exact = false }: { state: ReturnType<typeof budgetState>; pinned?: boolean; exact?: boolean }) {
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { b, used, left, share } = state;
  const percent = (!exact && share >= 1000 ? compactText(shownPercent(share), t.locale) : numberText(shownPercent(share), t.locale, 2)) + "%";
  const title = <Text numberOfLines={1} style={{ flex: pinned ? 1 : 0, color: p.ink, fontSize: 17, fontWeight: "600" }}>{b.name}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {pinned ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {title}
          <Remainder left={left} currency={b.currency} />
        </View>
      ) : (
        title
      )}
      <Scope b={b} />
      <Text style={{ color: p.ink, fontSize: 15 }}>{`${money(used, b.currency)} / ${money(b.amount, b.currency)}`}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Meter percent={share} owed={left < 0} />
        <Text style={{ color: p.ink, fontSize: 14, minWidth: 44, textAlign: "right" }}>{percent}</Text>
      </View>
      {pinned ? null : <Remainder left={left} currency={b.currency} />}
    </View>
  );
}

function askDelete(run: ReturnType<typeof useCommand>, id: string, leave = false): void {
  confirmDialog(
    "Delete this budget?",
    () => {
      if (run((tx) => (deleteBudget(tx, id), true))) {
        toast("Budget deleted");
        if (leave) router.dismissTo("/budgets");
      }
    },
    true,
    "Delete",
  );
}

// A budget is looked at one month at a time; the page opens on a month and gives back the period it found.
function useMonthPeriod(mode: "month" | BudgetPeriod): void {
  const navigation = useNavigation();
  useEffect(() => {
    const before = getView().period;
    const anchor = ["all", "range"].includes(before.mode) ? appStore().env.clock.today() : before.anchor;
    setView({ period: { mode, anchor } }, false);
    // The period is given back when the page starts to go (before its closing animation), not when it is gone: the tabs
    // beneath are in front for the whole animation and showed the budgets' month until the page was removed, then jumped
    // back. (setView ignores a period equal to the current one, so nothing is redrawn when it did not change.)
    const off = (navigation as unknown as { addListener(e: string, f: () => void): () => void }).addListener("beforeRemove", () => setView({ period: before }, false));
    return () => {
      off();
      setView({ period: before }, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
}

export function BudgetsScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  useMonthPeriod("month");
  const period = useViewPeriod();
  const run = useCommand();
  const selection = useSelection();
  const states = data.budgets.map((b) => budgetState(data, b, period.anchor));
  const main = data.settings.currency;
  const remove = (ids: string[]) =>
    confirmDialog("Delete the selected budgets?", () => run((tx) => (ids.forEach((id) => deleteBudget(tx, id)), true)) && (toast("Budget deleted"), selection.clear()), true, "Delete");
  const header = useSelectionHeader(selection, data.budgets.map((b) => b.id), remove, {
    title: t.t("Budgets"),
    headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Create a budget")} onPress={() => router.push("/budget")} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <Icon name="plus" size={24} color={p.ink} />
      </Pressable>
    ),
  });
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={header} />
      {/* With no budgets there is nothing to page through: no period bar over the empty screen. */}
      {data.budgets.length ? <PeriodBar dayPicker /> : null}
      <ScrollView contentContainerStyle={{ padding: space.l, gap: 18 }}>
        {states.length ? (
          PERIODS.map((kind) => ({ kind, list: states.filter((s) => s.b.period === kind) }))
            .filter(({ list }) => list.length)
            .map(({ kind, list }) => {
              const sum = (pick: (s: (typeof list)[number]) => number) => list.reduce((total, s) => total + convert(pick(s), s.b.currency, main, data.rates), 0);
              return (
                <View key={kind} style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <PeriodIcon period={kind} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t(NAMES[kind])}</Text>
                      <Text style={{ color: p.muted, fontSize: 13 }}>{periodTitle({ mode: kind, anchor: period.anchor }, t, data.settings)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: p.muted, fontSize: 12 }}>{`${money(sum((s) => s.used))} / ${money(sum((s) => s.b.amount))}`}</Text>
                      <Remainder left={sum((s) => s.left)} currency={main} />
                    </View>
                  </View>
                  {list.map((s) => (
                    <Pressable
                      key={s.b.id}
                      accessibilityRole="button"
                      accessibilityState={selection.on ? { selected: selection.chosen.has(s.b.id) } : undefined}
                      onPress={() => (selection.on ? selection.toggle(s.b.id) : router.push({ pathname: "/budget-details", params: { id: s.b.id } }))}
                      // A long press chooses budgets to delete several at once (the one-budget actions are on its page).
                      onLongPress={() => selection.hold(s.b.id)}
                      style={{ padding: 16, borderWidth: selection.chosen.has(s.b.id) ? 2 : 1, borderColor: selection.chosen.has(s.b.id) ? p.accent : s.left < 0 ? p.negative : p.line, borderRadius: 16, backgroundColor: p.key }}
                    >
                      <BudgetBody state={s} />
                      {selection.on ? <ChosenMark chosen={selection.chosen.has(s.b.id)} /> : null}
                    </Pressable>
                  ))}
                </View>
              );
            })
        ) : (
          <EmptyState kind="budgets" title="Budgets will be here" hint="So far, it's empty. Create your first budget?" action="Create a budget" onAction={() => router.push("/budget")} />
        )}
      </ScrollView>
    </View>
  );
}

export function BudgetDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const b = data.budgets.find((x) => x.id === id);
  useMonthPeriod(b?.period ?? "month");
  const period = useViewPeriod();
  if (!b) return null;
  const ops = budgetOperations(data, b, period.anchor);
  const dates = [...new Set(ops.map((o) => o.date))];
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen
        options={{
          title: t.t("Budget"),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t.t("Edit budget")} onPress={() => router.push({ pathname: "/budget", params: { id: b.id } })} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Icon name="edit" size={24} color={p.ink} />
            </Pressable>
          ),
        }}
      />
      <PeriodBar dayPicker />
      <View style={{ marginHorizontal: space.l, marginBottom: 8, padding: 16, borderWidth: 1, borderColor: p.line, borderRadius: 16, backgroundColor: p.key }}>
        <BudgetBody state={budgetState(data, b, period.anchor)} pinned exact />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 11, paddingBottom: 32 }}>
        {ops.length ? (
          dates.map((date) => (
            <View key={date}>
              <DayHead date={date} ops={ops.filter((o) => o.date === date)} />
              {ops.filter((o) => o.date === date).map((o) => (
                <OperationRow key={o.id} op={o} onPress={() => openEditor({ id: o.id })} />
              ))}
            </View>
          ))
        ) : (
          <EmptyState kind="operations" title="Empty" hint="No expenses of this budget in the period" />
        )}
      </ScrollView>
    </View>
  );
}

// ---- The categories of a budget ------------------------------------------------------------------
function Box({ on }: { on: boolean }) {
  const p = usePalette();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? p.accent : p.muted, backgroundColor: on ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <Icon name="check" size={16} color={p.onAccent} /> : null}</View>
  );
}

function CategorySelect({ selected, onDone }: { selected: string[] | null; onDone: (ids: string[] | null) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const expense = data.categories.filter((c) => c.type === "expense");
  const parents = expense.filter((c) => !c.parent);
  const active = parents.filter((c) => !c.archived);
  const archived = parents.filter((c) => c.archived);
  const children = (id: string) => expense.filter((x) => x.parent === id);
  const [chosen, setChosen] = useState(() => new Set(selected ?? []));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [all, setAll] = useState(selected === null);
  const has = (c: Category) => chosen.has(c.id) || (!!c.parent && chosen.has(c.parent));
  const edit = (change: (s: Set<string>) => void) => {
    setAll(false);
    setChosen((old) => {
      const next = new Set(old);
      change(next);
      return next;
    });
  };
  const toggle = (c: Category) =>
    edit((s) => {
      if (all) s.clear();
      if (!c.parent) {
        const on = s.has(c.id);
        for (const x of [c, ...children(c.id)]) s.delete(x.id);
        if (!on) s.add(c.id);
      } else if (s.has(c.parent)) {
        // The rest of the group stays chosen one by one.
        s.delete(c.parent);
        for (const x of children(c.parent)) if (x.id !== c.id) s.add(x.id);
      } else if (s.has(c.id)) s.delete(c.id);
      else s.add(c.id);
    });
  const row = (c: Category, depth = 0): ReactNode => {
    const kids = children(c.id);
    return (
      <View key={c.id}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: depth * 28 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: has(c) }} onPress={() => toggle(c)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
            <ToneBadge icon={c.icon} color={c.color} size={34} iconSize={19} radius={17} />
            <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{c.name}</Text>
            <Box on={has(c)} />
          </Pressable>
          {kids.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.t("Subcategories")} onPress={() => setOpen((o) => { const n = new Set(o); if (!n.delete(c.id)) n.add(c.id); return n; })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Icon name={open.has(c.id) ? "up" : "down"} size={20} color={p.muted} />
            </Pressable>
          ) : null}
        </View>
        {open.has(c.id) ? kids.map((k) => row(k, depth + 1)) : null}
      </View>
    );
  };
  const card = (children_: ReactNode) => <View style={{ borderWidth: 1, borderColor: p.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 12, backgroundColor: p.key }}>{children_}</View>;
  return (
    <View style={{ maxHeight: 640 }}>
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{t.t("Select categories")}</Text>
      <ScrollView>
        {card(
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: all }}
            onPress={() => {
              if (!all) setChosen(new Set());
              setAll(!all);
            }}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}
          >
            <Text style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t("All expense categories")}</Text>
            <Box on={all} />
          </Pressable>,
        )}
        {/* Only expense categories: a budget never limits incomes. A tap on one picks it alone; the arrow opens its
            subcategories, which can be picked one by one. */}
        {card(<>{active.map((c) => row(c))}</>)}
        {archived.length ? (
          <>
            <Text style={{ color: p.muted, fontSize: 13, marginLeft: 6, marginBottom: 6 }}>{t.t("Expenses (archived)")}</Text>
            {card(<>{archived.map((c) => row(c))}</>)}
          </>
        ) : null}
      </ScrollView>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="Confirm"
          onPress={() => {
            close();
            onDone(all || chosen.size === 0 ? null : [...chosen]);
          }}
        />
      </DialogActions>
    </View>
  );
}

export function BudgetEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const existing = data.budgets.find((b) => b.id === id);
  const [draft, setDraft] = useState<Draft>(() => (existing ? { ...existing } : { id: null, name: "", currency: data.settings.currency, amount: 0, period: "month", categories: null }));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const scope = draft.categories ? draft.categories.map((c) => categoryById(data, c)?.name ?? "").join(", ") : t.t("All expense categories");
  const save = () => {
    try {
      if (run((tx, env) => saveBudget(tx, draft, env))) {
        toast("Budget saved");
        router.back();
      }
    } catch (e) {
      showError(t, e);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(existing ? "Edit budget" : "Create a budget") }} />
      <ScrollView contentContainerStyle={{ padding: space.l, gap: 14 }} keyboardShouldPersistTaps="handled">
        <FieldText boxed label="Title" value={draft.name} onChange={(name) => set({ name })} placeholder="Enter the title" />
        <FieldButton
          label="Time period"
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <PeriodIcon period={draft.period} size={26} />
              <Text style={{ color: p.accentInk, fontSize: 14 }}>{t.t(NAMES[draft.period])}</Text>
            </View>
          }
          onPress={() => optionDialog<BudgetPeriod>("Choose period", PERIODS.map((x) => ({ value: x, label: NAMES[x] })), draft.period, (period) => set({ period }))}
        />
        <FieldButton label="Categories" value={scope} caption={t.t(draft.categories ? "(Entirely)" : "(Entire expenses)")} onPress={() => sheets.open(<CategorySelect selected={draft.categories} onDone={(categories) => set({ categories })} />, "sheet")} />
        <FieldButton label="Budget currency" value={currencyName(draft.currency, t.locale)} onPress={() => openCurrencySheet(draft.currency, (currency) => set({ currency }))} />
        <FieldButton inline label="Budget" value={money(draft.amount, draft.currency)} onPress={() => openAmountSheet("Budget", draft.amount, (amount) => set({ amount }), false, draft.currency)} />
        <View style={{ gap: 10, paddingTop: 6 }}>
          <Button label={existing ? "Save" : "Create"} onPress={save} />
          {existing ? <Button label="Delete" kind="outline" onPress={() => askDelete(run, existing.id, true)} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}
