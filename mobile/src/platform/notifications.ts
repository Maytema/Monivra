// Reminders as local notifications: the system shows them while the application is closed. They
// only remind; the payment is recorded by postDue when its day comes (at start, when the app comes
// back, every minute while it is open, and by the background task when the system runs it).
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { accountById, categoryById } from "../domain/ledger.ts";
import { formatAmount } from "../domain/money.ts";
import { upcomingReminders, reminderNumber, type PlannedReminder } from "../domain/reminders.ts";
import type { LedgerData } from "../domain/types.ts";
import { translator } from "../i18n/index.ts";

const CHANNEL = "payments";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !ask) return current.granted;
  const answer = await Notifications.requestPermissionsAsync();
  return answer.granted;
}

function text(data: LedgerData, r: PlannedReminder): { title: string; body: string } {
  const t = translator(data.settings.language);
  if (r.kind === "periodic" || !r.item) return { title: "Monivra", body: t.t("Enter today’s operations") };
  const item = r.item;
  const name =
    item.type === "transfer"
      ? `${accountById(data, item.from)?.name ?? ""} → ${accountById(data, item.to)?.name ?? ""}`
      : (categoryById(data, item.category)?.name ?? "");
  const currency = accountById(data, item.from || item.to)?.currency ?? data.settings.currency;
  return {
    title: t.t("Scheduled payment"),
    body: `${t.t("{title} is due on {date}", { title: name, date: t.day(item.date, false) })} · ${formatAmount(item.amount, currency, data.settings)}`,
  };
}

// Replaces every scheduled reminder with the plan for the next 60 days. Never throws: reminders are
// a convenience and must not stop anything else.
export async function rebuildReminders(data: LedgerData, today: string, now: string): Promise<number> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!data.settings.notifications || !(await notificationsAllowed(false))) return 0;
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: translator(data.settings.language).t("Scheduled payments"), importance: Notifications.AndroidImportance.HIGH });
    const plan = upcomingReminders(data, today, now, { days: 60, limit: 60 });
    for (const r of plan) {
      const [y, m, d] = r.day.split("-").map(Number) as [number, number, number];
      const [h, min] = r.time.split(":").map(Number) as [number, number];
      await Notifications.scheduleNotificationAsync({
        identifier: String(reminderNumber(r.key)),
        content: { ...text(data, r), data: { key: r.key, payment: r.item?.id ?? null } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, h, min), channelId: CHANNEL },
      });
    }
    return plan.length;
  } catch (error) {
    console.warn("reminders not scheduled", error);
    return 0;
  }
}

// "Run notification": the periodic reminder at once, on the same high-importance channel as the real ones, so it
// drops down from the top like them (without the channel it fell on the default one and only showed in the shade). False when notifications are not allowed.
export async function sendTestNotification(language: string): Promise<boolean> {
  if (!(await notificationsAllowed(true))) return false;
  const t = translator(language);
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CHANNEL, { name: t.t("Scheduled payments"), importance: Notifications.AndroidImportance.HIGH });
  await Notifications.scheduleNotificationAsync({ content: { title: "Monivra", body: t.t("Enter today’s operations"), data: { key: "test" } }, trigger: { channelId: CHANNEL } });
  return true;
}
