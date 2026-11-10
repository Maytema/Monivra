/* The reminders that are still to come, for a system that can deliver them while the application is
   closed (the Android shell schedules them as local notifications). Pure: it looks only at the data
   and the moment. It uses the same days, times and keys as `dueReminders` (reminders.js), so a
   reminder that was scheduled is not shown a second time when the application is opened. */
import { addDays } from "./finance.js";
import { dayAndTime, reminderDay } from "./reminders.js";
import { nextDate } from "./scheduled.js";

const FREQUENCIES = {
  "Every day": () => true,
  Weekdays: (day) => day >= 1 && day <= 5,
  Weekends: (day) => day === 0 || day === 6,
};

// The local moment of a day "YYYY-MM-DD" and a time "HH:MM".
const moment = (day, time) => {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};

// Reminders after `now` and within `days` days, nearest first, at most `limit`:
// [{ key, kind, at: Date, item? }]. A payment that repeats has a reminder for each of its next
// occurrences in that time. What is already due (not in the future) is not here: the application
// shows that itself when it is open.
export function upcomingReminders(data, now = new Date(), { days = 60, limit = 150 } = {}) {
  const out = [];
  const { notifications, periodic, notificationTime, notificationFrequency } = data.settings;
  if (!notifications) return out;
  const [today] = dayAndTime(now);
  const last = addDays(today, days);
  if (periodic) {
    const wanted = FREQUENCIES[notificationFrequency] ?? FREQUENCIES["Every day"];
    for (let n = 0; n <= days; n++) {
      const day = addDays(today, n);
      const [y, m, d] = day.split("-").map(Number);
      const at = moment(day, notificationTime);
      if (at > now && wanted(new Date(y, m - 1, d).getDay()))
        out.push({ key: `periodic:${day}`, kind: "periodic", at });
    }
  }
  for (const item of data.scheduled) {
    if (!item.reminder || !(item.reminder.before >= 0)) continue;
    let probe = { ...item, recur: item.recur ? { ...item.recur } : item.recur };
    // A payment can repeat as often as every day; the guard only stops a runaway loop.
    for (let n = 0; n < 400; n++) {
      const day = reminderDay(probe);
      if (day > last) break;
      const at = moment(day, probe.reminder.time);
      if (at > now)
        out.push({ key: `payment:${item.id}:${probe.date}`, kind: "payment", at, item: probe });
      const next = nextDate(probe);
      if (!next) break;
      probe = {
        ...probe,
        date: next,
        recur: {
          ...probe.recur,
          remaining: probe.recur.remaining === null ? null : probe.recur.remaining - 1,
        },
      };
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : 1)).slice(0, limit);
}
