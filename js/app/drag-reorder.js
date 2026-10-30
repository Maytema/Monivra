/* Long press lifts an item; dragging moves it among its neighbours (rows and grids). */
import { render } from "./shell.js";
import { cancelSwipe } from "./swipe.js";
import { uiState } from "../core/state.js";
import { reorderAccounts, reorderCategories } from "../domain/operations.js";

const HOLD_MS = 380;
const MOVE_TOLERANCE_PX = 10;
const LIFT = "rotate(-3deg) scale(1.03)";

// Draggable lists: the item selector, the attribute with the id, when dragging is allowed,
// and what to do with the new order.
const LISTS = [
  {
    item: ".account-row[data-account]",
    id: "account",
    allowed: (item) =>
      uiState.tab === "accounts" &&
      !uiState.layers.length &&
      !uiState.pages.length &&
      uiState.accountTab !== "Total" &&
      !item.closest(".archived-accounts"),
    commit: reorderAccounts,
  },
  {
    item: ".cat-sub-chip[data-sub]",
    id: "sub",
    allowed: () => uiState.pages.at(-1)?.kind === "categoryEdit" && !uiState.layers.length,
    commit: (ids) => {
      reorderCategories(ids);
      // Sub-categories that are not saved yet are ordered in the editor draft.
      uiState.pages.at(-1).newSubcategories?.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    },
  },
  {
    item: ".cat-manage-tile[data-category]",
    id: "category",
    allowed: (item) =>
      uiState.pages.at(-1)?.kind === "categoryManage" &&
      !uiState.layers.length &&
      !item.classList.contains("cat-is-archived"),
    commit: reorderCategories,
  },
];

// True for a moment after a drag so the click that ends the touch is ignored.
let dragJustHappened = false;

// Attach the listeners once (the #app element itself is never replaced).
export function initDragReorder() {
  const app = document.getElementById("app");
  if (!app || app.dataset.dragReorder) return;
  app.dataset.dragReorder = "1";
  let press = null,
    drag = null;
  const cancelPress = () => {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
  };
  const listAt = (target) => {
    for (const list of LISTS) {
      const item = target.closest(list.item);
      if (item && list.allowed(item)) return { list, item };
    }
    return null;
  };
  const startDrag = () => {
    const { list, item } = press;
    cancelSwipe();
    if (navigator.vibrate)
      try {
        navigator.vibrate(18);
      } catch {
        // vibration is optional
      }
    const items = [...item.parentElement.querySelectorAll(list.item)];
    drag = {
      list,
      item,
      items,
      rects: items.map((x) => x.getBoundingClientRect()),
      x: press.x,
      y: press.y,
      home: items.indexOf(item),
    };
    drag.slot = drag.home;
    // The lifted item tilts at once; the others move out of the way smoothly.
    item.classList.add("is-dragged");
    item.style.transform = LIFT;
    items.forEach((x) => x !== item && x.classList.add("is-shifting"));
    item.parentElement.classList.add("is-sorting");
  };
  // Slot whose center is closest to the finger.
  const slotAt = (px, py) => {
    let best = drag.home,
      bestDistance = Infinity;
    drag.rects.forEach((r, i) => {
      const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
      if (d < bestDistance) [best, bestDistance] = [i, d];
    });
    return best;
  };
  const move = (dx, dy) => {
    const { item, items, rects, home } = drag;
    item.style.transform = `translate(${dx}px, ${dy}px) ${LIFT}`;
    const slot = slotAt(
      rects[home].left + rects[home].width / 2 + dx,
      rects[home].top + rects[home].height / 2 + dy,
    );
    const order = items.map((_, i) => i);
    order.splice(slot, 0, ...order.splice(home, 1));
    items.forEach((x, i) => {
      if (x === item) return;
      const target = rects[order.indexOf(i)];
      const shiftX = target.left - rects[i].left,
        shiftY = target.top - rects[i].top;
      x.style.transform = shiftX || shiftY ? `translate(${shiftX}px, ${shiftY}px)` : "";
    });
    drag.slot = slot;
  };
  const finish = (commit) => {
    if (!drag) return;
    const { list, items, home, slot, item } = drag;
    drag = null;
    item.classList.remove("is-dragged");
    item.parentElement.classList.remove("is-sorting");
    items.forEach((x) => {
      x.classList.remove("is-shifting");
      x.style.transform = "";
    });
    if (commit && slot !== home) {
      const ids = items.map((x) => x.dataset[list.id]);
      ids.splice(slot, 0, ...ids.splice(home, 1));
      list.commit(ids);
    }
    dragJustHappened = true;
    setTimeout(() => (dragJustHappened = false), 600);
    render();
  };
  app.addEventListener(
    "pointerdown",
    (e) => {
      const hit = listAt(e.target);
      if (!hit) return;
      cancelPress();
      press = {
        ...hit,
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
        move(e.clientX - drag.x, e.clientY - drag.y);
        return;
      }
      if (press && e.pointerId === press.pointer)
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) cancelPress();
    },
    { passive: true },
  );
  // Once an item is lifted the page must not scroll under the finger.
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
    if (listAt(e.target)) e.preventDefault();
  });
  // Swallow the click that follows a drag.
  app.addEventListener(
    "click",
    (e) => {
      if (dragJustHappened && LISTS.some((l) => e.target.closest(l.item))) {
        e.stopImmediatePropagation();
        e.preventDefault();
        dragJustHappened = false;
      }
    },
    true,
  );
}
