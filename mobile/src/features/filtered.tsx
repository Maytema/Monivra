// The page with the operations of one account (opened from the account's sheet): all time, newest
// first, in days like the Operations tab.
import { useMemo } from "react";
import { FlatList, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { systemClock } from "../domain/dates.ts";
import { accountById, newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import type { Operation } from "../domain/types.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { DayHead, OperationRow } from "./operation-row.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";

type Item = { kind: "day"; date: string; ops: Operation[] } | { kind: "op"; op: Operation };

export function FilteredOperations() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const found = accountById(data, account);
  const items = useMemo(() => {
    const ops = found ? operationsIn(data, { mode: "all", anchor: systemClock.today() }, { ...emptyFilters(), accounts: [found.id] }).sort(newestFirst) : [];
    const out: Item[] = [];
    for (const date of [...new Set(ops.map((o) => o.date))]) {
      const dayOps = ops.filter((o) => o.date === date);
      out.push({ kind: "day", date, ops: dayOps }, ...dayOps.map((op): Item => ({ kind: "op", op })));
    }
    return out;
  }, [data, found]);
  return (
    <FlatList
      style={{ backgroundColor: p.bg }}
      data={items}
      keyExtractor={(x) => (x.kind === "day" ? "d" + x.date : x.op.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 + insets.bottom }}
      ListEmptyComponent={<Text style={{ color: p.muted, textAlign: "center", padding: 32 }}>{t.t("No operations in this period")}</Text>}
      renderItem={({ item }) => (item.kind === "day" ? <DayHead date={item.date} ops={item.ops} /> : <OperationRow op={item.op} onPress={() => openEditor({ id: item.op.id })} />)}
    />
  );
}
