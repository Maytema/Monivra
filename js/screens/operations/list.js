/* Operations tab and the filtered list: rows, days, balance summary and selection */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { appData, emptyFilters, uiState } from "../../core/state.js";
import {
  accountById,
  amountPair,
  categoryById,
  categoryCount,
  categoryFamily,
  categoryTotalIn,
  convertCurrency,
  formatMoney,
  moneySpanHtml,
  offRate,
  parseDate,
  periodBounds,
  transferRoles,
  visibleOperations,
} from "../../domain/finance.js";
import { currentLocale, translate, translateWith } from "../../i18n/index.js";
import { hero } from "../accounts/list.js";
import { upcomingOperations } from "../../domain/scheduled.js";
import { postedNoticeHtml } from "../due-payments.js";
import { operationStart } from "../operation-editor/start.js";
import { operationTitle } from "../operation-title.js";
import { pairRateText } from "../../ui/rate-line.js";
import { openPage } from "../../ui/navigation.js";
import { emptyStateHtml } from "../../ui/empty-state.js";
import {
  badgeHtml,
  buttonHtml,
  fabHtml,
  iconButtonHtml,
  pageHeader,
  swipePane,
} from "../../ui/primitives.js";
import { periodBar } from "../../ui/period-picker.js";
import { operationsAddMenu } from "./add-menu.js";
import { filters } from "./filters.js";
import { selectionActions } from "./bulk-edit.js";

// Change the selection; with nothing left selected the selection mode closes by itself.
function setSelected(ids) {
  uiState.selected = ids;
  if (!ids.length) uiState.selection = false;
  render();
}

// Color of an amount: red for money spent, green for money earned, also for a transfer that counts
// as an expense or an income because of a debt account.
function amountTone(o) {
  const roles = transferRoles(o);
  if (o.type === "expense" || (o.type === "adjustment" && o.from) || roles.expense) return "neg";
  if (o.type === "income" || (o.type === "adjustment" && o.to) || roles.income) return "pos";
  return "";
}

// The two amounts of a balance correction that has the account and "Adjustment" in different
// currencies: what the account got or lost and what "Adjustment" gave or took.
function adjustmentSides(o, account) {
  if (o.type !== "adjustment" || o.receive === undefined || !account) return null;
  const raise = !!o.to;
  return { account: raise ? o.receive : o.amount, pseudo: raise ? o.amount : o.receive };
}

// One row in the operations list.
export function opRow(o, scheduled = o.upcoming === true) {
  const a = accountById(o.from || o.to),
    c = categoryById(o.category),
    selected = uiState.selected.includes(o.id),
    adjustment = adjustmentSides(o, a),
    // The amount in the category's currency, shown while the category and account differ.
    inCategory =
      o.categoryAmount?.currency === c?.currency && c?.currency !== a?.currency
        ? o.categoryAmount
        : null;
  // The rate of the operation, shown only when its amounts do not follow the current rate.
  const pair = amountPair(o),
    rate = pair && offRate(pair) ? pair : null;
  return buttonHtml(
    `${uiState.selection ? `<span class="ops-select-icon ${selected ? "is-selected" : ""}">${selected ? iconSvg("check", 25) : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}</span>` : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}<span class="grow"><span class="op-name">${escapeHtml(operationTitle(o))}${o.photos?.length ? iconSvg("clip", 15) : ""}</span><span class="op-account">${iconSvg(a?.icon || "wallet", 18)} ${escapeHtml(a?.name || "")}${o.type === "transfer" ? " → " + escapeHtml(accountById(o.to)?.name || "") : ""}</span>${o.upcoming ? `<span class="op-upcoming">${iconSvg("calendar", 15)} ${translate("Upcoming")}</span>` : ""}${o.comment ? `<span class="op-comment">${escapeHtml(o.comment)}</span>` : ""}${o.tags?.length ? `<span class="op-tags">${o.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</span>` : ""}</span><span class="op-amount ${amountTone(o)}">${o.recalculated ? `<small class="op-foreign op-note">${translateWith("was {amount}", { amount: formatMoney(o.recalculated.amount, o.recalculated.currency) })}</small>` : ""}${adjustment ? `<small class="op-foreign">${formatMoney(adjustment.pseudo, appData.settings.currency)}</small>` : ""}${inCategory ? `<small class="op-foreign">${formatMoney(inCategory.amount, inCategory.currency)}</small>` : ""}${o.foreign ? `<small class="op-foreign">${formatMoney(o.foreign.amount, o.foreign.currency)}</small>` : ""}${o.type === "adjustment" ? (o.to ? "+" : "−") : ""}${formatMoney(adjustment ? adjustment.account : o.amount, a?.currency)}${rate ? `<small class="op-foreign op-note">${pairRateText(rate)}</small>` : ""}</span>`,
    () => {
      if (uiState.selection) {
        setSelected(
          selected ? uiState.selected.filter((x) => x !== o.id) : [...uiState.selected, o.id],
        );
      } else
        operationStart(
          scheduled ? (appData.scheduled.find((x) => x.id === o.id) ?? o) : o,
          scheduled,
        );
    },
    "op-row " + (selected ? "selected" : "") + (o.upcoming ? " upcoming" : ""),
    `data-operation="${escapeHtml(o.id)}"`,
  );
}

// Is any filter currently active?
export function filterActive() {
  const f = uiState.filters;
  return !!(f.accounts || f.categories || f.types || f.tags || f.comment || f.kinds || f.budgets);
}

// Total balance of the filtered accounts at a given date.
function balanceAt(date, exclusive = false) {
  return appData.accounts
    .filter(
      (a) =>
        a.include &&
        !a.archived &&
        (!uiState.filters.accounts || uiState.filters.accounts.includes(a.id)),
    )
    .reduce(
      (sum, a) =>
        sum +
        convertCurrency(
          a.opening +
            appData.ops
              .filter((o) => (exclusive ? o.date < date : o.date <= date))
              .reduce(
                (n, o) =>
                  n +
                  (o.to === a.id ? (o.receive ?? o.amount) : 0) -
                  (o.from === a.id ? o.amount : 0),
                0,
              ),
          a.currency,
          appData.settings.currency,
        ),
      0,
    );
}

// Balance at the start of the selected period.
function periodOpening() {
  return balanceAt(periodBounds()[0], true);
}

// Balance at the end of the selected period.
function periodClosing() {
  return balanceAt(periodBounds()[1]);
}

// Header of the selection mode: exit button, counter and select-all.
function selectionHeader(ops) {
  const exit = iconButtonHtml("close", "Exit selection", () => {
    uiState.selection = false;
    uiState.selected = [];
    render();
  });
  const selectAll = iconButtonHtml("check", "Select all", () => {
    setSelected(uiState.selected.length === ops.length ? [] : ops.map((o) => o.id));
  });
  return `<div class="ops-selection-header">${exit}<strong>${translateWith("Selected: {n}", { n: uiState.selected.length })}</strong>${selectAll}</div>`;
}

// Opening and closing balance of the selected period.
function balanceSummary() {
  const opening = moneySpanHtml(periodOpening(), undefined, false, true);
  const closing = moneySpanHtml(periodClosing(), undefined, false, true);
  return `<div class="opening"><span>${translate("Opening balance")}${opening}</span><span>${translate("Closing balance")}${closing}</span></div>`;
}

// Net result of one day (income minus expenses) in the main currency.
function dayTotal(dayOps) {
  return dayOps.reduce((sum, o) => {
    const sign = o.type === "income" ? 1 : o.type === "expense" ? -1 : 0;
    const currency = accountById(o.from || o.to)?.currency;
    return sum + sign * convertCurrency(o.amount, currency, appData.settings.currency);
  }, 0);
}

// Date heading with the day total, followed by the operations of that day.
function dayGroup(date, ops, upcoming) {
  const dayOps = ops.filter((o) => o.date === date);
  const day = parseDate(date);
  const weekday = day.toLocaleDateString(currentLocale(), { weekday: "short", timeZone: "UTC" });
  const monthYear = day.toLocaleDateString(currentLocale(), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `<div class="day-head"><span class="day-num">${Number(date.slice(-2))}</span><span class="day-desc">${weekday}<br>${monthYear}</span><span class="day-total">${dayOps.length ? moneySpanHtml(dayTotal(dayOps)) : ""}</span></div>${upcoming
    .filter((o) => o.date === date)
    .concat(dayOps)
    .map((o) => opRow(o))
    .join("")}`;
}

// The days of the list, newest first: the operations of each day, and the payments still to come.
function dayGroups(ops, upcoming) {
  const dates = [...new Set([...ops, ...upcoming].map((o) => o.date))].sort().reverse();
  return dates.map((date) => dayGroup(date, ops, upcoming)).join("");
}

// Floating "Add" button of the operations tab.
export const operationsFab = () => fabHtml("Add", () => operationsAddMenu());

// Strip under the period bar while filters are on: tap the text to change them, the red button clears them.
export function filteredBannerHtml(edit = filters, clear = clearFilters) {
  return `<div class="filtered-banner">${iconSvg("info", 20)}${buttonHtml("Filtered data", edit, "filtered-text")}${iconButtonHtml("filterOff", "Clear filters", clear)}</div>`;
}
function clearFilters() {
  uiState.filters = emptyFilters();
  render();
}

// Hint shown under the empty-state title.
const EMPTY_HINT = "Start adding expenses or income and the data will appear";

// Operations tab.
export function operationsView() {
  const ops = visibleOperations();
  // Selecting is for operations, which payments still to come are not.
  const upcoming = uiState.selection ? [] : upcomingOperations();
  const banner = filterActive() ? filteredBannerHtml() : "";
  const summary =
    appData.settings.opening && ops.length > 0 && !filterActive() ? balanceSummary() : "";
  const empty =
    ops.length + upcoming.length ? "" : emptyStateHtml("operations", "Empty", EMPTY_HINT);
  const list = `<div class="content">${postedNoticeHtml()}${summary}${dayGroups(ops, upcoming)}${empty}</div>`;
  const pane = periodBar() + banner + list;
  if (uiState.selection) return swipePane(selectionHeader(ops) + pane + selectionActions());
  return hero() + swipePane(pane);
}

// Operations of one filter (a category, say) on a page of their own; going back restores the list as it was.
export function openFilteredOperations(filter, period = uiState.period) {
  const before = { filters: uiState.filters, period: uiState.period };
  uiState.filters = { ...emptyFilters(), ...filter };
  uiState.period = period;
  openPage("filtered", { restore: () => Object.assign(uiState, before) });
}

// The one category the filter chooses as a whole (itself and all its subcategories), if any.
function filteredCategory() {
  const chosen = uiState.filters.categories;
  if (!chosen) return undefined;
  return appData.categories.find((c) => {
    const family = categoryFamily(c.id);
    return family.length === chosen.length && family.every((id) => chosen.includes(id));
  });
}

// Page with the filtered operations; a single category gets a card with its figures.
export function filteredView() {
  const ops = visibleOperations(),
    upcoming = upcomingOperations();
  const c = filteredCategory();
  const card = c
    ? `<div class="filtered-card"><span class="filtered-card-title">${translate("Sum of operations for the period")}</span><div class="filtered-card-body">${badgeHtml(c)}<div class="grow"><strong>${escapeHtml(c.name)}</strong><small>${translateWith("Operations: {n}", { n: categoryCount(c.id) })}</small></div><span class="money">${formatMoney(categoryTotalIn(c), c.currency)}</span></div></div>`
    : "";
  const empty =
    ops.length + upcoming.length ? "" : emptyStateHtml("operations", "Empty", EMPTY_HINT);
  return `${pageHeader("Filtered")}${periodBar()}<div class="content">${card}${dayGroups(ops, upcoming)}${empty}</div>${operationsFab()}`;
}

// Toggle the operations search bar.
export function toggleOperationSearch() {
  uiState.search = !uiState.search;
  if (!uiState.search) uiState.filters.comment = "";
  render();
}
