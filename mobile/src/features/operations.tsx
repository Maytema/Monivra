// The history: operations of the chosen period, newest first, grouped by day, with the period's totals.
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { accountById, categoryById, newestFirst, reportRows, totalByType } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import type { LedgerData, Operation } from "../domain/types.ts";
import { appStore, useAppState, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Card, Icon, Label, Money, Row } from "../ui/kit.tsx";
import { font, radius, space } from "../ui/theme.ts";
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
  const ops = useMemo(() => operationsIn(data, period, { ...emptyFilters(), comment: query }).sort(newestFirst), [data, period, query]);
  const rows = useMemo(() => reportRows(data, ops), [data, ops]);
  const income = totalByType(rows, "income"),
    expense = totalByType(rows, "expense");
  const posted = state.status === "ready" ? state.posted : [];
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
      <FlatList
        data={items}
        keyExtractor={(x) => (x.kind === "day" ? "d" + x.date : x.op.id)}
        contentContainerStyle={{ padding: space.l, paddingBottom: 100, gap: 2 }}
        ListHeaderComponent={
          <View style={{ gap: space.m, marginBottom: space.m }}>
            <PeriodBar />
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
              onPress={() => router.push({ pathname: "/operation", params: { id: o.id } })}
            />
          );
        }}
      />
      <AddButton />
    </View>
  );
}
