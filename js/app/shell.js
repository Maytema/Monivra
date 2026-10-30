/* App shell: navigation, root view, rendering */
import { bindAddChooserSwipe, mountSwipeChrome } from "./chrome.js";
import { initColorWheel } from "./color-wheel.js";
import { initDragReorder } from "./drag-reorder.js";
import { initOperationLongPress } from "./long-press.js";
import { mix, readableOver, textOn } from "../core/color.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData, firstLaunch, locked, uiState } from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { dataView } from "../data/import-export.js";
import { overallBalance } from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { accountEditView, accountTypeView, accountsView } from "../screens/accounts.js";
import {
  categoriesView,
  categoryEditView,
  categoryManageView,
  orderView,
} from "../screens/categories.js";
import { lockView, moreView, settingsPage, simplePage } from "../screens/more.js";
import { operationsFab, operationsView } from "../screens/operations.js";
import { budgetView, budgetsView, scheduledView } from "../screens/scheduled-budgets.js";
import { SETTINGS_TREE_KINDS, settingsTreePage, settingsView } from "../screens/settings.js";
import { statisticsView } from "../screens/statistics.js";
import { welcomeView } from "../screens/welcome.js";
import { goHome } from "../ui/kit.js";
import {
  buttonHtml,
  setActionHandlers,
  setHandlerCounter,
  setInputHandlers,
} from "../ui/primitives.js";

// Bottom navigation bar.
function navigationBar() {
  return `<nav class="navbar labels-${appData.settings.navLabels === "active" ? "selected" : appData.settings.navLabels}" aria-label="Main navigation">${[
    ["accounts", "wallet", "Accounts"],
    ["categories", "categories", "Categories"],
    ["operations", "receipt", "Operations"],
    ["statistics", "stats", "Statistics"],
    ["more", "apps", "More"],
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
// Full-screen pages that replace the root tab, by page kind.
const PAGE_VIEWS = {
  accountEdit: accountEditView,
  accountType: accountTypeView,
  accountOrder: () => orderView("accounts"),
  categoryOrder: () => orderView("categories"),
  categoryEdit: categoryEditView,
  categoryManage: categoryManageView,
  scheduled: scheduledView,
  budgets: budgetsView,
  budget: budgetView,
  settings: settingsView,
  data: dataView,
};
const SETTINGS_PAGE_KINDS = ["backups", "notifications", "security", "privacy", "rates"];
// Root tabs.
const TAB_VIEWS = {
  accounts: accountsView,
  categories: categoriesView,
  operations: operationsView,
  statistics: statisticsView,
  more: moreView,
};

// HTML of a full-screen page (account editor, settings, ...).
function pageView(page) {
  const view = PAGE_VIEWS[page.kind];
  if (view) return view(page);
  if (SETTINGS_TREE_KINDS.includes(page.kind)) return settingsTreePage(page.kind);
  return SETTINGS_PAGE_KINDS.includes(page.kind) ? settingsPage(page.kind) : simplePage(page.kind);
}

// HTML of the whole screen: current root tab or the top page, plus layers.
export function rootView() {
  if (locked) return lockView();
  if (firstLaunch) return welcomeView();
  const page = uiState.pages.at(-1);
  if (page) return pageView(page);
  let html = (TAB_VIEWS[uiState.tab] || accountsView)();
  if (!(uiState.tab === "operations" && uiState.selection)) html += navigationBar();
  if (uiState.tab === "operations" && !uiState.selection) html += operationsFab();
  return html;
}
// Balance shown by the previous render, used to animate balance changes.
let previousBalance = null;

// HTML of the modal layers (sheets and dialogs) on top of the screen.
function layersHtml() {
  return uiState.layers
    .map((layer, i) => {
      const covered = i < uiState.layers.length - 1 ? 'inert aria-hidden="true"' : "";
      const handle = layer.kind === "sheet" ? '<div class="handle"></div>' : "";
      return `<div class="overlay ${layer.kind}" data-layer="${i}" style="z-index:${10 + i * 2}" ${covered}><section class="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(translate(layer.title))}">${handle}${layer.fn()}</section></div>`;
    })
    .join("");
}

// Apply theme, accent color and language to the document.
function applyAppearance() {
  const root = document.documentElement;
  const dark =
    appData.settings.theme === "dark" ||
    (appData.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  // Text colors derived from the accent so that every accent stays readable.
  const accent = appData.settings.accent;
  // The most tinted surface (selected tab, chip, key) is the hardest one to read on.
  const background = dark ? mix(accent, "#2a272e", 0.32) : mix(accent, "#ffffff", 0.18);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--on-accent", textOn(accent));
  root.style.setProperty("--accent-ink", readableOver(accent, background));
  root.lang = appData.settings.language;
}

// Play the rise/fall animation on the balance when it changed.
function animateBalance(before, now) {
  if (before === null || before === now || appData.settings.hidden) return;
  if (uiState.pages.length || uiState.layers.length) return;
  document
    .querySelector("#base .hero .balance")
    ?.classList.add(now > before ? "balance-rise" : "balance-fall");
}

// Re-render the application and restore focus and scroll positions.
export function render(top = false) {
  setActionHandlers({});
  setInputHandlers({});
  setHandlerCounter(0);
  const baseAttrs = uiState.layers.length ? ' inert aria-hidden="true"' : "";
  const html = `<div id="base"${baseAttrs}>${rootView()}</div>${layersHtml()}`;
  if (isTestMode()) {
    window.__html = html;
    return html;
  }
  const balanceBefore = previousBalance;
  previousBalance = overallBalance();
  const app = document.getElementById("app");
  // Remember what has to survive the re-render.
  const scroll = top ? 0 : app.querySelector(".content")?.scrollTop || 0;
  const panelScrolls = [...app.querySelectorAll(".panel")].map((x) => x.scrollTop);
  const filterScrolls = [...app.querySelectorAll(".overlay .filter-scroll")].map(
    (x) => x.scrollTop,
  );
  const focused = document.activeElement;
  const focusLabel = focused?.getAttribute("aria-label");
  const selectionStart = focused?.selectionStart;
  const selectionEnd = focused?.selectionEnd;
  app.innerHTML = html;
  initOperationLongPress();
  initDragReorder();
  initColorWheel();
  applyAppearance();
  // Restore scroll positions.
  const content = app.querySelector(".content");
  if (content) content.scrollTop = scroll;
  app.querySelectorAll(".panel").forEach((x, i) => (x.scrollTop = panelScrolls[i] || 0));
  app.querySelectorAll(".overlay .filter-scroll").forEach((x, i) => {
    x.scrollTop = filterScrolls[i] || 0;
  });
  mountSwipeChrome();
  bindAddChooserSwipe();
  animateBalance(balanceBefore, previousBalance);
  // Restore focus (and caret) of the field that was being edited.
  if (focusLabel) {
    const field = [...app.querySelectorAll("input,textarea")].find(
      (x) => x.getAttribute("aria-label") === focusLabel,
    );
    field?.focus({ preventScroll: true });
    if (field && selectionStart !== null && selectionStart !== undefined)
      try {
        field.setSelectionRange(selectionStart, selectionEnd);
      } catch {
        // some input types have no caret
      }
  }
  return html;
}
