// The history: operations of the chosen period, newest first, grouped by day, with the period's totals.
import { useMemo, useState, type ReactNode } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { accountById, categoryById, newestFirst, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, type Filters } from "../domain/periods.ts";
import type { LedgerData, Operation } from "../domain/types.ts";
import { applyBulkChanges, deleteOperations, emptyBulkChanges, rememberTags, type BulkChanges } from "../domain/operations.ts";
import { appStore, useAppState, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, Card, Icon, Label, Money, Row } from "../ui/kit.tsx";
import { AccountPicker, CategoryPicker, Panel } from "../ui/pickers.tsx";
import { ChoiceField, Field } from "../ui/kit.tsx";
import { chrome, font, radius, space } from "../ui/theme.ts";
import { RootHero } from "./root-hero.tsx";
import { AddButton } from "./add-button.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { useView } from "./ui-state.ts";

// Title, icon and signed amount of an operation as a row of the history.
export function operationLook(data: LedgerData, o: Operation, t: ReturnType<typeof useT>) {
  const from = accountById(data, o.from),
    to = accountById(data, o.to),
    category = categoryById(data, o.category);
  if (o.type === "transfer")
    return { title: `${from?.name ?? "?"} → ${to?.name ?? "?"}`, icon: "transfer", color: "#7a7385", sign: 0, currency: from?.currency };
  if (o.type === "adjustment")
    return { title: t.t("Manual balance adjustment"), icon: "edit", color: "#7a7385", sign: o.to ? 1 : -1, currency: (to ?? from)?.currency, account: (to ?? from)?.name };
  return {
    title: category?.name ?? "?",
    icon: category?.icon ?? "tag",
    color: category?.color ?? "#a5a3c8",
    sign: o.type === "income" ? 1 : -1,
    currency: (from ?? to)?.currency,
    account: (from ?? to)?.name,
  };
}

export function OperationsScreen() {
  const data = useLedger();
  const state = useAppState();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period } = useView();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtering, setFiltering] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const toggleSelected = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const active = !!(filters.accounts || filters.categories || filters.types || filters.tags || filters.origin);
  const ops = useMemo(() => operationsIn(data, period, { ...filters, comment: query }).sort(newestFirst), [data, period, query, filters]);
  const rows = useMemo(() => reportRows(data, ops), [data, ops]);
  const income = totalByType(rows, "income"),
    expense = totalByType(rows, "expense");
  const posted = state.status === "ready" ? state.posted : [];
  const run = useCommand();
  const removeSelected = () =>
    Alert.alert(t.t("Delete the selected operations?"), t.t("Balances of the accounts change by them."), [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t("Delete"), style: "destructive", onPress: () => run((tx) => (deleteOperations(tx, selected), true)) && setSelected([]) },
    ]);
  const items = useMemo(() => {
    const out: ({ kind: "day"; date: string } | { kind: "op"; op: Operation })[] = [];
    let day = "";
    for (const op of ops) {
      if (op.date !== day) out.push({ kind: "day", date: (day = op.date) });
      out.push({ kind: "op", op });
    }
    return out;
  }, [ops]);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <RootHero />
      <FlatList
        data={items}
        keyExtractor={(x) => (x.kind === "day" ? "d" + x.date : x.op.id)}
        contentContainerStyle={{ padding: space.l, paddingBottom: chrome.fab + chrome.edgeGap * 2, gap: 2 }}
        ListHeaderComponent={
          <View style={{ gap: space.m, marginBottom: space.m }}>
            <PeriodBar />
            {selected.length ? (
              <Card>
                <Text style={{ color: p.ink, fontWeight: "600" }}>{t.t("Selected: {n}", { n: selected.length })}</Text>
                <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
                  <Button label="Edit" kind="outline" onPress={() => setBulk(true)} />
                  <Button label="Delete" kind="danger" onPress={() => removeSelected()} />
                  <Button label="Cancel" kind="text" onPress={() => setSelected([])} />
                </View>
              </Card>
            ) : null}
            {posted.length ? (
              <Pressable onPress={() => appStore().forgetPosted()}>
                <Card>
                  <Text style={{ color: p.ink }}>{t.tc("A scheduled payment was added", "{n} scheduled payments were added", posted.length)}</Text>
                  <Label>{t.t("Tap to hide")}</Label>
                </Card>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.m }}>
              <Card style={{ flex: 1 }}>
                <Label>{t.t("Income")}</Label>
                <Money value={income} text={money(income)} />
              </Card>
              <Card style={{ flex: 1 }}>
                <Label>{t.t("Expenses")}</Label>
                <Money value={-expense} text={money(expense)} />
              </Card>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: p.line, borderRadius: radius.pill, paddingHorizontal: space.m }}>
              <Icon name="search" size={18} color={p.muted} />
              <TextInput value={query} onChangeText={setQuery} placeholder={t.t("Search in comments")} placeholderTextColor={p.muted} style={{ flex: 1, color: p.ink, paddingVertical: 8, paddingHorizontal: space.s }} />
              <Pressable onPress={() => setFiltering(true)} hitSlop={10} accessibilityLabel={t.t("Filters")}>
                <Icon name={active ? "filterOff" : "filter"} size={20} color={active ? p.accentInk : p.muted} />
              </Pressable>
            </View>
            <Pressable onPress={() => router.push("/scheduled")}>
              <Label>{`${t.t("Scheduled payments")} (${data.scheduled.length}) ›`}</Label>
            </Pressable>
          </View>
        }
        ListEmptyComponent={<Text style={{ color: p.muted, textAlign: "center", padding: space.xl }}>{t.t("No operations in this period")}</Text>}
        renderItem={({ item }) => {
          if (item.kind === "day") return <Text style={{ color: p.muted, fontSize: font.small, marginTop: space.m }}>{t.day(item.date)}</Text>;
          const o = item.op;
          const look = operationLook(data, o, t);
          const shown = o.type === "transfer" ? o.amount : look.sign * o.amount;
          return (
            <Row
              left={<Badge icon={look.icon} color={look.color} size={36} />}
              title={look.title}
              subtitle={[look.account, o.comment, o.tags.join(", "), o.fromSchedule ? "⟳" : ""].filter(Boolean).join(" · ")}
              right={<Money value={o.type === "transfer" ? 0 : shown} text={money(shown, look.currency)} />}
              onPress={() => (selected.length ? toggleSelected(o.id) : router.push({ pathname: "/operation", params: { id: o.id } }))}
              onLongPress={() => toggleSelected(o.id)}
              selected={selected.includes(o.id)}
            />
          );
        }}
      />
      <AddButton />
      <BulkPanel visible={bulk} ids={selected} onDone={() => (setBulk(false), setSelected([]))} onClose={() => setBulk(false)} />
      <FiltersPanel visible={filtering} filters={filters} onChange={setFilters} onClose={() => setFiltering(false)} />
    </View>
  );
}

// Filters of the history: a field is an OR over its choices, the fields are ANDed (domain/periods.ts).
function FiltersPanel({ visible, filters, onChange, onClose }: { visible: boolean; filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const toggle = (key: "accounts" | "categories" | "types" | "tags", value: string) => {
    const list = filters[key] ?? [];
    const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    onChange({ ...filters, [key]: next.length ? next : null });
  };
  const chip = (key: "accounts" | "categories" | "types" | "tags", value: string, label: string) => {
    const on = filters[key]?.includes(value) ?? false;
    return (
      <Pressable key={key + value} onPress={() => toggle(key, value)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? p.accent : p.nav }}>
        <Text style={{ color: on ? p.onAccent : p.ink }}>{label}</Text>
      </Pressable>
    );
  };
  const group = (title: string, chips: ReactNode[]) =>
    chips.length ? (
      <View style={{ gap: 6 }}>
        <Label>{t.t(title)}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{chips}</View>
      </View>
    ) : null;
  return (
    <Panel visible={visible} title="Filters" onClose={onClose}>
      <View style={{ padding: space.l, gap: space.m }}>
        {group("Type", [chip("types", "expense", t.t("Expense")), chip("types", "income", t.t("Income")), chip("types", "transfer", t.t("Transfer"))])}
        {group("Accounts", data.accounts.filter((a) => !a.archived).map((a) => chip("accounts", a.id, a.name)))}
        {group("Categories", data.categories.filter((c) => !c.archived).map((c) => chip("categories", c.id, (c.parent ? "· " : "") + c.name)))}
        {group("Tags", data.tags.map((tag) => chip("tags", tag, tag)))}
        <Button label="Reset" kind="outline" onPress={() => onChange(emptyFilters())} />
      </View>
    </Panel>
  );
}

// The same change for many operations: category, account, comment, tags, date. Amounts never change
// with a comment, tags or date (domain/operations.ts); nothing changes if one of them is refused.
function BulkPanel({ visible, ids, onDone, onClose }: { visible: boolean; ids: string[]; onDone: () => void; onClose: () => void }) {
  const data = useLedger();
  const t = useT();
  const run = useCommand();
  const [changes, setChanges] = useState<BulkChanges>(emptyBulkChanges);
  const [tag, setTag] = useState("");
  const [picking, setPicking] = useState<"account" | "category" | null>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const apply = () => {
    const all = { ...changes, addTags: tag.trim() ? [tag.trim()] : [] };
    const planned = run((tx, env) => {
      rememberTags(tx, all.addTags);
      return applyBulkChanges(tx, ids, all, env);
    });
    if (planned === undefined) return;
    if (planned) Alert.alert(t.t("Saved as a scheduled payment"), t.t("An operation dated in the future waits among the scheduled payments until its day."));
    setChanges(emptyBulkChanges());
    setTag("");
    onDone();
  };
  return (
    <Panel visible={visible} title="Edit selected" onClose={onClose}>
      <View style={{ padding: space.l, gap: space.m }}>
        <ChoiceField label="Category" value={data.categories.find((c) => c.id === changes.category)?.name ?? t.t("Keep")} onPress={() => (setKind("expense"), setPicking("category"))} />
        <ChoiceField label="Account" value={data.accounts.find((a) => a.id === changes.account)?.name ?? t.t("Keep")} onPress={() => setPicking("account")} />
        <Field label="Comment" value={changes.comment ?? ""} onChange={(comment) => setChanges({ ...changes, comment })} placeholder="Keep" />
        <Field label="Add tag" value={tag} onChange={setTag} />
        <Button label="Apply" onPress={apply} />
      </View>
      <AccountPicker visible={picking === "account"} onPick={(a) => setChanges({ ...changes, account: a.id })} onClose={() => setPicking(null)} />
      <CategoryPicker visible={picking === "category"} type={kind} onPick={(c) => setChanges({ ...changes, category: c.id })} onClose={() => setPicking(null)} />
    </Panel>
  );
}
