/* Startup: global event handlers, routing and lifecycle */
import { render } from "./shell.js";
import { initSwipeGestures, isSwipeClickSuppressed } from "./swipe.js";
import { appData, locked, setLocked, setPinEntry, uiState } from "../core/state.js";
import { createBackup } from "../domain/backups.js";
import { onSaved, save } from "../data/storage.js";
import { categoryById } from "../domain/finance.js";
import { categoryActions } from "../screens/categories.js";
import { askAboutMissed, postDuePayments } from "../screens/due-payments.js";
import { closeLayers, goBack, goHome } from "../ui/navigation.js";
import { hasAction, runAction, runInput } from "../ui/handlers.js";
import { toast } from "../ui/primitives.js";
import { showDueReminders, scheduleReminders, scheduleRemindersSoon } from "./reminders.js";
import { isNative } from "../platform/native.js";
import { leaveApp, onSystemBack, onVisibility } from "../platform/lifecycle.js";
import { flushMirror, mirrorSoon } from "../platform/native-sync.js";
import { boot } from "../platform/native-boot.js";
import { refreshBiometric } from "../platform/biometric.js";
import { refreshNotificationPermission } from "../platform/notify.js";
import { takePinDropped } from "../platform/secure-pin.js";
import { adoptNativePin } from "./native-pin.js";
import { translate } from "../i18n/index.js";

const HOME_TABS = ["accounts", "categories", "operations", "statistics", "more"];
// Long press on a category tile opens its sheet; small finger movements do not cancel it.
const HOLD_MS = 550;
const HOLD_MOVE_TOLERANCE_PX = 15;

// A long press on a category tile; the click that ends it must not also open the tile.
const categoryHold = { timer: 0, start: null, skipClick: false };

function bindClicks() {
  document.addEventListener("click", (event) => {
    if (isSwipeClickSuppressed()) {
      event.preventDefault();
      return;
    }
    if (categoryHold.skipClick) {
      categoryHold.skipClick = false;
      return;
    }
    const target = event.target.closest("[data-action]");
    if (target) {
      if (!hasAction(target.dataset.action)) return;
      try {
        runAction(target.dataset.action);
      } catch (error) {
        toast(error.message);
        console.error(error);
      }
    } else if (
      event.target.classList.contains("overlay") &&
      Number(event.target.dataset.layer) === uiState.layers.length - 1
    )
      closeLayers();
  });
}

function bindFields() {
  document.addEventListener("input", (event) => {
    if (event.target.matches("input:not([type=checkbox]):not([type=radio]),textarea"))
      runInput(event.target.dataset.input, event.target.value);
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("select,input[type=checkbox],input[type=radio]"))
      runInput(
        event.target.dataset.input,
        event.target.type === "checkbox" ? event.target.checked : event.target.value,
      );
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      goBack();
      event.preventDefault();
    }
    const isChartSegment = event.target.tagName.toLowerCase() === "circle";
    if (
      (event.key === "Enter" || event.key === " ") &&
      isChartSegment &&
      event.target.dataset.action
    ) {
      runAction(event.target.dataset.action);
      event.preventDefault();
    }
  });
}

function bindCategoryHold() {
  const cancel = () => {
    clearTimeout(categoryHold.timer);
    categoryHold.start = null;
  };
  document.addEventListener("pointerdown", (event) => {
    // A new touch starts afresh: the click that ended a long press may never have come.
    categoryHold.skipClick = false;
    clearTimeout(categoryHold.timer);
    const tile = event.target.closest("[data-category]");
    if (uiState.tab === "operations" || !tile || uiState.pages.length) return;
    categoryHold.start = { x: event.clientX, y: event.clientY };
    categoryHold.timer = setTimeout(() => {
      categoryHold.skipClick = true;
      const category = categoryById(tile.dataset.category);
      if (category) categoryActions(category);
    }, HOLD_MS);
  });
  document.addEventListener("pointermove", (event) => {
    const { start } = categoryHold;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > HOLD_MOVE_TOLERANCE_PX
    )
      clearTimeout(categoryHold.timer);
  });
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-category]")) event.preventDefault();
  });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, cancel);
}

// Hide the screen while the app is in the background and lock it again after the chosen delay.
function bindPrivacy() {
  const app = document.getElementById("app");
  let hiddenAt = 0;
  onVisibility((hidden) => {
    if (hidden) {
      hiddenAt = Date.now();
      if (appData.settings.hidePreview) app.style.visibility = "hidden";
      return;
    }
    app.style.visibility = "";
    const { pin, relock, lockDelay } = appData.settings;
    if (pin && relock && (Date.now() - hiddenAt) / 1000 >= lockDelay) {
      setLocked(true);
      setPinEntry("");
      render();
    }
  });
}

// The system back button steps back through pages and layers instead of leaving the app.
function bindSystemBack() {
  if (isNative) {
    // The Android shell reports Back itself: step back through pages and layers, and at the first
    // screen (or the lock screen) send the application to the background as Android apps do.
    onSystemBack(() => {
      const atRoot =
        locked ||
        (!uiState.pages.length &&
          !uiState.layers.length &&
          uiState.tab === "accounts" &&
          !uiState.selection &&
          !uiState.search);
      if (atRoot) leaveApp();
      else goBack();
    });
    return;
  }
  try {
    history.pushState({ Monivra: true }, "");
    window.addEventListener("popstate", () => {
      const atRoot =
        !uiState.pages.length &&
        !uiState.layers.length &&
        uiState.tab === "accounts" &&
        !uiState.selection &&
        !uiState.search;
      if (atRoot) return;
      goBack();
      history.pushState({ Monivra: true }, "");
    });
  } catch {
    // history API is unavailable in some embedded views
  }
}

function bindHashRoute() {
  const route = () => {
    const tab = location.hash.slice(1);
    if (HOME_TABS.includes(tab)) goHome(tab);
  };
  window.addEventListener("hashchange", route);
  route();
}

// Post the scheduled payments that came due, at launch and whenever the app comes back to the screen.
function bindDuePayments() {
  postDuePayments();
  showDueReminders();
  // What comes due while the application stays open, and what came due while it was in the
  // background, is posted when the application is looked at again and once a minute while it is
  // open. A closed browser cannot run anything: the payments due meanwhile are posted at the next
  // start, once each.
  const tick = () => {
    if (postDuePayments()) render();
    showDueReminders();
  };
  setInterval(tick, 60000);
  onVisibility((hidden) => {
    if (hidden) return;
    tick();
    askAboutMissed();
  });
}

// Daily backup, if the person chose to have one.
function backUpOncePerDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (appData.settings.autoBackup && !appData.backups.some((b) => b.at.slice(0, 10) === today))
    createBackup("auto");
}

// Attach global handlers (clicks, inputs, swipe gestures, hash routing) and render.
// "As in the system" follows the system while the application is open.
function bindSystemTheme() {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (appData.settings.theme === "system") render();
  });
}

// The Android shell: copy the data after each save, rebuild the system's reminders, and refresh what
// the system says (a fingerprint or a notification permission may have changed in the settings).
function bindNative() {
  if (!isNative) return;
  onSaved(() => {
    mirrorSoon();
    scheduleRemindersSoon();
    adoptNativePin(); // a PIN just set or restored moves to the system storage; a PIN turned off is forgotten
  });
  onVisibility((hidden) => {
    if (hidden) return flushMirror();
    Promise.allSettled([
      refreshBiometric(),
      refreshNotificationPermission(translate("Payment reminders")),
    ]).then(() => {
      scheduleReminders();
      render();
    });
  });
  refreshNotificationPermission(translate("Payment reminders")).then(scheduleReminders);
  adoptNativePin();
}

// Things the person is told once at the start of the Android shell.
function nativeNotices() {
  if (!isNative) return;
  if (boot.data === "restored")
    toast(translate("Your data was restored from the internal copy on this device."));
  else if (boot.data === "unreadable")
    toast(
      translate("The internal copy of the data could not be read. Save a data file when you can."),
    );
  if (takePinDropped())
    toast(translate("The PIN could not be read on this device and was turned off. Set it again."));
}

export function startup() {
  initSwipeGestures();
  bindClicks();
  bindFields();
  bindKeyboard();
  bindCategoryHold();
  bindPrivacy();
  bindSystemTheme();
  bindSystemBack();
  backUpOncePerDay();
  bindDuePayments();
  if (appData.settings.pin) {
    // An earlier version stored the PIN itself; loading has turned it into a hash, now it is kept so.
    save();
    setLocked(true);
  }
  bindNative();
  bindHashRoute();
  render();
  nativeNotices();
  askAboutMissed();
}
