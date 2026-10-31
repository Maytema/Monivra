/* Long press: an operation row starts selection mode; an element with data-hold runs its handler. */
import { render } from "./shell.js";
import { uiState } from "../core/state.js";
import { actionHandlers } from "../ui/primitives.js";

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE_PX = 15;
// True from a long press until the next touch starts, so the click that ends the long press is
// ignored however long the finger stays down, and a later tap is never mistaken for it.
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
    uiState.selection = true;
    uiState.selected = [id];
    render();
  };
  // What a long press on the touched element does, or null when nothing.
  const holdAction = (target) => {
    const held = target.closest("[data-hold]");
    if (held) return () => actionHandlers[held.dataset.hold]?.(held);
    const row = target.closest(".op-row[data-operation]");
    const blocked =
      uiState.tab !== "operations" ||
      uiState.selection ||
      uiState.layers.length ||
      uiState.pages.length;
    return row && !blocked ? () => startSelection(row.dataset.operation) : null;
  };
  app.addEventListener(
    "pointerdown",
    (e) => {
      longPressJustHappened = false;
      const action = holdAction(e.target);
      if (!action) return;
      cancel();
      press = {
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        timer: setTimeout(() => {
          if (!press) return;
          longPressJustHappened = true;
          if (navigator.vibrate)
            try {
              navigator.vibrate(22);
            } catch {
              // vibration is optional
            }
          action();
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
    if (holdAction(e.target)) e.preventDefault();
  });
  // Swallow the click that follows a long press.
  app.addEventListener(
    "click",
    (e) => {
      if (longPressJustHappened && e.target.closest(".op-row, [data-hold]")) {
        e.stopImmediatePropagation();
        e.preventDefault();
        longPressJustHappened = false;
      }
    },
    true,
  );
}
