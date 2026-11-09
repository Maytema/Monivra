/* Which reminders are due: the periodic one ("enter today's operations") and the reminders set on
   scheduled payments. Pure: it only looks at the data, the moment and what was already shown. */
import { addDays, parseDate, toIsoDate } from "./finance.js";

// The day a reminder of a payment falls on: `before` days, weeks, months or years ahead of it.
export function reminderDay(item) {
  const { before, unit } = item.reminder;
  if (unit === "Days") return addDays(item.date, -before);
  if (unit === "Weeks") return addDays(item.date, -7 * before);
  const base = parseDate(item.date);
  const months = unit === "Years" ? 12 * before : before;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - months, 1, 12));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(base.getUTCDate(), last));
  return toIsoDate(d);
}

const FREQUENCIES = {
  "Every day": () => true,
  Weekdays: (day) => day >= 1 && day <= 5,
  Weekends: (day) => day === 0 || day === 6,
};

const pad = (n) => String(n).padStart(2, "0");
// The local day and time of `now` as "YYYY-MM-DD" and "HH:MM".
export const dayAndTime = (now) => [
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  `${pad(now.getHours())}:${pad(now.getMinutes())}`,
];

// Reminders that are due at `now` and not in `shown` (a set of keys, one per reminder and day).
// Returns [{ key, kind, item? }]. A payment reminder is due from its time on its day until the
// payment itself is posted, so a reminder missed while the application was closed still comes when
// it is opened that day; one for a day that is gone is not shown late.
export function dueReminders(data, now, shown) {
  const [day, time] = dayAndTime(now);
  const out = [];
  const { notifications, periodic, notificationTime, notificationFrequency } = data.settings;
  if (!notifications) return out;
  if (
    periodic &&
    time >= notificationTime &&
    (FREQUENCIES[notificationFrequency] ?? FREQUENCIES["Every day"])(now.getDay())
  ) {
    const key = `periodic:${day}`;
    if (!shown.has(key)) out.push({ key, kind: "periodic" });
  }
  for (const item of data.scheduled) {
    if (!item.reminder || !(item.reminder.before >= 0)) continue;
    const when = reminderDay(item);
    const key = `payment:${item.id}:${item.date}`;
    if (when === day && time >= item.reminder.time && item.date >= day && !shown.has(key))
      out.push({ key, kind: "payment", item });
  }
  return out;
}
