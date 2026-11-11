// Scheduled payments: what comes next, "Add now" and "Skip" for one occurrence, and the question about
// payments far behind (add what was missed, or carry on from the next occurrence).
import { Alert, View } from "react-native";
import { accountById, categoryById } from "../domain/ledger.ts";
import { missedPayments, processScheduled, settleMissed } from "../domain/scheduled.ts";
import { appStore, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, Card, Empty, Label, Row, Screen } from "../ui/kit.tsx";
import { space } from "../ui/theme.ts";
import { openEditor } from "./editor/editor-sheet.tsx";

const RULES: Record<string, string> = { Days: "Every day", Weeks: "Every week", Months: "Every month", Years: "Every year" };

export function ScheduledScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const env = appStore().env;
  const missed = missedPayments(data.scheduled, env);
  const sorted = [...data.scheduled].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const act = (id: string, post: boolean) =>
    Alert.alert(t.t(post ? "Add now" : "Skip"), t.t(post ? "One occurrence is added today; the payment moves to the next one." : "One occurrence is skipped; nothing is added."), [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t(post ? "Add now" : "Skip"), onPress: () => run((tx, e) => (processScheduled(tx, id, post, e), true)) },
    ]);
  return (
    <Screen>
      {missed.map(({ item, count }) => (
        <Card key={"m" + item.id}>
          <Label>{t.t("A payment is far behind")}</Label>
          <Row title={categoryById(data, item.category)?.name ?? accountById(data, item.to)?.name ?? "?"} subtitle={t.t("Missed occurrences: {n}", { n: count })} />
          <View style={{ flexDirection: "row", gap: space.s }}>
            <View style={{ flex: 1 }}>
              <Button label="Add what was missed" onPress={() => run((tx, e) => settleMissed(tx, item.id, true, e))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Skip" kind="outline" onPress={() => run((tx, e) => settleMissed(tx, item.id, false, e))} />
            </View>
          </View>
        </Card>
      ))}
      {sorted.length ? (
        sorted.map((s) => {
          const category = categoryById(data, s.category);
          const account = accountById(data, s.from || s.to);
          const title = s.type === "transfer" ? `${accountById(data, s.from)?.name ?? "?"} → ${accountById(data, s.to)?.name ?? "?"}` : (category?.name ?? "?");
          const rule = s.recur ? t.t(RULES[s.recur.unit] ?? "") : t.t("Once");
          return (
            <Card key={s.id}>
              <Row
                left={<Badge icon={category?.icon ?? "repeat"} color={category?.color ?? p.accent} size={36} />}
                title={title}
                subtitle={`${t.day(s.date)}${s.time ? " " + s.time : ""} · ${rule}`}
                right={<Label muted={false}>{money(s.amount, account?.currency)}</Label>}
                onPress={() => openEditor({ id: s.id, scheduled: true })}
              />
              <View style={{ flexDirection: "row", gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Button label="Add now" kind="outline" onPress={() => act(s.id, true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Skip" kind="text" onPress={() => act(s.id, false)} />
                </View>
              </View>
            </Card>
          );
        })
      ) : (
        <Empty text="No scheduled payments" />
      )}
      <Label>{t.t("Payments are recorded when their day comes, while the app is open or the next time it is opened.")}</Label>
    </Screen>
  );
}
