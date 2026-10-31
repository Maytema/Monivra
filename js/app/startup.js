/* Startup: global event handlers, routing and lifecycle */
import { photoDataUrl } from "./photo.js";
import { render } from "./shell.js";
import { initSwipeGestures, isSwipeClickSuppressed } from "./swipe.js";
import { appData, photoCallback, setLocked, setPinEntry, uiState } from "../core/state.js";
import { handleImport } from "../data/import-export.js";
import { categoryById, createBackup } from "../domain/finance.js";
import { categoryActions } from "../screens/categories.js";
import { closeLayers, goBack, goHome, showInfo } from "../ui/kit.js";
import { actionHandlers, inputHandlers, toast } from "../ui/primitives.js";

// Attach global handlers (clicks, inputs, swipe gestures, hash routing) and render.
export function startup() {
  let heldTimer = null,
    skipClick = false,
    hiddenAt = 0;
  initSwipeGestures();
  document.addEventListener("click", (event) => {
    if (isSwipeClickSuppressed()) {
      event.preventDefault();
      return;
    }
    if (skipClick) {
      skipClick = false;
      return;
    }
    const target = event.target.closest("[data-action]");
    if (target) {
      const fn = actionHandlers[target.dataset.action];
      if (fn)
        try {
          fn();
        } catch (e) {
          toast(e.message);
          console.error(e);
        }
    } else if (
      event.target.classList.contains("overlay") &&
      Number(event.target.dataset.layer) === uiState.layers.length - 1
    )
      closeLayers();
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("input:not([type=checkbox]):not([type=radio]),textarea"))
      inputHandlers[e.target.dataset.input]?.(e.target.value);
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("select,input[type=checkbox],input[type=radio]"))
      inputHandlers[e.target.dataset.input]?.(
        e.target.type === "checkbox" ? e.target.checked : e.target.value,
      );
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      goBack();
      e.preventDefault();
    }
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.tagName.toLowerCase() === "circle" &&
      e.target.dataset.action
    ) {
      actionHandlers[e.target.dataset.action]?.();
      e.preventDefault();
    }
  });
  // Long press on a category tile opens its sheet; small finger movements do not cancel it.
  const HOLD_MOVE_TOLERANCE_PX = 15;
  let holdStart = null;
  document.addEventListener("pointerdown", (e) => {
    // A new touch starts afresh: the click that ended a long press may never have come.
    skipClick = false;
    clearTimeout(heldTimer);
    const target = e.target.closest("[data-category]");
    if (uiState.tab === "operations" || !target || uiState.pages.length) return;
    holdStart = { x: e.clientX, y: e.clientY };
    heldTimer = setTimeout(() => {
      skipClick = true;
      const c = categoryById(target.dataset.category);
      if (c) categoryActions(c);
    }, 550);
  });
  document.addEventListener("pointermove", (e) => {
    if (
      holdStart &&
      Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > HOLD_MOVE_TOLERANCE_PX
    )
      clearTimeout(heldTimer);
  });
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("[data-category]")) e.preventDefault();
  });
  for (const ev of ["pointerup", "pointercancel"])
    document.addEventListener(ev, () => {
      clearTimeout(heldTimer);
      holdStart = null;
    });
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 20 * 1024 * 1024)
      return showInfo("The file is larger than the 20 MB import limit.", "Import failed");
    try {
      handleImport(await file.text());
    } catch (error) {
      showInfo(error.message, "Import failed");
      console.error("Import failed:", error);
    }
  });
  document.getElementById("photo-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photoCallback?.(await photoDataUrl(file));
      toast("Photo attached");
    } catch (error) {
      console.error("Photo failed:", error);
      toast("This image could not be opened");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (appData.settings.hidePreview) document.getElementById("app").style.visibility = "hidden";
    } else {
      document.getElementById("app").style.visibility = "";
      if (
        appData.settings.pin &&
        appData.settings.relock &&
        (Date.now() - hiddenAt) / 1000 >= appData.settings.lockDelay
      ) {
        setLocked(true);
        setPinEntry("");
        render();
      }
    }
  });
  try {
    history.pushState({ Monivra: true }, "");
    window.addEventListener("popstate", () => {
      if (
        uiState.pages.length ||
        uiState.layers.length ||
        uiState.tab !== "accounts" ||
        uiState.selection ||
        uiState.search
      ) {
        goBack();
        history.pushState({ Monivra: true }, "");
      }
    });
  } catch {
    // history API is unavailable in some embedded views
  }
  if (
    appData.settings.autoBackup &&
    !appData.backups.some((b) => b.at.slice(0, 10) === new Date().toISOString().slice(0, 10))
  )
    createBackup();
  if (appData.settings.pin) setLocked(true);
  const routeHash = () => {
    const tab = location.hash.slice(1);
    if (["accounts", "categories", "operations", "statistics", "more"].includes(tab)) goHome(tab);
  };
  window.addEventListener("hashchange", routeHash);
  routeHash();
  render();
}
