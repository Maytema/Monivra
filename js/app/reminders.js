/* Reminders. In a browser they appear only while the application is open: as system notifications
   where the browser allows them, and as a message inside the application where it does not. In the
   Android shell the reminders to come are handed to the system as local notifications, which it
   delivers while the application is closed (`scheduleReminders`); when the application is open it
   shows only what the system was not asked to deliver. */
import { appData } from "../core/state.js";
import { dueReminders } from "../domain/reminders.js";
import { upcomingReminders } from "../domain/reminder-plan.js";
import { operationTitle } from "../screens/operation-title.js";
import { translate, translateWith } from "../i18n/index.js";
import { isNative } from "../platform/native.js";
import {
  notificationStatus,
  scheduleNotifications,
  showSystemNotification,
} from "../platform/notify.js";
import { toast } from "../ui/primitives.js";

const SHOWN_KEY = "monivra.reminders.shown";
const readShown = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
// Only the latest keys are kept, so the list does not grow.
const writeShown = (shown) => {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].slice(-200)));
  } catch {
    // The reminder may then repeat after a reload; it is never lost.
  }
};

const SCHEDULED_KEY = "monivra.reminders.scheduled";
// The keys of the reminders that were handed to the system.
const readScheduled = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SCHEDULED_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

// The words of a reminder.
export function reminderText(reminder) {
  if (reminder.kind === "periodic")
    return [translate("Monivra"), translate("Enter today’s operations")];
  return [
    translate("Scheduled payment"),
    translateWith("{title} is due on {date}", {
      title: operationTitle(reminder.item),
      date: reminder.item.date,
    }),
  ];
}

// Hands the reminders of the next two months to the system, in place of what it had; returns how
// many it was given (0 when notifications are off or not allowed: they then show inside the
// application). The reminders are rebuilt whenever the data changes, so a payment that was edited,
// posted or deleted does not remind any more. Posting the payment itself is a different thing: it
// happens when the application is opened, with the date and time the payment was set for.
export async function scheduleReminders(now = new Date()) {
  if (!isNative) return 0;
  const items =
    notificationStatus() === "granted"
      ? upcomingReminders(appData, now).map((reminder) => {
          const [title, body] = reminderText(reminder);
          return { key: reminder.key, title, body, at: reminder.at };
        })
      : [];
  const done = await scheduleNotifications(items);
  try {
    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(done ? items.map((item) => item.key) : []));
  } catch {
    // Without this note a reminder may show in the application as well; none is lost.
  }
  return done ? items.length : 0;
}

let planTimer = 0;
// Rebuilds the system's reminders shortly after the last change, so a burst of changes costs one.
export function scheduleRemindersSoon() {
  if (!isNative) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(() => scheduleReminders(), 1500);
}

// Shows what is due now. Each reminder is shown once. Returns how many were shown.
export async function showDueReminders(now = new Date()) {
  const shown = readShown();
  const due = dueReminders(appData, now, shown);
  const system = readScheduled();
  for (const reminder of due) {
    const [title, body] = reminderText(reminder);
    shown.add(reminder.key);
    writeShown(shown);
    // The system delivers what it was given; showing it again here would be a second notification.
    if (isNative && system.has(reminder.key) && notificationStatus() === "granted") continue;
    const sent = await showSystemNotification(title, body, reminder.key);
    if (!sent && !document.hidden) toast(`${title}: ${body}`);
  }
  return due.length;
}
