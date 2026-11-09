/* Reminders while the application is open: system notifications where the browser allows them, and a
   message inside the application where it does not. Nothing runs while the application is closed. */
import { appData } from "../core/state.js";
import { dueReminders } from "../domain/reminders.js";
import { operationTitle } from "../screens/operation-title.js";
import { translate, translateWith } from "../i18n/index.js";
import { showSystemNotification } from "../platform/notify.js";
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

// Shows what is due now. Each reminder is shown once. Returns how many were shown.
export async function showDueReminders(now = new Date()) {
  const shown = readShown();
  const due = dueReminders(appData, now, shown);
  for (const reminder of due) {
    const [title, body] = reminderText(reminder);
    shown.add(reminder.key);
    writeShown(shown);
    const system = await showSystemNotification(title, body, reminder.key);
    if (!system && !document.hidden) toast(`${title}: ${body}`);
  }
  return due.length;
}
