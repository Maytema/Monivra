/* When the application leaves the screen and comes back. A browser says so with `visibilitychange`;
   the Android shell says so with its own event (the page is not always told that the window went to
   the background, and not at all while the recent-apps screen is open), so all of them are listened to and the same state is not reported twice there. */
import { isNative, plugin } from "./native.js";

// Calls `listener(hidden)` whenever the application goes to the background (true) or returns (false).
export function onVisibility(listener) {
  let last = false;
  const report = (hidden, force) => {
    if (!force && hidden === last) return;
    last = hidden;
    listener(hidden);
  };
  document.addEventListener("visibilitychange", () => report(document.hidden, !isNative));
  if (isNative) {
    plugin("App")?.addListener("appStateChange", ({ isActive }) => report(!isActive, false));
    // The recent-apps screen only pauses the window; the app state event comes when it stops.
    plugin("MonivraNative")?.addListener("activityPause", () => report(true, false));
    plugin("MonivraNative")?.addListener("activityResume", () => report(false, false));
  }
}

// The system Back button of the Android shell: `handler()` steps back or leaves the screen.
export function onSystemBack(handler) {
  plugin("App")?.addListener("backButton", handler);
}

// Sends the application to the background, as Back does at the first screen of an Android app.
export const leaveApp = () => plugin("App")?.minimizeApp();
