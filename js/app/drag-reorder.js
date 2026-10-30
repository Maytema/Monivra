/* Long press on an account row lifts it; dragging moves it within its group. */
import { render } from "./shell.js";
import { cancelSwipe } from "./swipe.js";
import { uiState } from "../core/state.js";
import { reorderAccounts } from "../domain/operations.js";

const HOLD_MS = 380;
const MOVE_TOLERANCE_PX = 10;
// True for a moment after a drag so the click that ends the touch is ignored.
let dragJustHappened = false;

// Attach the listeners once (the #app element itself is never replaced).
export function initAccountDrag() {
  const app = document.getElementById("app");
  if (!app || app.dataset.accountDrag) return;
  app.dataset.accountDrag = "1";
  let press = null,
    drag = null;
  const cancelPress = () => {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
  };
  const rowsOf = (row) => [...row.parentElement.querySelectorAll(".account-row[data-account]")];
  const startDrag = () => {
    const { row } = press;
    cancelSwipe();
    if (navigator.vibrate)
      try {
        navigator.vibrate(18);
      } catch {
        // vibration is optional
      }
    const rows = rowsOf(row);
    drag = {
      row,
      rows,
      y: press.y,
      home: rows.indexOf(row),
      offset: 0,
      height: row.offsetHeight + parseFloat(getComputedStyle(row.parentElement).rowGap || 0),
    };
    row.classList.add("is-dragged");
    rows.forEach((r) => r !== row && r.classList.add("is-shifting"));
  };
  // Slot the dragged row would take if dropped now.
  const slotAt = (dy) =>
    Math.max(0, Math.min(drag.rows.length - 1, drag.home + Math.round(dy / drag.height)));
  const move = (dy) => {
    drag.row.style.transform = `translateY(${dy}px) rotate(-3deg) scale(1.03)`;
    const slot = slotAt(dy);
    drag.rows.forEach((r, i) => {
      if (r === drag.row) return;
      const shift =
        i > drag.home && i <= slot ? -drag.height : i < drag.home && i >= slot ? drag.height : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
    drag.slot = slot;
  };
  const finish = (commit) => {
    if (!drag) return;
    const { rows, home, slot, row } = drag;
    drag = null;
    row.classList.remove("is-dragged");
    rows.forEach((r) => {
      r.classList.remove("is-shifting");
      r.style.transform = "";
    });
    if (commit && slot !== undefined && slot !== home) {
      const ids = rows.map((r) => r.dataset.account);
      ids.splice(slot, 0, ...ids.splice(home, 1));
      reorderAccounts(ids);
    }
    dragJustHappened = true;
    setTimeout(() => (dragJustHappened = false), 600);
    render();
  };
  app.addEventListener(
    "pointerdown",
    (e) => {
      const row = e.target.closest(".account-row[data-account]");
      if (!row || uiState.tab !== "accounts" || uiState.layers.length || uiState.pages.length)
        return;
      if (uiState.accountTab === "Total" || row.closest(".archived-accounts")) return;
      cancelPress();
      press = {
        row,
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        timer: setTimeout(startDrag, HOLD_MS),
      };
    },
    { passive: true },
  );
  app.addEventListener(
    "pointermove",
    (e) => {
      if (drag) {
        move(e.clientY - drag.y);
        return;
      }
      if (press && e.pointerId === press.pointer)
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) cancelPress();
    },
    { passive: true },
  );
  // Once a row is lifted the page must not scroll under the finger.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (drag && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  app.addEventListener("pointerup", () => {
    cancelPress();
    finish(true);
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    app.addEventListener(type, () => {
      cancelPress();
      if (type === "pointercancel") finish(false);
    });
  app.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".account-row[data-account]")) e.preventDefault();
  });
  // Swallow the click that follows a drag.
  app.addEventListener(
    "click",
    (e) => {
      if (dragJustHappened && e.target.closest(".account-row")) {
        e.stopImmediatePropagation();
        e.preventDefault();
        dragJustHappened = false;
      }
    },
    true,
  );
}
