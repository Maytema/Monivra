// Statistics of the period: income, expenses, the difference, the average per day and the share of
// every category (with its subcategories) — all from the same report rows as reports and budgets.
import { useMemo } from "react";
import { Text, View } from "react-native";
import { categoryTotal, reportRows, totalByType } from "../domain/ledger.ts";
import { convert, shownPercent } from "../domain/money.ts";
import { emptyFilters, operationsIn, periodBounds } from "../domain/periods.ts";
import { parseDate } from "../domain/dates.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Card, Label, Money, Screen, Segmented } from "../ui/kit.tsx";
import { font, space } from "../ui/theme.ts";
import { PeriodBar } from "./period-bar.tsx";
import { setView, useView } from "./ui-state.ts";

export function StatisticsScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { period, catType } = useView();
  const rows = useMemo(() => reportRows(data, operationsIn(data, period, emptyFilters())), [data, period]);
  const income = totalByType(rows, "income"),
    expense = totalByType(rows, "expense");
  const [from, to] = periodBounds(period, data.settings);
  const first = period.mode === "all" ? (data.ops.reduce((a, o) => (o.date < a ? o.date : a), to) ?? to) : from;
  const days = Math.max(1, Math.round((parseDate(to).getTime() - parseDate(first).getTime()) / 86400000) + 1);
  const total = catType === "income" ? income : expense;
  const shares = data.categories
    .filter((c) => c.type === catType && !c.parent)
    .map((c) => ({ c, amount: categoryTotal(data, rows, c.id, catType) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const scheduledTotal = data.scheduled
    .filter((s) => s.type === catType)
    .reduce((n, s) => n + convert(s.amount, data.accounts.find((a) => a.id === (s.from || s.to))?.currency, data.settings.currency, data.rates), 0);
  return (
    <Screen>
      <PeriodBar />
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
      <Card>
        <Label>{t.t("Difference")}</Label>
        <Money value={income - expense} text={money(income - expense)} size={font.title} />
        <Label>{`${t.t("Average expense per day")}: ${money(Math.round(expense / days))}`}</Label>
      </Card>
      <Segmented value={catType} options={[{ value: "expense", label: "Expenses" }, { value: "income", label: "Income" }] as const} onChange={(v) => setView({ catType: v })} />
      <Card>
        {shares.length ? (
          shares.map(({ c, amount }) => {
            const share = total ? (amount / total) * 100 : 0;
            return (
              <View key={c.id} style={{ gap: 4, paddingVertical: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
                  <Badge icon={c.icon} color={c.color} size={26} />
                  <Text style={{ flex: 1, color: p.ink }}>{c.name}</Text>
                  <Text style={{ color: p.ink, fontWeight: "600" }}>{money(amount)}</Text>
                  <Text style={{ color: p.muted, width: 56, textAlign: "right" }}>{shownPercent(share)} %</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: p.line }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, share)}%`, backgroundColor: c.color }} />
                </View>
              </View>
            );
          })
        ) : (
          <Label>{t.t("Nothing in this period")}</Label>
        )}
      </Card>
      <Card>
        <Label>{t.t(catType === "income" ? "Scheduled incomes" : "Scheduled expenses")}</Label>
        <Text style={{ color: p.ink, fontWeight: "600" }}>{money(scheduledTotal)}</Text>
      </Card>
    </Screen>
  );
}
