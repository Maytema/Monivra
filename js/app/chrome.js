/* Fixed chrome around the sliding page: tab underline, period arrows, floating button. */
import { uiState } from "../core/state.js";

// Move the tab underline under the active tab button.
export function placeTabUnderline(underline) {
  const tabs = underline.parentElement;
  const active = tabs.querySelector("button.active");
  if (!active) return;
  const tabsRect = tabs.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  underline.style.width = activeRect.width + "px";
  underline.style.transform = `translate3d(${activeRect.left - tabsRect.left}px,0,0)`;
}

// Add the underline element to the accounts tab bar.
function mountTabUnderline(base) {
  const tabs = base.querySelector(":scope > .account-tabs");
  if (!tabs) return;
  const underline = document.createElement("span");
  underline.className = "mon-tabs-progress";
  tabs.append(underline);
  placeTabUnderline(underline);
}

// The period arrows must stay put while the page (and the period title) slides under them,
// so they are copied into a fixed overlay positioned over the period bar.
function mountPeriodArrows(base, pane) {
  const period = pane.querySelector(".period");
  const buttons = period?.querySelectorAll(":scope > button");
  if (!buttons || buttons.length < 2) return;
  const rect = period.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "mon-period-arrows";
  Object.assign(overlay.style, {
    left: rect.left + "px",
    top: rect.top + "px",
    width: rect.width + "px",
    height: rect.height + "px",
  });
  overlay.append(buttons[0].cloneNode(true), buttons[buttons.length - 1].cloneNode(true));
  // Keep the arrows below the floating button in tab order.
  const fab = base.querySelector(":scope > .fab");
  if (fab) fab.before(overlay);
  else base.append(overlay);
}

// Shrink the floating "Add" button into a round button once the list is scrolled.
function bindFabCollapse(pane) {
  const fab = document.querySelector("#base > .fab");
  const content = pane.querySelector(".content");
  if (!fab || !content) return;
  const update = () => fab.classList.toggle("is-collapsed", content.scrollTop > 35);
  content.addEventListener("scroll", update, { passive: true });
  update();
}

// Build the fixed chrome after every render of a root screen.
export function mountSwipeChrome() {
  if (uiState.pages.length || uiState.layers.length) return;
  const base = document.getElementById("base");
  const pane = base?.querySelector(".swipe-pane");
  if (!pane) return;
  mountTabUnderline(base);
  mountPeriodArrows(base, pane);
  bindFabCollapse(pane);
}

// Horizontal swipe on the "add operation" chooser switches its tabs.
export function bindAddChooserSwipe() {
  const root = document.querySelector("[data-add-chooser]");
  if (!root) return;
  let startX = 0;
  let startY = 0;
  root.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  root.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const tabs = [...root.querySelectorAll(".mon-add-tab")];
      const current = tabs.findIndex((t) => t.classList.contains("active"));
      tabs[current + (dx < 0 ? 1 : -1)]?.click();
    },
    { passive: true },
  );
}
