// The scheduled payments page (js/screens/scheduled-budgets.js): days with their payments, each with its
// time, repeat, reminder and fees under the row; the sort dialog; the button that creates a payment
// (date, time, repeat, reminder, then the usual chooser); and the question about payments that are far
// behind (add what was missed, or carry on from the next occurrence).
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { accountById, categoryById } from "../domain/ledger.ts";
import { applyFees } from "../domain/money.ts";
import { earliestScheduleDate } from "../domain/operations.ts";
import { missedPayments, reminderForTime, settleMissed } from "../domain/scheduled.ts";
import type { Recurrence, Reminder, ScheduledPayment } from "../domain/types.ts";
import { appStore, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { openCalendar, PrimaryPill, TextButton } from "../ui/calendar-sheet.tsx";
import { DialogActions, DialogTitle, optionDialog } from "../ui/dialogs.tsx";
import { Button, Card, Icon, Label, Screen } from "../ui/kit.tsx";
import { Fab } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { mix } from "../ui/theme.ts";
import { openAddMenu } from "./add-menu.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";
import { openRecurrence, openReminder, openTime } from "./editor/options.tsx";
import { OperationRow } from "./operation-row.tsx";

const REPEAT: Record<string, [string, string]> = {
  Days: ["Every day", "Every {n} days"],
  Weeks: ["Every week", "Every {n} weeks"],
  Months: ["Every month", "Every {n} months"],
  Years: ["Every year", "Every {n} years"],
};

function useRuleText() {
  const t = useT();
  const recurText = (r: Recurrence): string => {
    const [one, many] = REPEAT[r.unit] ?? ["", ""];
    const weekdays = r.unit === "Weeks" && r.days.length ? " · " + r.days.map((n) => t.weekday(n, "short")).join(", ") : "";
    return (r.every === 1 ? t.t(one) : t.tc(one, many, r.every)) + weekdays + (r.remaining === null ? "" : ` (${t.t("Remaining: {n}", { n: r.remaining })})`);
  };
  const reminderText = (r: Reminder): string => (r.before === 0 ? t.t("On the same day at {time}", { time: r.time }) : t.t("{interval} before at {time}", { interval: `${r.before} ${t.t(r.unit)}`, time: r.time }));
  return { recurText, reminderText };
}

// What goes under a payment: fees with the net amount, time, repeat and reminder.
function Details({ item }: { item: ScheduledPayment }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { recurText, reminderText } = useRuleText();
  const account = accountById(data, item.from || item.to);
  const { steps, net } = applyFees(item.amount, item.fees);
  const line = (icon: string, text: string, key: string) => (
    <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
      <Icon name={icon} size={18} color={p.muted} />
      <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>{text}</Text>
    </View>
  );
  const rules = [item.time ? line("clock", item.time, "t") : null, item.recur ? line("repeat", recurText(item.recur), "r") : null, item.reminder ? line("bell", reminderText(item.reminder), "b") : null].filter(Boolean);
  if (!rules.length && !item.fees?.length) return null;
  return (
    <View style={{ marginLeft: 56, marginBottom: 8 }}>
      {item.fees?.length ? (
        <View style={{ paddingBottom: 4 }}>
          {steps.map(({ fee, delta }) => (
            <View key={fee.kind} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
              <Icon name="link" size={18} color={p.muted} />
              <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>
                {t.t(fee.kind === "tax" ? "Tax" : "Commission")} ({fee.add ? "+" : "−"}
                {fee.percent && fee.percent > 0 ? `${fee.percent} %` : fee.value})
              </Text>
              <Text style={{ color: delta < 0 ? p.negativeInk : p.positiveInk, fontSize: 14 }}>{money(Math.abs(delta), account?.currency)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
            <Icon name={account?.icon ?? "wallet"} size={18} color={p.muted} />
            <Text style={{ flex: 1, color: p.muted, fontSize: 14 }}>{t.t("Operation")}</Text>
            <Text style={{ color: p.muted, fontSize: 14 }}>{money(net, account?.currency)}</Text>
          </View>
        </View>
      ) : null}
      {rules.length ? <View style={{ borderRadius: 10, backgroundColor: mix(p.accent, p.bg, 0.08), paddingHorizontal: 12, paddingVertical: 6 }}>{rules}</View> : null}
    </View>
  );
}

// "Select date": the date, then time, repeat and reminder as tiles, then the chooser of the payment.
function CreateDialog() {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const today = appStore().env.clock.today();
  const earliest = earliestScheduleDate(today);
  const [setup, setSetup] = useState<{ date: string; time: string; recur: Recurrence | null; reminder: Reminder | null }>({ date: earliest, time: appStore().env.clock.time(), recur: null, reminder: null });
  const { recurText, reminderText } = useRuleText();
  const tile = (icon: string, title: string, value: string | null, onPress: () => void, on = !!value) => (
    <Pressable key={title} accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: on ? mix(p.accent, p.line, 0.6) : p.line, backgroundColor: on ? mix(p.accent, p.bg, 0.1) : "transparent" }}>
      <Icon name={icon} size={28} color={p.ink} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.muted, fontSize: 12 }}>{t.t(title)}</Text>
        <Text style={{ color: p.ink, fontSize: 16 }}>{value ?? t.t("Turned off")}</Text>
      </View>
    </Pressable>
  );
  const changeTime = (time: string) => setSetup((s) => ({ ...s, time, reminder: reminderForTime(s.reminder, s.time, time) }));
  const dateTitle = `${t.weekday(setup.date)}, ${t.day(setup.date, true)}`;
  return (
    <View>
      <DialogTitle>{t.t("Select date")}</DialogTitle>
      <View style={{ gap: 10 }}>
        {tile("calendar", "Date", dateTitle, () => openCalendar(setup.date, (date) => setSetup((s) => ({ ...s, date })), earliest), true)}
        {tile("clock", "Time", setup.time, () => openTime(setup.time, changeTime), true)}
        {tile("repeat", "Recur", setup.recur && recurText(setup.recur), () => openRecurrence(setup.recur, (recur) => setSetup((s) => ({ ...s, recur }))))}
        {tile("bell", "Reminder", setup.reminder && reminderText(setup.reminder), () => openReminder(setup.reminder, setup.time, (reminder) => setSetup((s) => ({ ...s, reminder }))))}
      </View>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="Complete"
          onPress={() => {
            close();
            openAddMenu({ date: setup.date, time: setup.time, recur: setup.recur, reminder: setup.reminder });
          }}
        />
      </DialogActions>
    </View>
  );
}
const openCreate = (): number => sheets.open(<CreateDialog />, "dialog");

export function ScheduledScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const env = appStore().env;
  const [descending, setDescending] = useState(false);
  const missed = missedPayments(data.scheduled, env);
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const sorted = [...data.scheduled].sort((a, b) => (descending ? cmp(b.date, a.date) : cmp(a.date, b.date)) || cmp(a.time ?? "", b.time ?? ""));
  const dates = [...new Set(sorted.map((o) => o.date))];
  const dayTitle = (date: string) => `${t.day(date)}, ${t.weekday(date)}`;
  const sort = () =>
    optionDialog<"asc" | "desc">(
      "Sort by date",
      [
        { value: "asc", label: "Ascending date" },
        { value: "desc", label: "Descending date" },
      ],
      descending ? "desc" : "asc",
      (v) => setDescending(v === "desc"),
    );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen
        options={{
          title: t.t("Scheduled payments"),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t.t("Sort by date")} onPress={sort} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Icon name={descending ? "sortReverse" : "sort"} size={24} color={p.ink} />
            </Pressable>
          ),
        }}
      />
      <Screen padded={false}>
        {missed.map(({ item, count }) => (
          <View key={"m" + item.id} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Card>
              <Label>{t.t("A payment is far behind")}</Label>
              <Text style={{ color: p.ink, fontSize: 16 }}>{categoryById(data, item.category)?.name ?? accountById(data, item.to)?.name ?? "?"}</Text>
              <Label>{t.t("Missed occurrences: {n}", { n: count })}</Label>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Add what was missed" onPress={() => run((tx, e) => settleMissed(tx, item.id, true, e))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Skip" kind="outline" onPress={() => run((tx, e) => settleMissed(tx, item.id, false, e))} />
                </View>
              </View>
            </Card>
          </View>
        ))}
        {dates.length ? (
          <View style={{ paddingHorizontal: 11, paddingBottom: 96 }}>
            {dates.map((date) => (
              <View key={date}>
                <Text style={{ color: p.inkSoft, fontSize: 15, fontWeight: "500", paddingTop: 16, paddingBottom: 6, paddingHorizontal: 5 }}>{dayTitle(date)}</Text>
                {sorted
                  .filter((o) => o.date === date)
                  .map((o) => (
                    <View key={o.id}>
                      <OperationRow op={o} onPress={() => openEditor({ id: o.id, scheduled: true })} />
                      <Pressable accessibilityRole="button" onPress={() => openEditor({ id: o.id, scheduled: true })}>
                        <Details item={o} />
                      </Pressable>
                    </View>
                  ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 32 }}>
            <Icon name="calendar" size={88} color={p.accentInk} />
            <Text style={{ color: p.ink, fontSize: 20, fontWeight: "500", textAlign: "center", marginTop: 12, marginBottom: 8 }}>{t.t("Scheduled payments will be here")}</Text>
            <Text style={{ color: p.muted, fontSize: 14, textAlign: "center" }}>{t.t("Create your first scheduled payment")}</Text>
            <View style={{ width: "100%", maxWidth: 270, marginTop: 24 }}>
              <Button label="Create" onPress={openCreate} />
            </View>
          </View>
        )}
      </Screen>
      {dates.length ? <Fab label="Add" collapsed={false} onPress={openCreate} /> : null}
    </View>
  );
}
