/* Swipe gestures: horizontal swipe between the four root tabs with a live page preview. */
import { render, rootView } from "./shell.js";
import { deepClone } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
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
  const underline = document.querySelector("#base>.account-tabs .mon-tabs-progress");
  if (underline) {
    const tabs = underline.parentElement,
      active = tabs.querySelector("button.active");
    if (active) {
      const tr = tabs.getBoundingClientRect(),
        ar = active.getBoundingClientRect();
      underline.style.width = ar.width + "px";
      underline.style.transform = "translate3d(" + (ar.left - tr.left) + "px,0,0)";
    }
  }
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
  if (uiState.tab === "categories") {
    const originalGrid = s.el.querySelector(".grid"),
      previewGrid = current.querySelector(".grid"),
      nextGrid = node.querySelector(".grid");
    if (originalGrid) {
      const originalRect = originalGrid.getBoundingClientRect(),
        gridStyle = getComputedStyle(originalGrid);
      const sourceTiles = [...originalGrid.children];
      for (const g of [previewGrid, nextGrid])
        if (g) {
          g.style.gridTemplateColumns = gridStyle.gridTemplateColumns;
          g.style.columnGap = gridStyle.columnGap;
          g.style.rowGap = gridStyle.rowGap;
          g.style.width = originalRect.width + "px";
          g.style.minWidth = originalRect.width + "px";
          g.style.maxWidth = originalRect.width + "px";
          for (const tile of g.children) {
            tile.style.minHeight = "0";
            tile.style.flexShrink = "0";
          }
        }
      // Preserve source tile geometry on both neighboring pages, including box sizing.
      // Do not mix the source page's fixed heights with the neighbor's auto heights.
      for (const g of [previewGrid, nextGrid])
        if (g) {
          for (const tile of g.children) {
            const template =
              sourceTiles[Math.min([...g.children].indexOf(tile), sourceTiles.length - 1)];
            if (!template) continue;
            const tr = template.getBoundingClientRect(),
              cs = getComputedStyle(template);
            tile.style.boxSizing = "border-box";
            tile.style.minHeight = tr.height + "px";
            tile.style.height = tr.height + "px";
            tile.style.padding = cs.padding;
            tile.style.borderWidth = cs.borderWidth;
          }
        }
    }
  }
  // The preview must never inherit viewport percentage widths that differ from the source page.
  for (const pg of [current, node]) {
    pg.style.setProperty("min-width", rect.width + "px", "important");
    pg.style.setProperty("max-width", rect.width + "px", "important");
  }
  s.el.style.opacity = "0";
}
function swipeMove(s, dx) {
  if (!s.el) return;
  const direction = dx < 0 ? 1 : -1;
  swipePrepare(s, direction);
  const width = s.width || s.el.getBoundingClientRect().width || innerWidth;
  if (uiState.tab === "accounts") {
    const tabs = document.querySelector("#base>.account-tabs");
    if (tabs) {
      const buttons = [...tabs.querySelectorAll("button")];
      const active = buttons.findIndex((b) => b.classList.contains("active"));
      const next = active + direction;
      const underline = tabs.querySelector(".mon-tabs-progress");
      if (underline && active >= 0) {
        const fraction =
          next >= 0 && next < buttons.length
            ? Math.max(0, Math.min(1, Math.abs(dx) / (s.width || innerWidth)))
            : 0;
        const from = buttons[active],
          to = buttons[next] || from;
        underline.style.transition = "none";
        const tr = tabs.getBoundingClientRect(),
          fr = from.getBoundingClientRect(),
          nr = to.getBoundingClientRect();
        underline.style.width = fr.width + (nr.width - fr.width) * fraction + "px";
        underline.style.transform =
          "translate3d(" + (fr.left - tr.left + (nr.left - fr.left) * fraction) + "px,0,0)";
      }
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
  const reduce = window.__MONIVRA_TEST__ || matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    duration = reduce ? 0 : Math.max(145, Math.min(360, (dist / width) * 330 + 105));
  const track = s.track;
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
