// The page with the operations of one account (opened from the account's sheet): all time, newest first.
import { useMemo } from "react";
import { FlatList, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { systemClock } from "../domain/dates.ts";
import { accountById, newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Money, Row } from "../ui/kit.tsx";
import { space } from "../ui/theme.ts";
import { operationLook } from "./operations.tsx";

export function FilteredOperations() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const found = accountById(data, account);
  const ops = useMemo(
    () => (found ? operationsIn(data, { mode: "all", anchor: systemClock.today() }, { ...emptyFilters(), accounts: [found.id] }).sort(newestFirst) : []),
    [data, found],
  );
  return (
    <FlatList
      style={{ backgroundColor: p.bg }}
      data={ops}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: space.l }}
      ListEmptyComponent={<Text style={{ color: p.muted, textAlign: "center", padding: space.xl }}>{t.t("No operations in this period")}</Text>}
      renderItem={({ item: o }) => {
        const look = operationLook(data, o, t);
        const shown = o.type === "transfer" ? o.amount : look.sign * o.amount;
        return (
          <Row
            left={<Badge icon={look.icon} color={look.color} size={36} />}
            title={look.title}
            subtitle={[t.day(o.date), look.account, o.comment].filter(Boolean).join(" · ")}
            right={<Money value={o.type === "transfer" ? 0 : shown} text={money(shown, look.currency)} />}
            onPress={() => router.push({ pathname: "/operation", params: { id: o.id } })}
          />
        );
      }}
    />
  );
}
