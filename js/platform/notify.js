/* System notifications as the browser offers them. A browser can show a notification only while the
   page or its worker is alive: a closed or sleeping application cannot wake itself at a set time
   (that takes a server pushing to the device, or a native application with local notifications), so
   these functions are used while the application is open or in the background of the browser. */

// "unsupported" (no Notification API), "denied", "default" (not asked yet) or "granted".
export const notificationStatus = () =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

// Asks the person for the permission; must be called from a tap. Resolves with the new status.
export async function askNotificationPermission() {
  if (notificationStatus() !== "default") return notificationStatus();
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
  try {
    const ready = await registration();
    if (ready) await ready.showNotification(title, { body, tag, icon: undefined });
    else new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}
