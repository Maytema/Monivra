/* System notifications. In a browser they can be shown only while the page or its worker is alive: a
   closed or sleeping application cannot wake itself at a set time. In the Android shell they are local
   notifications of the system (no server): the ones shown now go through `showSystemNotification`, the
   ones for later are scheduled with `scheduleNotifications`, and the system delivers those while the
   application is closed. */
import { isNative, plugin } from "./native.js";

const local = isNative ? plugin("LocalNotifications") : null;
// The channel of the reminders (the person can mute or change it in the system settings).
export const REMINDER_CHANNEL = "payments";
// The permission as last asked of the system (it cannot be read without waiting).
let permission = "default";
const fromSystem = (display) =>
  display === "granted" ? "granted" : display === "denied" ? "denied" : "default";

// Reads the permission from the system; called at the start and whenever the application returns,
// as the person may have changed it in the system settings.
export async function refreshNotificationPermission(channelName) {
  if (!local) return notificationStatus();
  try {
    permission = fromSystem((await local.checkPermissions()).display);
    if (channelName)
      await local.createChannel({ id: REMINDER_CHANNEL, name: channelName, importance: 4 });
  } catch {
    // Without the plugin the reminders stay inside the application.
  }
  return permission;
}

// "unsupported" (no Notification API), "denied", "default" (not asked yet) or "granted".
export const notificationStatus = () =>
  local
    ? permission
    : typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission;

// Asks the person for the permission; must be called from a tap. Resolves with the new status.
export async function askNotificationPermission() {
  if (notificationStatus() !== "default") return notificationStatus();
  if (local) {
    try {
      permission = fromSystem((await local.requestPermissions()).display);
    } catch {
      // The permission stays as it was.
    }
    return permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationStatus();
  }
}

let worker = null;
// The registration of the minimal worker, or null where workers are unavailable.
async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  worker ??= navigator.serviceWorker
    .register(new URL("../../sw.js", import.meta.url), { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return worker;
}

// Shows a system notification. Resolves true when the browser accepted it, false when it could not
// be shown (no permission, no support): the caller shows the reminder inside the application.
export async function showSystemNotification(title, body, tag) {
  if (notificationStatus() !== "granted") return false;
  if (local) {
    try {
      await local.schedule({
        notifications: [{ id: notificationId(tag), title, body, channelId: REMINDER_CHANNEL }],
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const ready = await registration();
    if (ready) await ready.showNotification(title, { body, tag, icon: undefined });
    else new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

// A whole number for the system out of a key; the same key always gives the same number.
export function notificationId(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

// Replaces everything the system had scheduled for this application with `items`
// ([{ key, title, body, at: Date }]). Resolves true when it was done. Nothing is scheduled without the
// permission. The system may deliver a notification a few minutes late to save battery.
let queue = Promise.resolve();
export function scheduleNotifications(items) {
  if (!local) return Promise.resolve(false);
  queue = queue
    .then(async () => {
      if (notificationStatus() !== "granted") return false;
      const pending = (await local.getPending()).notifications ?? [];
      if (pending.length) await local.cancel({ notifications: pending.map(({ id }) => ({ id })) });
      if (items.length)
        await local.schedule({
          notifications: items.map(({ key, title, body, at }) => ({
            id: notificationId(key),
            title,
            body,
            channelId: REMINDER_CHANNEL,
            schedule: { at, allowWhileIdle: true },
          })),
        });
      return true;
    })
    .catch(() => false);
  return queue;
}
