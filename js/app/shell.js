/* App shell: navigation, root view, rendering */
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData, locked, uiState } from "../core/state.js";
import { dataView } from "../data/import-export.js";
import { overallBalance } from "../domain/finance.js";
import { accountEditView, accountsView } from "../screens/accounts.js";
import {
  categoriesView,
  categoryEditView,
  categoryManageView,
  orderView,
} from "../screens/categories.js";
import { lockView, moreView, settingsPage, settingsView, simplePage } from "../screens/more.js";
import { operationView } from "../screens/operation-editor.js";
import { operationsView } from "../screens/operations.js";
import { budgetView, budgetsView, scheduledView } from "../screens/scheduled-budgets.js";
import { statisticsView } from "../screens/statistics.js";
import { goHome } from "../ui/kit.js";
import {
  actionHandlers,
  buttonHtml,
  handlerCounter,
  inputHandlers,
  setActionHandlers,
  setHandlerCounter,
  setInputHandlers,
  translate,
} from "../ui/primitives.js";

// Bottom navigation bar.
function navigationBar() {
  return `<nav class="navbar labels-${appData.settings.navLabels === "active" ? "selected" : appData.settings.navLabels}" aria-label="Main navigation">${[
    ["accounts", "wallet", "Accounts"],
    ["categories", "categories", "Categories"],
    ["operations", "receipt", "Operations"],
    ["statistics", "stats", "Statistics"],
    ["more", "more", "More"],
  ]
    .map(([id, icon, label]) =>
      buttonHtml(
        `<span class="navicon">${iconSvg(icon)}</span><span>${translate(label)}</span>`,
        () => goHome(id),
        uiState.tab === id ? "active" : "",
        `aria-label="${translate(label)}" ${uiState.tab === id ? 'aria-current="page"' : ""}`,
      ),
    )
    .join("")}</nav>`;
}
// HTML of the whole screen: current root tab or the top page, plus layers.
export function rootView() {
  if (locked) return lockView();
  const p = uiState.pages.at(-1);
  let out;
  if (p) {
    switch (p.kind) {
      case "accountEdit":
        out = accountEditView(p);
        break;
      case "accountOrder":
        out = orderView("accounts");
        break;
      case "categoryOrder":
        out = orderView("categories");
        break;
      case "categoryEdit":
        out = categoryEditView(p);
        break;
      case "categoryManage":
        out = categoryManageView();
        break;
      case "operation":
        out = operationView(p);
        break;
      case "scheduled":
        out = scheduledView();
        break;
      case "budgets":
        out = budgetsView();
        break;
      case "budget":
        out = budgetView(p);
        break;
      case "settings":
        out = settingsView();
        break;
      case "data":
        out = dataView();
        break;
      default:
        out = [
          "global",
          "formatting",
          "styles",
          "backups",
          "notifications",
          "security",
          "privacy",
          "rates",
        ].includes(p.kind)
          ? settingsPage(p.kind)
          : simplePage(p.kind);
    }
  } else {
    out = (
      {
        accounts: accountsView,
        categories: categoriesView,
        operations: operationsView,
        statistics: statisticsView,
        more: moreView,
      }[uiState.tab] || accountsView
    )();
    if (["accounts", "categories", "operations", "statistics"].includes(uiState.tab)) {
      const marker = "<!--MONIVRA_HERO_END-->";
      const cut = out.indexOf(marker);
      if (cut >= 0) {
        let head = out.slice(0, cut + marker.length),
          body = out.slice(cut + marker.length);
        if (uiState.tab === "accounts") {
          const tabEnd = body.indexOf("</div>");
          if (tabEnd >= 0 && body.startsWith('<div class="tabs account-tabs">')) {
            head += body.slice(0, tabEnd + 6);
            body = body.slice(tabEnd + 6);
          }
        }
        out = head + '<div class="swipe-pane">' + body + "</div>";
      } else out = '<div class="swipe-pane">' + out + "</div>";
    }
    if (!(uiState.tab === "operations" && uiState.selection)) out += navigationBar();
  }
  return out;
}
// Keep header and FAB fixed while the content area swipes.
function stabilizeSwipeChrome() {
  const base = document.getElementById("base");
  if (!base || uiState.pages.length || uiState.layers.length) return;
  const pane = base.querySelector(".swipe-pane");
  if (!pane) return;
  const accountTabs = base.querySelector(":scope > .account-tabs");
  if (accountTabs) {
    const buttons = [...accountTabs.querySelectorAll("button")],
      idx = Math.max(
        0,
        buttons.findIndex((b) => b.classList.contains("active")),
      );
    const bar = document.createElement("span");
    bar.className = "mon-tabs-progress";
    bar.style.transition = "none";
    bar.style.width = buttons[idx].getBoundingClientRect().width + "px";
    bar.style.transform =
      "translate3d(" +
      (buttons[idx].getBoundingClientRect().left - accountTabs.getBoundingClientRect().left) +
      "px,0,0)";
    accountTabs.append(bar);
  }
  const period = pane.querySelector(".period");
  if (period) {
    const buttons = period.querySelectorAll(":scope > button");
    if (buttons.length >= 2) {
      const rect = period.getBoundingClientRect();
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      const overlay = document.createElement("div");
      overlay.className = "mon-period-arrows";
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      overlay.append(first.cloneNode(true), last.cloneNode(true));
      base.append(overlay);
    }
  }
  const fab = pane.querySelector(".fab");
  if (fab) {
    base.querySelectorAll(":scope > .fab").forEach((e) => e.remove());
    base.append(fab);
    const content = pane.querySelector(".content");
    if (content) {
      const update = () => fab.classList.toggle("mon-fab-collapsed", content.scrollTop > 35);
      content.addEventListener("scroll", update, { passive: true });
      update();
    }
  }
}
// Timer used to detect a long press on an operation row.
let opsPressTimer = null;
// Set when a long press just happened so the following click is ignored.
let opsLongPressed = false;

// Long press on an operation row starts selection mode.
function initOpsLongPress() {
  const app = document.getElementById("app");
  if (!app || app.dataset.opsLongPress) return;
  app.dataset.opsLongPress = "1";
  let gesture = null;
  const cancel = () => {
    if (gesture?.timer) clearTimeout(gesture.timer);
    gesture = null;
  };
  app.addEventListener(
    "pointerdown",
    (e) => {
      const row = e.target.closest(".op-row[data-operation]");
      if (
        !row ||
        uiState.tab !== "operations" ||
        uiState.selection ||
        uiState.layers.length ||
        uiState.pages.length
      )
        return;
      cancel();
      const id = row.dataset.operation;
      gesture = {
        id,
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        fired: false,
        timer: setTimeout(() => {
          if (!gesture || gesture.id !== id) return;
          gesture.fired = true;
          opsLongPressed = true;
          if (navigator.vibrate)
            try {
              navigator.vibrate(22);
            } catch {}
          uiState.selection = true;
          uiState.selected = [id];
          render();
          setTimeout(() => {
            opsLongPressed = false;
          }, 950);
        }, 420),
      };
    },
    { passive: true },
  );
  app.addEventListener(
    "pointermove",
    (e) => {
      if (!gesture || e.pointerId !== gesture.pointer) return;
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 15) cancel();
    },
    { passive: true },
  );
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
    app.addEventListener(ev, cancel, { passive: true });
  app.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".op-row[data-operation]")) e.preventDefault();
  });
  app.addEventListener(
    "click",
    (e) => {
      if (opsLongPressed && e.target.closest(".op-row")) {
        e.stopImmediatePropagation();
        e.preventDefault();
        opsLongPressed = false;
      }
    },
    true,
  );
}

// Re-render the application and restore focus and scroll positions.
export function render(top = false) {
  setActionHandlers({});
  setInputHandlers({});
  setHandlerCounter(0);
  let html =
    '<div id="base"' +
    (uiState.layers.length ? ' inert aria-hidden="true"' : "") +
    ">" +
    rootView() +
    "</div>" +
    uiState.layers
      .map((s, i) => {
        return `<div class="overlay ${s.kind}" data-layer="${i}" style="z-index:${10 + i * 2}" ${i < uiState.layers.length - 1 ? 'inert aria-hidden="true"' : ""}><section class="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(translate(s.title))}">${s.kind === "sheet" ? '<div class="handle"></div>' : ""}${s.fn()}</section></div>`;
      })
      .join("");
  if (window.__MONIVRA_TEST__) {
    window.__html = html;
    return html;
  }
  const monBeforeBalance = window.__monBalancePrevious ?? null,
    monCurrentBalance = overallBalance(),
    monShouldAnimate =
      monBeforeBalance !== null &&
      monBeforeBalance !== monCurrentBalance &&
      !appData.settings.hidden &&
      !uiState.pages.length &&
      !uiState.layers.length;
  window.__monBalancePrevious = monCurrentBalance;
  const app = document.getElementById("app"),
    old = app.querySelector(".content"),
    scroll = top ? 0 : old?.scrollTop || 0,
    oldPanels = [...app.querySelectorAll(".panel")].map((x) => x.scrollTop),
    oldFilterScrolls = [...app.querySelectorAll(".overlay .mon-filter-scroll")].map(
      (x) => x.scrollTop,
    );
  const focused = document.activeElement,
    focusLabel = focused?.getAttribute("aria-label"),
    selStart = focused?.selectionStart,
    selEnd = focused?.selectionEnd;
  app.innerHTML = html;
  initOpsLongPress();
  document.documentElement.style.setProperty("--accent", appData.settings.accent);
  document.documentElement.classList.toggle(
    "dark",
    appData.settings.theme === "dark" ||
      (appData.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches),
  );
  document.documentElement.lang = appData.settings.language;
  const content = app.querySelector(".content");
  if (content) content.scrollTop = scroll;
  app.querySelectorAll(".panel").forEach((x, i) => (x.scrollTop = oldPanels[i] || 0));
  app.querySelectorAll(".overlay .mon-filter-scroll").forEach((x, i) => {
    x.scrollTop = oldFilterScrolls[i] || 0;
  });
  stabilizeSwipeChrome();
  if (document.querySelector("[data-add-chooser]")) {
    const root = document.querySelector("[data-add-chooser]");
    let sx = 0,
      sy = 0;
    root.addEventListener(
      "touchstart",
      (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true },
    );
    root.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - sx,
          dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const tabs = [...root.querySelectorAll(".mon-add-tab")],
          idx = tabs.findIndex((t) => t.classList.contains("active")),
          next = idx + (dx < 0 ? 1 : -1);
        if (tabs[next]) tabs[next].click();
      },
      { passive: true },
    );
  }
  if (monShouldAnimate) {
    const b = app.querySelector("#base .hero .balance");
    if (b)
      b.classList.add(
        monCurrentBalance > monBeforeBalance ? "mon-balance-rise" : "mon-balance-fall",
      );
  }
  if (focusLabel) {
    const target = [...app.querySelectorAll("input,textarea")].find(
      (x) => x.getAttribute("aria-label") === focusLabel,
    );
    if (target) {
      target.focus({ preventScroll: true });
      if (selStart !== null)
        try {
          target.setSelectionRange(selStart, selEnd);
        } catch {}
    }
  }
  return html;
}
