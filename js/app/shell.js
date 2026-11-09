/* App shell: navigation, root view, rendering */
import { bindSheetSwipe, mountSwipeChrome } from "./chrome.js";
import { initClockDial } from "./clock-dial.js";
import { initColorWheel } from "./color-wheel.js";
import { initDragReorder } from "./drag-reorder.js";
import { initOperationLongPress } from "./long-press.js";
import { mix, readableOver, textOn } from "../core/color.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import {
  appData,
  firstLaunch,
  loadProblem,
  locked,
  rememberPeriod,
  uiState,
} from "../core/state.js";
import { dataFileView, dataView, importDataView } from "../data/import-export.js";
import { deletionView } from "../screens/more/deletion-page.js";
import { exportView } from "../screens/export.js";
import { restoreBackupView, savedBackupsView } from "../screens/more/backup-pages.js";
import { overallBalance } from "../domain/finance.js";
import { translate, translateMarkup } from "../i18n/index.js";
import { rollNumber } from "../ui/reel.js";
import { accountEditView } from "../screens/accounts/edit.js";
import { accountsView } from "../screens/accounts/list.js";
import { accountTypeView } from "../screens/accounts/type.js";
import { categoriesView, categoryEditView, categoryManageView } from "../screens/categories.js";
import { lockView } from "../screens/more/lock.js";
import { moreView } from "../screens/more/menu.js";
import { settingsPage } from "../screens/more/settings-pages.js";
import { infoPage } from "../screens/more/info-pages.js";
import { filteredView, operationsFab, operationsView } from "../screens/operations/list.js";
import { budgetDetailsView, budgetsView, budgetView } from "../screens/budgets.js";
import { scheduledView } from "../screens/scheduled-budgets.js";
import { SETTINGS_TREE_KINDS, settingsTreePage, settingsView } from "../screens/settings.js";
import { statisticsView } from "../screens/statistics.js";
import { exportPreviewView } from "../screens/export-preview.js";
import { IMPORT_VIEWS } from "../screens/import-wizard.js";
import { recoveryView } from "../screens/recovery.js";
import { welcomeView } from "../screens/welcome.js";
import { goHome } from "../ui/navigation.js";
import { resetHandlers } from "../ui/handlers.js";
import { buttonHtml } from "../ui/primitives.js";

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
  filtered: filteredView,
  categoryEdit: categoryEditView,
  categoryManage: categoryManageView,
  scheduled: scheduledView,
  budgets: budgetsView,
  budgetDetails: budgetDetailsView,
  budget: budgetView,
  settings: settingsView,
  data: dataView,
  deletion: deletionView,
  dataFile: dataFileView,
  importData: importDataView,
  export: exportView,
  savedBackups: savedBackupsView,
  restoreBackup: restoreBackupView,
  exportPreview: exportPreviewView,
  ...IMPORT_VIEWS,
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
  return SETTINGS_PAGE_KINDS.includes(page.kind) ? settingsPage(page.kind) : infoPage(page.kind);
}

// HTML of the whole screen: current root tab or the top page, plus layers.
export function rootView() {
  if (locked) return lockView();
  if (loadProblem && !uiState.pages.length) return recoveryView();
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
// Text of the balance as it was drawn last, so the digits that changed can roll from it.
let balanceText = null;

// HTML of the modal layers (sheets and dialogs) on top of the screen.
function layersHtml() {
  return uiState.layers
    .map((layer, i) => {
      const covered = i < uiState.layers.length - 1 ? 'inert aria-hidden="true"' : "";
      const handle = layer.kind === "sheet" ? '<div class="handle"></div>' : "";
      const anchor = layer.anchor ? `;--x:${layer.anchor.x}px;--y:${layer.anchor.y}px` : "";
      return `<div class="overlay ${layer.kind}" data-layer="${i}" style="z-index:${10 + i * 2}${anchor}" ${covered}><section class="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(translate(layer.title))}">${handle}${layer.fn()}</section></div>`;
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

// Roll the digits of the total balance when it appeared or changed.
function animateBalance(before, now) {
  const element = document.querySelector("#base .hero .balance");
  if (!element) return;
  const text = element.textContent;
  const changed = before === null || before !== now;
  if (changed && !appData.settings.hidden && !uiState.pages.length && !uiState.layers.length)
    rollNumber(element, balanceText, now >= (before ?? 0));
  balanceText = text;
}

// Period the tiles were drawn for last; the amounts of the category tiles settle in when the tiles
// appear on a screen or when the period changes.
let tilesPeriod = null;
const TILE_STAGGER_LIMIT = 12;
function animateTileAmounts(screenChanged) {
  const period = JSON.stringify(uiState.period);
  const fresh = screenChanged || tilesPeriod !== period;
  tilesPeriod = period;
  if (!fresh || uiState.tab !== "categories" || uiState.pages.length) return;
  document.querySelectorAll("#base .cat-tile .money").forEach((element, i) => {
    element.style.setProperty("--i", Math.min(i, TILE_STAGGER_LIMIT));
    element.classList.add("money-in");
  });
}

// Scroll positions of the screens that are covered or left, by screen key.
const screenScrolls = new Map();
let renderedScreen = null;

// Identity of what fills the screen: the open page or the root tab.
function screenKey() {
  return uiState.pages.length ? uiState.pages.map((p) => p.kind).join(">") : uiState.tab;
}
// Position of an element among the children of the app, so it can be found after a re-render.
function domPath(app, el) {
  const path = [];
  for (let node = el; node !== app; node = node.parentElement)
    path.unshift([...node.parentElement.children].indexOf(node));
  return path;
}
// Every scrolled container (vertical or horizontal) with the place it has to return to.
function scrolledContainers(app) {
  return [...app.querySelectorAll("*")]
    .filter((el) => el.scrollTop || el.scrollLeft)
    .map((el) => ({
      path: domPath(app, el),
      className: el.className,
      top: el.scrollTop,
      left: el.scrollLeft,
      base: !!el.closest("#base"),
    }));
}
// The element a scrolled container became: the one at the same place in the page, or, when the
// markup around it changed (a header appeared above the list), the only one with the same classes.
function findContainer(app, { path, className }) {
  let el = app;
  for (const i of path) el = el?.children[i];
  if (el && el.className === className) return el;
  if (!className) return null;
  const same = [...app.querySelectorAll("*")].filter((x) => x.className === className);
  return same.length === 1 ? same[0] : null;
}
function restoreContainers(app, saved) {
  for (const container of saved) {
    const el = findContainer(app, container);
    if (!el) continue;
    el.scrollTop = container.top;
    el.scrollLeft = container.left;
  }
}

// Re-render the application and restore focus and scroll positions.
export function render(top = false) {
  rememberPeriod();
  resetHandlers();
  const baseAttrs = uiState.layers.length ? ' inert aria-hidden="true"' : "";
  const html = translateMarkup(`<div id="base"${baseAttrs}>${rootView()}</div>${layersHtml()}`);
  const balanceBefore = previousBalance;
  previousBalance = overallBalance();
  const app = document.getElementById("app");
  // Remember what has to survive the re-render.
  const screen = screenKey();
  const scrolled = scrolledContainers(app);
  const screenChanged = renderedScreen !== null && renderedScreen !== screen;
  if (screenChanged)
    screenScrolls.set(
      renderedScreen,
      scrolled.filter((x) => x.base),
    );
  if (top) screenScrolls.delete(screen);
  renderedScreen = screen;
  const focused = document.activeElement;
  const focusLabel = focused?.getAttribute("aria-label");
  const selectionStart = focused?.selectionStart;
  const selectionEnd = focused?.selectionEnd;
  app.innerHTML = html;
  initOperationLongPress();
  initDragReorder();
  initColorWheel();
  initClockDial();
  applyAppearance();
  // A screen that comes back finds its scroll where it was left; a re-render keeps everything.
  if (screenChanged) restoreContainers(app, screenScrolls.get(screen) || []);
  else if (!top) restoreContainers(app, scrolled);
  mountSwipeChrome();
  bindSheetSwipe();
  animateBalance(balanceBefore, previousBalance);
  animateTileAmounts(screenChanged);
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
}
