/* Startup: global event handlers, routing and lifecycle */
import { render } from "./shell.js";
import { initSwipeGestures, isSwipeClickSuppressed } from "./swipe.js";
import { appData, setLocked, setPinEntry, uiState } from "../core/state.js";
import { createBackup } from "../domain/backups.js";
import { categoryById } from "../domain/finance.js";
import { categoryActions } from "../screens/categories.js";
import { askAboutMissed, postDuePayments } from "../screens/due-payments.js";
import { closeLayers, goBack, goHome } from "../ui/navigation.js";
import { hasAction, runAction, runInput } from "../ui/handlers.js";
import { toast } from "../ui/primitives.js";

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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (postDuePayments()) render();
    askAboutMissed();
  });
}

// Daily backup, if the person chose to have one.
function backUpOncePerDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (appData.settings.autoBackup && !appData.backups.some((b) => b.at.slice(0, 10) === today))
    createBackup();
}

// Attach global handlers (clicks, inputs, swipe gestures, hash routing) and render.
export function startup() {
  initSwipeGestures();
  bindClicks();
  bindFields();
  bindKeyboard();
  bindCategoryHold();
  bindPrivacy();
  bindSystemBack();
  backUpOncePerDay();
  bindDuePayments();
  if (appData.settings.pin) setLocked(true);
  bindHashRoute();
  render();
  askAboutMissed();
}
