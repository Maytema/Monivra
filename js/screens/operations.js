/* Operations list, filters, details, bulk actions */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, emptyFilters, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  ACCOUNT_GROUPS,
  accountBalance,
  accountById,
  categoryById,
  categoryCount,
  categoryTotalIn,
  convertCurrency,
  dateLabel,
  defaultAccountId,
  formatMoney,
  moneySpanHtml,
  parseDate,
  periodBounds,
  transferRoles,
  visibleOperations,
} from "../domain/finance.js";
import { validateOp } from "../domain/operations.js";
import { currentLocale, translate, translateCount, translateWith } from "../i18n/index.js";
import { hero } from "./accounts.js";
import { opTitle, operationStart } from "./operation-editor.js";
import { accountPicker, categoryPicker } from "./pickers.js";
import {
  calendar,
  closeLayers,
  confirmAction,
  emptyStateHtml,
  openPage,
  openSheet,
  pageHeader,
  periodBar,
  promptText,
  swipePane,
} from "../ui/kit.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  registerAction,
  registerInput,
  toast,
} from "../ui/primitives.js";

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
export function opRow(o, scheduled = false) {
  const a = accountById(o.from || o.to),
    c = categoryById(o.category),
    selected = uiState.selected.includes(o.id),
    adjustment = adjustmentSides(o, a),
    // The amount in the category's currency, shown while the category and account differ.
    inCategory =
      o.categoryAmount?.currency === c?.currency && c?.currency !== a?.currency
        ? o.categoryAmount
        : null;
  return buttonHtml(
    `${uiState.selection ? `<span class="ops-select-icon ${selected ? "is-selected" : ""}">${selected ? iconSvg("check", 25) : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}</span>` : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}<span class="grow"><span class="op-name">${escapeHtml(opTitle(o))}${o.photo ? iconSvg("clip", 15) : ""}</span><span class="op-account">${iconSvg(a?.icon || "wallet", 18)} ${escapeHtml(a?.name || "")}${o.type === "transfer" ? " → " + escapeHtml(accountById(o.to)?.name || "") : ""}${scheduled ? " · " + escapeHtml(dateLabel(o.date, true)) : ""}</span>${o.comment ? `<span class="op-comment">${escapeHtml(o.comment)}</span>` : ""}${o.tags?.length ? `<span class="op-tags">${o.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</span>` : ""}</span><span class="op-amount ${amountTone(o)}">${o.recalculated ? `<small class="op-foreign op-was">${translateWith("was {amount}", { amount: formatMoney(o.recalculated.amount, o.recalculated.currency) })}</small>` : ""}${adjustment ? `<small class="op-foreign">${formatMoney(adjustment.pseudo, appData.settings.currency)}</small>` : ""}${inCategory ? `<small class="op-foreign">${formatMoney(inCategory.amount, inCategory.currency)}</small>` : ""}${o.foreign ? `<small class="op-foreign">${formatMoney(o.foreign.amount, o.foreign.currency)}</small>` : ""}${o.type === "adjustment" ? (o.to ? "+" : "−") : ""}${formatMoney(adjustment ? adjustment.account : o.amount, a?.currency)}</span>`,
    () => {
      if (uiState.selection) {
        setSelected(
          selected ? uiState.selected.filter((x) => x !== o.id) : [...uiState.selected, o.id],
        );
      } else operationStart(o, scheduled);
    },
    "op-row " + (selected ? "selected" : ""),
    `data-operation="${escapeHtml(o.id)}"`,
  );
}
// Is any filter currently active?
export function filterActive() {
  const f = uiState.filters;
  return !!(f.accounts || f.categories || f.types || f.tags || f.comment);
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
function dayGroup(date, ops) {
  const dayOps = ops.filter((o) => o.date === date);
  const day = parseDate(date);
  const weekday = day.toLocaleDateString(currentLocale(), { weekday: "short", timeZone: "UTC" });
  const monthYear = day.toLocaleDateString(currentLocale(), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `<div class="day-head"><span class="day-num">${Number(date.slice(-2))}</span><span class="day-desc">${weekday}<br>${monthYear}</span><span class="day-total">${moneySpanHtml(dayTotal(dayOps))}</span></div>${dayOps.map((o) => opRow(o)).join("")}`;
}
// Delete / change date / more buttons shown in selection mode.
function selectionActions() {
  const changeDate = () => {
    if (!uiState.selected.length) return toast("Select operations");
    calendar(TODAY, (date) => {
      appData.ops.filter((o) => uiState.selected.includes(o.id)).forEach((o) => (o.date = date));
      save();
      render();
    });
  };
  return `<div class="operations-selection-actions">${buttonHtml(iconSvg("trash", 21) + " Delete", bulkDeleteOperations, "selection-action")}${buttonHtml(iconSvg("calendar", 21) + " Date", changeDate, "selection-action")}${buttonHtml(iconSvg("more", 21) + " More", bulkEdit, "selection-action")}</div>`;
}
// Floating "Add" button of the operations tab.
export function operationsFab() {
  return buttonHtml(
    iconSvg("plus", 26) + `<span class="fab-label"><span>${translate("Add")}</span></span>`,
    () => operationsAddMenu(),
    "fab fab-add",
    `aria-label="Add operation"`,
  );
}
// Strip under the period bar while filters are on: tap the text to change them, the red button clears them.
export function filteredBannerHtml() {
  return `<div class="filtered-banner">${iconSvg("info", 20)}${buttonHtml("Filtered data", filters, "filtered-text")}${iconButtonHtml(
    "filterOff",
    "Clear filters",
    () => {
      uiState.filters = emptyFilters();
      render();
    },
  )}</div>`;
}
// Hint shown under the empty-state title.
const EMPTY_HINT = "Start adding expenses or income and the data will appear";
// Operations tab.
export function operationsView() {
  const ops = visibleOperations();
  const dates = [...new Set(ops.map((o) => o.date))];
  const banner = filterActive() ? filteredBannerHtml() : "";
  const summary =
    appData.settings.opening && ops.length > 0 && !filterActive() ? balanceSummary() : "";
  const empty = ops.length ? "" : emptyStateHtml("operations", "Empty", EMPTY_HINT);
  const list = `<div class="content">${summary}${dates.map((date) => dayGroup(date, ops)).join("")}${empty}</div>`;
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
// Page with the filtered operations; a single category gets a card with its figures.
export function filteredView() {
  const ops = visibleOperations();
  const dates = [...new Set(ops.map((o) => o.date))];
  const [id] = uiState.filters.categories?.length === 1 ? uiState.filters.categories : [];
  const c = categoryById(id);
  const card = c
    ? `<div class="filtered-card"><span class="filtered-card-title">${translate("Sum of operations for the period")}</span><div class="filtered-card-body">${badgeHtml(c)}<div class="grow"><strong>${escapeHtml(c.name)}</strong><small>${translateWith("Operations: {n}", { n: categoryCount(c.id) })}</small></div><span class="money">${formatMoney(categoryTotalIn(c), c.currency)}</span></div></div>`
    : "";
  const empty = ops.length ? "" : emptyStateHtml("operations", "Empty", EMPTY_HINT);
  return `${pageHeader("Filtered")}${periodBar()}<div class="content">${card}${dates.map((date) => dayGroup(date, ops)).join("")}${empty}</div>${operationsFab()}`;
}

// Chooser opened by the + button on the operations tab.
export function operationsAddMenu(extra = {}, scheduled = false) {
  // Three primary tabs exactly as the source application. Selection is the
  // only transition into an editor; switching or dismissing never creates one.
  const state = { direction: "expense" };
  const directions = ["income", "expense", "accounts"];
  const choose = (item) => {
    const dir = state.direction;
    closeLayers();
    if (dir === "expense")
      operationStart(
        { type: "expense", category: item.id, from: defaultAccountId(), ...extra },
        scheduled,
      );
    else if (dir === "income")
      operationStart(
        { type: "income", category: item.id, to: defaultAccountId(), ...extra },
        scheduled,
      );
    else
      operationStart(
        { type: "transfer", from: item.id, to: defaultAccountId(item.id), ...extra },
        scheduled,
      );
  };
  const view = () => {
    const dir = state.direction;
    const items =
      dir === "accounts"
        ? appData.accounts.filter((a) => !a.archived)
        : appData.categories.filter((c) => !c.archived && !c.parent && c.type === dir);
    return `<div class="add-shell" data-add-chooser="1"><h2 class="add-heading">Add an operation</h2><div class="add-tabs">${directions
      .map((id) =>
        buttonHtml(
          id === "income" ? "Incomes" : id === "expense" ? "Expenses" : "Accounts",
          () => {
            state.direction = id;
            render();
          },
          "add-tab " + (dir === id ? "active" : ""),
        ),
      )
      .join(
        "",
      )}</div><div class="add-grid">${items.map((item) => buttonHtml(`${badgeHtml(item)}<span class="add-item-text"><strong>${escapeHtml(item.name)}</strong><small>${formatMoney(dir === "accounts" ? accountBalance(item.id) : appData.ops.filter((o) => o.category === item.id || categoryById(o.category)?.parent === item.id).reduce((n, o) => n + o.amount, 0), item.currency || appData.settings.currency)}</small></span>`, () => choose(item), "add-item")).join("")}</div></div>`;
  };
  openSheet(view, "Add an operation");
  // Event delegation survives redraws of the sheet's inner content.
  const attach = () => {
    const panel = document.querySelector("[data-add-chooser]");
    if (!panel || panel.dataset.swipeReady) return;
    panel.dataset.swipeReady = "1";
    let x = 0,
      y = 0;
    panel.addEventListener(
      "touchstart",
      (e) => {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      },
      { passive: true },
    );
    panel.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - x,
          dy = e.changedTouches[0].clientY - y;
        if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        const next = directions.indexOf(state.direction) + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < 3) {
          state.direction = directions[next];
          render();
          attach();
        }
      },
      { passive: true },
    );
  };
  requestAnimationFrame(attach);
}

// Toggle the operations search bar.
export function operationsMenu() {
  uiState.search = !uiState.search;
  if (!uiState.search) uiState.filters.comment = "";
  render();
}
// Generic multi-select sheet with select-all.
export function multiSelect(title, items, selected, fn) {
  let values = selected ? new Set(selected) : new Set(items.map((i) => i.id));
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><div class="toolbar">${buttonHtml(
        "Select all",
        () => {
          values = new Set(items.map((i) => i.id));
          render();
        },
        "text-button",
      )}${buttonHtml(
        "Clear",
        () => {
          values.clear();
          render();
        },
        "text-button",
      )}</div>${items
        .map((i) =>
          buttonHtml(
            `<input type="checkbox" tabindex="-1" ${values.has(i.id) ? "checked" : ""} aria-label="${escapeHtml(i.name)}"><span>${escapeHtml(i.name)}</span>`,
            () => {
              values.has(i.id) ? values.delete(i.id) : values.add(i.id);
              render();
            },
            "checkrow",
          ),
        )
        .join("")}${buttonHtml(
        "Apply",
        () => {
          closeLayers();
          fn(values.size === items.length ? null : [...values]);
        },
        "primary",
      )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    title,
  );
}
// Account selection grouped by account type.
function filterAccountSelect(selected, done) {
  let values = selected ? new Set(selected) : new Set(appData.accounts.map((a) => a.id));
  const groups = ACCOUNT_GROUPS;
  const checked = (ids) => ids.length > 0 && ids.every((id) => values.has(id));
  const expanded = new Set(groups.map((g) => g[0]));
  openSheet(
    () =>
      `<div class="filter-picker-head"><h2>Accounts</h2><span>${translateWith("{n} selected", { n: values.size })}</span></div><div class="filter-scroll">${groups
        .map(([name, predicate]) => {
          const items = appData.accounts.filter(predicate),
            ids = items.map((a) => a.id);
          if (!items.length) return "";
          return `<div class="filter-group"><div class="filter-group-head"><button type="button" class="filter-group-check" aria-label="${translateWith("Toggle all {name}", { name: translate(name) })}" data-action="${registerAction(
            () => {
              const on = checked(ids);
              ids.forEach((id) => (on ? values.delete(id) : values.add(id)));
              render();
            },
          )}"><span class="checkbox ${checked(ids) ? "on" : ""}">${checked(ids) ? "✓" : ""}</span></button><button type="button" class="filter-group-toggle" data-action="${registerAction(
            () => {
              expanded.has(name) ? expanded.delete(name) : expanded.add(name);
              render();
            },
          )}">${iconSvg(expanded.has(name) ? "down" : "right", 18)} <strong>${name}</strong><small>${ids.filter((id) => values.has(id)).length}/${ids.length}</small></button></div>${
            expanded.has(name)
              ? items
                  .map(
                    (a) =>
                      `<button class="filter-choice" data-action="${registerAction(() => {
                        values.has(a.id) ? values.delete(a.id) : values.add(a.id);
                        render();
                      })}"><span class="checkbox ${values.has(a.id) ? "on" : ""}">${values.has(a.id) ? "✓" : ""}</span>${badgeHtml(a, true)}<span>${escapeHtml(a.name)}</span></button>`,
                  )
                  .join("")
              : ""
          }</div>`;
        })
        .join(
          "",
        )}</div><div class="filter-footer">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
        "Confirm",
        () => {
          closeLayers();
          done(values.size === appData.accounts.length ? null : [...values]);
        },
        "primary",
      )}</div>`,
    "Accounts",
  );
}
// Category selection with expandable tree.
function filterCategorySelect(selected, done) {
  let values = selected ? new Set(selected) : new Set(appData.categories.map((c) => c.id));
  const ids = appData.categories.map((c) => c.id),
    expanded = new Set(["expense", "income"]);
  const parentExpanded = new Set(appData.categories.filter((c) => !c.parent).map((c) => c.id));
  const checked = (group) => group.length > 0 && group.every((id) => values.has(id));
  const toggle = (group) => {
    const on = checked(group);
    group.forEach((id) => (on ? values.delete(id) : values.add(id)));
    render();
  };
  openSheet(
    () =>
      `<div class="filter-picker-head"><h2>Filter by categories</h2></div><div class="filter-scroll filter-category-tree">${[
        "expense",
        "income",
      ]
        .map((type) => {
          const group = appData.categories.filter((c) => c.type === type),
            groupIds = group.map((c) => c.id);
          return `<div class="filter-group"><div class="filter-group-head"><button class="filter-expand" aria-label="${translateWith("Expand {name}", { name: translate(type === "expense" ? "Expenses" : "Incomes") })}" data-action="${registerAction(
            () => {
              expanded.has(type) ? expanded.delete(type) : expanded.add(type);
              render();
            },
          )}">${iconSvg(expanded.has(type) ? "down" : "right", 19)}</button><strong>${type === "expense" ? "Expenses" : "Incomes"}</strong><button class="filter-check-action" aria-label="${translateWith("Select {name}", { name: translate(type === "expense" ? "Expenses" : "Incomes") })}" data-action="${registerAction(() => toggle(groupIds))}"><span class="checkbox ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${
            expanded.has(type)
              ? group
                  .filter((c) => !c.parent)
                  .map((c) => {
                    const children = group.filter((x) => x.parent === c.id),
                      groupIds = [c.id, ...children.map((x) => x.id)],
                      open = parentExpanded.has(c.id);
                    return `<div class="filter-parent-row">${
                      children.length
                        ? `<button class="filter-expand" aria-label="${translateWith("Expand {name}", { name: escapeHtml(c.name) })}" data-action="${registerAction(
                            () => {
                              open ? parentExpanded.delete(c.id) : parentExpanded.add(c.id);
                              render();
                            },
                          )}">${iconSvg(open ? "down" : "right", 18)}</button>`
                        : '<span class="filter-expand-placeholder"></span>'
                    }${badgeHtml(c, true)}<span class="filter-label">${escapeHtml(c.name)}</span><button class="filter-check-action" aria-label="${translateWith("Select {name}", { name: escapeHtml(c.name) })}" data-action="${registerAction(() => toggle(groupIds))}"><span class="checkbox ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${open && children.length ? `<div class="filter-subcategories">${children.map((x) => `<div class="filter-child-row"><span class="filter-label">${escapeHtml(x.name)}</span><button class="filter-check-action" aria-label="Select ${escapeHtml(x.name)}" data-action="${registerAction(() => toggle([x.id]))}"><span class="checkbox ${values.has(x.id) ? "on" : ""}">${values.has(x.id) ? "✓" : ""}</span></button></div>`).join("")}</div>` : ""}`;
                  })
                  .join("")
              : ""
          }</div>`;
        })
        .join(
          "",
        )}</div><div class="filter-footer">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
        "Confirm",
        () => {
          closeLayers();
          done(values.size === ids.length ? null : [...values]);
        },
        "primary",
      )}</div>`,
    "Filter by categories",
  );
}
// Filters sheet (accounts, categories, types, tags, comment).
export function filters() {
  let f = deepClone(uiState.filters);
  const count = (v, one, other) => (v ? translateCount(one, other, v.length) : null);
  const typeNames = { expense: "Expenses", income: "Incomes", transfer: "Transfers" };
  openSheet(
    () =>
      `<h2 class="filters-title">Filters</h2><p class="filters-note">Archived accounts and categories are included in the selection.</p><div class="filter-fields">${fieldButtonHtml(
        "Accounts",
        count(f.accounts, "{n} account", "{n} accounts") || "All accounts",
        () =>
          filterAccountSelect(f.accounts, (v) => {
            f.accounts = v;
            render();
          }),
      )}${fieldButtonHtml(
        "Categories",
        count(f.categories, "{n} category", "{n} categories") ||
          "All categories (All subcategories)",
        () =>
          filterCategorySelect(f.categories, (v) => {
            f.categories = v;
            render();
          }),
      )}${fieldButtonHtml(
        "Type",
        f.types
          ? f.types.map((t) => translate(typeNames[t])).join(", ")
          : "All types of operations",
        () =>
          multiSelect(
            "Type",
            [
              { id: "expense", name: "Expenses" },
              { id: "income", name: "Incomes" },
              { id: "transfer", name: "Transfers" },
            ],
            f.types,
            (v) => {
              f.types = v;
              render();
            },
          ),
      )}${fieldButtonHtml("Tags", f.tags ? f.tags.map(escapeHtml).join(", ") : "All tags", () =>
        multiSelect(
          "Tags",
          appData.tags.map((x) => ({ id: x, name: x })),
          f.tags,
          (v) => {
            f.tags = v;
            render();
          },
        ),
      )}${fieldButtonHtml("Comment", f.comment ? escapeHtml(f.comment) : "No comment", () =>
        promptText(
          "Comment",
          f.comment,
          (v) => {
            f.comment = v;
            render();
          },
          "Comment",
        ),
      )}</div><div class="filter-main-actions">${buttonHtml(
        "Apply",
        () => {
          uiState.filters = f;
          closeLayers();
          render();
        },
        "primary",
      )}${buttonHtml(
        "Reset all",
        () => {
          f = emptyFilters();
          uiState.filters = deepClone(f);
          closeLayers();
          render();
        },
        "outline",
      )}</div>`,
    "Filters",
  );
}

// Delete all selected operations.
function bulkDeleteOperations() {
  if (!uiState.selected.length) return toast("Select operations");
  confirmAction(
    "Delete selected operations?",
    () => {
      appData.ops = appData.ops.filter((o) => !uiState.selected.includes(o.id));
      uiState.selected = [];
      uiState.selection = false;
      save();
      render();
    },
    true,
    "Delete",
  );
}
// Edit the selected operations at once.
export function bulkEdit() {
  if (!uiState.selected.length) return toast("Select operations");
  const selected = appData.ops.filter((o) => uiState.selected.includes(o.id));
  const d = {
    category: null,
    account: null,
    role: "sender",
    comment: null,
    addTags: [],
    removeTags: [],
    clearTags: false,
    date: null,
  };
  const hasTransfers = selected.some((o) => o.type === "transfer");
  const tagsLabel = () => {
    if (d.clearTags) return translate("Clear all");
    const parts = [...d.addTags.map((t) => "+" + t), ...d.removeTags.map((t) => "−" + t)];
    return parts.length ? parts.join(", ") : "";
  };
  // Row with a title, the chosen value (or "No changes") and a cross that clears it.
  const row = (label, icon, value, open, clear) =>
    `<div class="bulk-row">${buttonHtml(
      `<span class="bulk-label">${iconSvg(icon, 16)} ${translate(label)}</span><span class="bulk-value ${value ? "" : "muted"}">${value ? escapeHtml(value) : translate("No changes")}</span>`,
      open,
      "bulk-field",
    )}${value ? iconButtonHtml("close", "Clear", () => (clear(), render())) : ""}</div>`;
  // Which account of a transfer is replaced.
  const askRole = () =>
    openSheet(
      () =>
        `<h2>${translate("For transfers")}</h2><p>${translate("For transfer operations, which account to replace?")}</p>${buttonHtml(
          "Sender",
          () => {
            d.role = "sender";
            closeLayers();
          },
          "primary",
        )}${buttonHtml(
          "Receiver",
          () => {
            d.role = "receiver";
            closeLayers();
          },
          "primary",
        )}${buttonHtml(
          "Cancel",
          () => {
            d.account = null;
            closeLayers();
          },
          "outline",
        )}`,
      "For transfers",
      "dialog",
    );
  const chooseTags = () => {
    const draft = { add: [...d.addTags], remove: [...d.removeTags], clear: d.clearTags };
    const used = [...new Set(selected.flatMap((o) => o.tags || []))];
    const toggle = (list, tag) =>
      list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];
    const chips = (list, names, onTap) =>
      names
        .map((tag) =>
          buttonHtml(
            escapeHtml(tag),
            () => onTap(tag),
            "tag " + (list.includes(tag) ? "active" : ""),
          ),
        )
        .join("");
    openSheet(
      () =>
        `<h2>${translate("Tags")}</h2><div class="bulk-tags-title">${translate("Add")}</div><div class="tag-cloud">${chips(
          draft.add,
          appData.tags,
          (tag) => {
            draft.add = toggle(draft.add, tag);
            draft.remove = draft.remove.filter((x) => x !== tag);
            draft.clear = false;
            render();
          },
        )}${buttonHtml(
          `${iconSvg("plus", 14)} ${translate("Add")}`,
          () =>
            promptText(
              "New tag",
              "",
              (v) => {
                const name = v.trim();
                if (!name) return toast("Enter a tag");
                if (!appData.tags.includes(name)) appData.tags.push(name);
                draft.add = [...new Set([...draft.add, name])];
                draft.clear = false;
                save();
                render();
              },
              "Tag name",
            ),
          "tag tag-add",
        )}</div><div class="bulk-tags-title">${translate("Remove")}</div><div class="tag-cloud">${chips(
          draft.remove,
          used,
          (tag) => {
            draft.remove = toggle(draft.remove, tag);
            draft.add = draft.add.filter((x) => x !== tag);
            draft.clear = false;
            render();
          },
        )}${buttonHtml(
          `${iconSvg("trash", 14)} ${translate("Clear all")}`,
          () => {
            draft.clear = !draft.clear;
            if (draft.clear) {
              draft.add = [];
              draft.remove = [];
            }
            render();
          },
          "tag tag-clear " + (draft.clear ? "active" : ""),
        )}</div>${buttonHtml(
          "Complete",
          () => {
            d.addTags = draft.add;
            d.removeTags = draft.remove;
            d.clearTags = draft.clear;
            closeLayers();
            render();
          },
          "primary",
        )}`,
      "Tags",
    );
  };
  // Write one comment for all selected operations, or remove their comments with a separate button.
  const chooseComment = () => {
    let text = d.comment || "";
    openSheet(
      () =>
        `<h2>${translate("Comment")}</h2><label><small>${translate("Add a comment")}</small><input aria-label="${escapeHtml(translate("Comment"))}" value="${escapeHtml(text)}" data-input="${registerInput((v) => (text = v))}"></label>${buttonHtml(
          "Complete",
          () => {
            if (!text.trim()) return toast("Enter a comment");
            d.comment = text;
            closeLayers();
            render();
          },
          "primary",
        )}${buttonHtml(
          `${iconSvg("trash", 14)} ${translate("Remove comments")}`,
          () => {
            d.comment = "";
            closeLayers();
            render();
          },
          "outline",
        )}`,
      "Comment",
    );
  };
  const apply = () => {
    const replacements = selected.map((o) => {
      const n = deepClone(o);
      // A balance adjustment has no category and keeps its direction; only the account may change.
      const adjustment = n.type === "adjustment";
      if (d.category && n.type !== "transfer" && !adjustment) {
        n.category = d.category;
        const a = n.from || n.to;
        n.type = categoryById(d.category).type;
        n.from = n.type === "expense" ? a : null;
        n.to = n.type === "income" ? a : null;
      }
      if (d.account) {
        if (n.type === "transfer") n[d.role === "receiver" ? "to" : "from"] = d.account;
        else if (adjustment) n[n.to ? "to" : "from"] = d.account;
        else if (n.type === "income") n.to = d.account;
        else n.from = d.account;
      }
      if (d.date) n.date = d.date;
      if (d.comment !== null) n.comment = d.comment;
      if (d.clearTags) n.tags = [];
      else
        n.tags = [...new Set([...(n.tags || []), ...d.addTags])].filter(
          (x) => !d.removeTags.includes(x),
        );
      if (!adjustment) validateOp(n);
      return n;
    });
    for (const o of replacements) appData.ops[appData.ops.findIndex((x) => x.id === o.id)] = o;
    uiState.selection = false;
    uiState.selected = [];
    save();
    closeLayers();
    toast("Operations updated");
  };
  openSheet(
    () =>
      `<h2>${translate("Bulk edit")}</h2>${row(
        "Category",
        "categories",
        categoryById(d.category)?.name,
        () =>
          categoryPicker(categoryById(d.category)?.type || "expense", d.category, (v) => {
            d.category = v;
            render();
          }),
        () => (d.category = null),
      )}${row(
        "Account",
        "wallet",
        accountById(d.account)?.name,
        () =>
          accountPicker(d.account, (v) => {
            closeLayers();
            d.account = v;
            if (hasTransfers) askRole();
            else render();
          }),
        () => (d.account = null),
      )}${row(
        "Comment",
        "comment",
        d.comment === null ? "" : d.comment || translate("Remove comments"),
        chooseComment,
        () => (d.comment = null),
      )}${row("Tags", "tag", tagsLabel(), chooseTags, () => {
        d.addTags = [];
        d.removeTags = [];
        d.clearTags = false;
      })}${row(
        "Date",
        "calendar",
        d.date ? dateLabel(d.date) : "",
        () =>
          calendar(d.date || TODAY, (v) => {
            d.date = v;
            render();
          }),
        () => (d.date = null),
      )}${buttonHtml(
        "Confirm",
        () =>
          confirmAction(
            "The selected changes will be applied to all selected operations.",
            apply,
            true,
            "Confirm",
          ),
        "primary",
      )}`,
    "Bulk edit",
  );
}
// Text describing a recurrence rule.
export function recurLabel(r) {
  if (!r) return translate("One time");
  const every = {
    Days: ["Every day", "Every {n} days"],
    Weeks: ["Every week", "Every {n} weeks"],
    Months: ["Every month", "Every {n} months"],
    Years: ["Every year", "Every {n} years"],
  }[r.unit];
  const weekdays =
    r.unit === "Weeks" && r.days?.length
      ? " · " + r.days.map((n) => weekdayName(n)).join(", ")
      : "";
  const times =
    r.remaining !== null ? " · " + translateCount("{n} time", "{n} times", r.remaining) : "";
  return (
    (r.every === 1 ? translate(every[0]) : translateCount(every[0], every[1], r.every)) +
    weekdays +
    times
  );
}
// Short weekday name (0 is Sunday) in the interface language.
const weekdayName = (n) =>
  new Date(Date.UTC(2024, 0, 7 + n)).toLocaleDateString(currentLocale(), {
    weekday: "short",
    timeZone: "UTC",
  });
