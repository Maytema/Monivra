/* Swipe gestures: horizontal swipe between the four root tabs with a live page preview. */
import { placeTabUnderline } from "./chrome.js";
import { render, rootView } from "./shell.js";
import { deepClone } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { addDays, parseDate, toIsoDate } from "../domain/finance.js";
import {
  actionHandlers,
  handlerCounter,
  inputHandlers,
  setActionHandlers,
  setHandlerCounter,
  setInputHandlers,
} from "../ui/primitives.js";

// One gesture recognizer shared by all four root sections.
// Buttons inside the scrollable content no longer suppress a swipe; controls in sheets do.
let rootSwipe = null,
  swipeSuppressClickUntil = 0;
const swipeEase = "cubic-bezier(.22,1,.36,1)";
function swipeSurface() {
  return document.querySelector("#base>.swipe-pane");
}
function swipeTabs() {
  return appData.accounts.some((a) => !a.archived && a.type === "Debt")
    ? ["Accounts", "Debts", "Total"]
    : ["Accounts", "Total"];
}
function swipeEdge(direction) {
  if (uiState.tab === "accounts") {
    const tabs = swipeTabs();
    return (
      tabs.indexOf(uiState.accountTab) + direction < 0 ||
      tabs.indexOf(uiState.accountTab) + direction >= tabs.length
    );
  }
  return uiState.period.mode === "all";
}
function swipeAdvanceState(direction) {
  if (uiState.tab === "accounts") {
    const tabs = swipeTabs(),
      idx = tabs.indexOf(uiState.accountTab) + direction;
    if (idx < 0 || idx >= tabs.length) return false;
    uiState.accountTab = tabs[idx];
    return true;
  }
  if (uiState.period.mode === "all") return false;
  const p = uiState.period;
  if (p.mode === "range") {
    const days = Math.round((parseDate(p.to) - parseDate(p.from)) / 86400000) + 1;
    p.from = addDays(p.from, direction * days);
    p.to = addDays(p.to, direction * days);
  } else if (p.mode === "month" || p.mode === "year") {
    let d = parseDate(p.anchor);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + direction * (p.mode === "year" ? 12 : 1));
    p.anchor = toIsoDate(d);
  } else p.anchor = addDays(p.anchor, direction * (p.mode === "week" ? 7 : 1));
  uiState.donut = null;
  return true;
}
function swipePreview(direction) {
  const prior = {
      accountTab: uiState.accountTab,
      period: deepClone(uiState.period),
      donut: uiState.donut,
    },
    priorActions = actionHandlers,
    priorInputs = inputHandlers,
    priorCounter = handlerCounter;
  let node = null;
  try {
    if (!swipeAdvanceState(direction)) return null;
    setActionHandlers({});
    setInputHandlers({});
    setHandlerCounter(0);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = rootView();
    node = wrapper.querySelector(".swipe-pane");
    if (node) {
      node.querySelectorAll(".fab,.mon-period-arrows").forEach((e) => e.remove());
      node.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    }
  } finally {
    uiState.accountTab = prior.accountTab;
    uiState.period = prior.period;
    uiState.donut = prior.donut;
    setActionHandlers(priorActions);
    setInputHandlers(priorInputs);
    setHandlerCounter(priorCounter);
  }
  return node;
}
function swipeCleanup(s) {
  if (!s) return;
  if (s.viewport?.isConnected) s.viewport.remove();
  else if (s.track?.isConnected) s.track.remove();
  s.underlineAnimation?.cancel();
  const underline = document.querySelector("#base>.account-tabs .mon-tabs-progress");
  if (underline) placeTabUnderline(underline);
  if (s.el) {
    s.el.style.transform = "";
    s.el.style.opacity = "";
    s.el.style.willChange = "";
    s.el.style.visibility = "";
  }
}
function swipePrepare(s, direction) {
  if (s.direction === direction) return;
  if (s.track) s.track.remove();
  s.track = null;
  s.direction = direction;
  s.neighbor = null;
  if (swipeEdge(direction)) return;
  const node = swipePreview(direction);
  if (!node) return;
  // A fixed, clipped overlay is independent of #base's flex layout. It cannot
  // displace the hero, the bottom navbar, or change the height of the content.
  const rect = s.el.getBoundingClientRect();
  if (rect.width < 30 || rect.height < 30) return;
  const viewport = document.createElement("div");
  viewport.className = "mon-pager-viewport";
  viewport.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-height:${rect.height}px`;
  const track = document.createElement("div");
  track.className = "mon-swipe-track";
  const current = s.el.cloneNode(true);
  current.querySelectorAll(".fab,.mon-period-arrows").forEach((e) => e.remove());
  current.classList.add("mon-swipe-page");
  current.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  current.setAttribute("inert", "");
  node.classList.add("mon-swipe-page");
  if (direction === 1) track.append(current, node);
  else track.append(node, current);
  viewport.append(track);
  document.body.append(viewport);
  track.style.width = rect.width * 2 + "px";
  for (const page of [current, node]) {
    page.style.flex = "0 0 " + rect.width + "px";
    page.style.width = rect.width + "px";
    page.style.maxWidth = rect.width + "px";
    page.style.height = rect.height + "px";
  }
  s.viewport = viewport;
  s.track = track;
  s.neighbor = node;
  s.current = current;
  s.width = rect.width;
  const content = s.el.querySelector(".content");
  if (content) {
    const cloneContent = current.querySelector(".content");
    if (cloneContent) cloneContent.scrollTop = content.scrollTop;
    const neighborContent = node.querySelector(".content");
    if (neighborContent) neighborContent.scrollTop = content.scrollTop;
  }
  // The preview must never inherit viewport percentage widths that differ from the source page.
  for (const pg of [current, node]) {
    pg.style.setProperty("min-width", rect.width + "px", "important");
    pg.style.setProperty("max-width", rect.width + "px", "important");
  }
  s.el.style.opacity = "0";
}
// Measure the tab underline once per gesture so dragging never forces layout.
function swipeTabsGeometry() {
  const tabs = document.querySelector("#base>.account-tabs");
  const underline = tabs?.querySelector(".mon-tabs-progress");
  if (!underline) return null;
  const tabsRect = tabs.getBoundingClientRect();
  const buttons = [...tabs.querySelectorAll("button")];
  return {
    underline,
    active: buttons.findIndex((b) => b.classList.contains("active")),
    rects: buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left - tabsRect.left, width: r.width };
    }),
  };
}
function underlineStyle(box) {
  return { width: box.width + "px", transform: `translate3d(${box.left}px,0,0)` };
}
function swipeMove(s, dx) {
  if (!s.el) return;
  const direction = dx < 0 ? 1 : -1;
  swipePrepare(s, direction);
  const width = s.width || s.el.getBoundingClientRect().width || innerWidth;
  if (uiState.tab === "accounts") {
    if (s.tabsGeometry === undefined) s.tabsGeometry = swipeTabsGeometry();
    const g = s.tabsGeometry;
    if (g && g.active >= 0) {
      const next = g.active + direction;
      const fraction =
        next >= 0 && next < g.rects.length
          ? Math.min(1, Math.abs(dx) / (s.width || innerWidth))
          : 0;
      const from = g.rects[g.active],
        to = g.rects[next] || from;
      s.underlineBox = {
        left: from.left + (to.left - from.left) * fraction,
        width: from.width + (to.width - from.width) * fraction,
      };
      Object.assign(g.underline.style, underlineStyle(s.underlineBox));
    }
  }
  if (s.track) {
    const x =
      direction === 1 ? Math.max(-width, Math.min(0, dx)) : Math.min(width, Math.max(0, dx));
    s.track.style.transform = `translate3d(${direction === 1 ? x : x - width}px,0,0)`;
  } else {
    const elastic = Math.sign(dx) * Math.min(28, 28 * (1 - Math.exp(-Math.abs(dx) / 95)));
    s.el.style.transform = `translate3d(${elastic}px,0,0)`;
  }
}
function swipeFinish(s, commit) {
  if (!s?.el) return;
  const reduce = isTestMode() || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!s.track) {
    const old = s.el.style.transform;
    s.el.style.transform = "";
    if (!reduce && old && s.el.animate)
      s.el.animate([{ transform: old }, { transform: "translate3d(0,0,0)" }], {
        duration: 250,
        easing: swipeEase,
      });
    swipeCleanup(s);
    return;
  }
  const width = s.width || innerWidth;
  const from = new DOMMatrix(getComputedStyle(s.track).transform).m41;
  const to = commit ? (s.direction === 1 ? -width : 0) : s.direction === 1 ? 0 : -width;
  const dist = Math.abs(to - from),
    duration = reduce ? 0 : Math.max(120, Math.min(280, (dist / width) * 230 + 90));
  const track = s.track;
  const g = s.tabsGeometry;
  if (g && g.active >= 0 && s.underlineBox && duration) {
    const target = g.rects[commit ? g.active + s.direction : g.active] || g.rects[g.active];
    s.underlineAnimation = g.underline.animate(
      [underlineStyle(s.underlineBox), underlineStyle(target)],
      { duration, easing: swipeEase, fill: "forwards" },
    );
  }
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    // Render the destination underneath the overlay BEFORE removing it.
    // This avoids the flash of the old page / disappearing fixed elements.
    if (commit) {
      swipeAdvanceState(s.direction);
      render();
    }
    swipeCleanup(s);
  };
  if (!duration) {
    finalize();
    return;
  }
  const animation = track.animate(
    [{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }],
    { duration, easing: swipeEase, fill: "forwards" },
  );
  animation.onfinish = finalize;
  animation.oncancel = finalize;
}

// True for a short moment after a swipe so the click that ends the gesture is ignored.
export function isSwipeClickSuppressed() {
  return Date.now() < swipeSuppressClickUntil;
}

// Attach the touch listeners that drive the swipe recognizer.
export function initSwipeGestures() {
  document.addEventListener(
    "touchstart",
    (e) => {
      if (
        e.touches.length !== 1 ||
        uiState.pages.length ||
        uiState.layers.length ||
        !["accounts", "categories", "operations", "statistics"].includes(uiState.tab)
      )
        return;
      if (e.target.closest(".navbar,.overlay,input,textarea,select,[contenteditable],.hero-action"))
        return;
      const t = e.touches[0];
      rootSwipe = {
        x: t.clientX,
        y: t.clientY,
        tab: uiState.tab,
        at: performance.now(),
        el: swipeSurface(),
        axis: null,
        direction: 0,
        track: null,
        lastDx: 0,
      };
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      const s = rootSwipe;
      if (!s || e.touches.length !== 1 || uiState.tab !== s.tab) return;
      const t = e.touches[0],
        dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 9)
        s.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      if (s.axis !== "x" || !s.el) return;
      s.lastDx = dx;
      swipeMove(s, dx);
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      const s = rootSwipe;
      rootSwipe = null;
      if (!s) return;
      if (
        uiState.pages.length ||
        uiState.layers.length ||
        uiState.tab !== s.tab ||
        e.changedTouches.length !== 1
      ) {
        swipeFinish(s, false);
        return;
      }
      const t = e.changedTouches[0],
        dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      if (s.axis !== "x") {
        swipeCleanup(s);
        return;
      }
      swipeSuppressClickUntil = Date.now() + 420;
      const width = s.width || s.el?.getBoundingClientRect().width || innerWidth;
      const commit =
        !!s.track && Math.abs(dx) > Math.max(48, width * 0.27) && Math.abs(dx) > Math.abs(dy) * 1.1;
      swipeFinish(s, commit);
    },
    { passive: true },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      const s = rootSwipe;
      rootSwipe = null;
      swipeFinish(s, false);
    },
    { passive: true },
  );
}
