/* Long press on an operation row starts selection mode. */
import { render } from "./shell.js";
import { uiState } from "../core/state.js";

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE_PX = 15;
// True for a moment after a long press so the click that ends the touch is ignored.
let longPressJustHappened = false;

// Attach the long-press listeners once (the #app element itself is never replaced).
export function initOperationLongPress() {
  const app = document.getElementById("app");
  if (!app || app.dataset.longPress) return;
  app.dataset.longPress = "1";
  let press = null;
  const cancel = () => {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
  };
  const startSelection = (id) => {
    longPressJustHappened = true;
    if (navigator.vibrate)
      try {
        navigator.vibrate(22);
      } catch {}
    uiState.selection = true;
    uiState.selected = [id];
    render();
    setTimeout(() => {
      longPressJustHappened = false;
    }, 950);
  };
  app.addEventListener(
    "pointerdown",
    (e) => {
      const row = e.target.closest(".op-row[data-operation]");
      const blocked =
        uiState.tab !== "operations" ||
        uiState.selection ||
        uiState.layers.length ||
        uiState.pages.length;
      if (!row || blocked) return;
      cancel();
      const id = row.dataset.operation;
      press = {
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        timer: setTimeout(() => {
          if (press) startSelection(id);
        }, LONG_PRESS_MS),
      };
    },
    { passive: true },
  );
  app.addEventListener(
    "pointermove",
    (e) => {
      if (!press || e.pointerId !== press.pointer) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
    },
    { passive: true },
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    app.addEventListener(type, cancel, { passive: true });
  app.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".op-row[data-operation]")) e.preventDefault();
  });
  // Swallow the click that follows a long press.
  app.addEventListener(
    "click",
    (e) => {
      if (longPressJustHappened && e.target.closest(".op-row")) {
        e.stopImmediatePropagation();
        e.preventDefault();
        longPressJustHappened = false;
      }
    },
    true,
  );
}
