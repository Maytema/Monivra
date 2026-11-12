// Reminders still to come, for the system to deliver while the application is closed (port of
// js/domain/reminders.js and reminder-plan.js). A reminder never moves money: the payment itself is
// posted by postDue. Pure: it looks only at the data and the moment.
import { addDays, addMonths } from "./dates.ts";
import { advanced } from "./scheduled.ts";
import type { LedgerData, LocalDate, LocalTime, ScheduledPayment } from "./types.ts";

// The day a payment's reminder falls on: `before` days, weeks, months or years ahead of it.
export function reminderDay(item: ScheduledPayment): LocalDate | null {
  if (!item.reminder) return null;
  const { before, unit } = item.reminder;
  if (unit === "Days") return addDays(item.date, -before);
  if (unit === "Weeks") return addDays(item.date, -7 * before);
  return addMonths(item.date, -(unit === "Years" ? 12 * before : before));
}

const FREQUENCIES: Record<string, (weekday: number) => boolean> = {
  "Every day": () => true,
  Weekdays: (day) => day >= 1 && day <= 5,
  Weekends: (day) => day === 0 || day === 6,
};

export interface PlannedReminder {
  key: string;
  kind: "periodic" | "payment";
  day: LocalDate;
  time: LocalTime;
  item?: ScheduledPayment;
}

// Reminders after `now` (local day and time) within `days` days, nearest first, at most `limit`.
export function upcomingReminders(data: LedgerData, today: LocalDate, now: LocalTime, { days = 60, limit = 150 } = {}): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const { notifications, periodic, notificationTime, notificationFrequency } = data.settings;
  if (!notifications) return out;
  const last = addDays(today, days);
  const after = (day: LocalDate, time: LocalTime) => day > today || (day === today && time > now);
  if (periodic) {
    const wanted = FREQUENCIES[notificationFrequency] ?? FREQUENCIES["Every day"]!;
    for (let n = 0; n <= days; n++) {
      const day = addDays(today, n);
      const weekday = new Date(day + "T12:00:00Z").getUTCDay();
      if (after(day, notificationTime) && wanted(weekday)) out.push({ key: `periodic:${day}`, kind: "periodic", day, time: notificationTime });
    }
  }
  for (const item of data.scheduled) {
    if (!item.reminder || !(item.reminder.before >= 0)) continue;
    let probe: ScheduledPayment | null = item;
    for (let n = 0; probe && n < 400; n++) {
      const day = reminderDay(probe);
      if (!day || day > last) break;
      const time = probe.reminder?.time ?? "09:00";
      if (after(day, time)) out.push({ key: `payment:${item.id}:${probe.date}`, kind: "payment", day, time, item: probe });
      probe = advanced(probe);
    }
  }
  return out.sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : a.day + a.time > b.day + b.time ? 1 : 0) || (a.key < b.key ? -1 : 1)).slice(0, limit);
}

// A stable positive 31-bit number for a reminder key (the system identifies notifications by it).
export function reminderNumber(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}
