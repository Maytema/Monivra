/* Operations list, filters, details, bulk actions */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  accountBalance,
  accountById,
  categoryById,
  convertCurrency,
  dateLabel,
  evaluateExpression,
  formatMoney,
  moneySpanHtml,
  parseDate,
  periodBounds,
  toIsoDate,
  totalByType,
  visibleOperations,
} from "../domain/finance.js";
import { deleteOperation, processScheduled, validateOp } from "../domain/operations.js";
import { hero } from "./accounts.js";
import { accountPicker, categoryPicker } from "./categories.js";
import { opTitle, operationStart } from "./operation-editor.js";
import {
  calendar,
  closeLayers,
  confirmAction,
  openSheet,
  optionSheet,
  periodBar,
  promptText,
} from "../ui/kit.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  menuRowHtml,
  registerAction,
  registerInput,
  toast,
  translate,
} from "../ui/primitives.js";

// One row in the operations list.
export function opRow(o, scheduled = false) {
  const a = accountById(o.from || o.to),
    c = categoryById(o.category),
    selected = uiState.selected.includes(o.id);
  return buttonHtml(
    `${uiState.selection ? `<span class="ops-select-icon ${selected ? "is-selected" : ""}">${selected ? iconSvg("check", 25) : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}</span>` : badgeHtml(c || { icon: "transfer", color: "#8694bb" }, true)}<span class="grow"><span class="op-name">${escapeHtml(opTitle(o))}</span><span class="op-account">${iconSvg(a?.icon || "wallet", 18)} ${escapeHtml(a?.name || "")}${o.type === "transfer" ? " → " + escapeHtml(accountById(o.to)?.name || "") : ""}${scheduled ? " · " + escapeHtml(dateLabel(o.date, true)) : ""}</span>${o.comment ? `<span class="op-comment">${escapeHtml(o.comment)}</span>` : ""}${o.tags?.length ? `<span class="op-comment">${o.tags.map(escapeHtml).join(" · ")}</span>` : ""}</span><span class="op-amount ${o.type === "expense" || (o.type === "adjustment" && o.from) ? "neg" : o.type === "income" || (o.type === "adjustment" && o.to) ? "pos" : ""}">${o.type === "adjustment" ? (o.to ? "+" : "−") : ""}${formatMoney(o.amount, a?.currency)}</span>`,
    () => {
      if (uiState.selection) {
        uiState.selected = selected
          ? uiState.selected.filter((x) => x !== o.id)
          : [...uiState.selected, o.id];
        render();
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
// Operations tab.
export function operationsView() {
  const ops = visibleOperations(),
    dates = [...new Set(ops.map((o) => o.date))],
    income = totalByType("income", ops),
    expense = totalByType("expense", ops);
  let opening = periodOpening();
  return (
    (uiState.selection
      ? `<div class="ops-selection-header">${iconButtonHtml("close", "Exit selection", () => {
          uiState.selection = false;
          uiState.selected = [];
          render();
        })}<strong>Selected: ${uiState.selected.length}</strong>${iconButtonHtml(
          "check",
          "Select all",
          () => {
            uiState.selected = uiState.selected.length === ops.length ? [] : ops.map((o) => o.id);
            render();
          },
        )}</div>`
      : hero()) +
    periodBar() +
    `${
      false
        ? `<div class="searchbar"><input aria-label="Search by comments" placeholder="${translate("Search by comments")}" value="${escapeHtml(uiState.filters.comment)}" data-input="${registerInput(
            (v) => {
              uiState.filters.comment = v;
              render();
            },
          )}">${iconButtonHtml("close", "Clear search", () => {
            uiState.filters.comment = "";
            uiState.search = false;
            render();
          })}</div>`
        : ""
    }${filterActive() ? buttonHtml(translate("Filtered data") + " " + iconSvg("filter", 15), filters, "filtered-banner") : ""}<div class="content">${appData.settings.opening && ops.length > 0 && !filterActive() ? `<div class="opening"><span>${translate("Opening balance")}${moneySpanHtml(opening, undefined, false, true)}</span><span>${translate("Closing balance")}${moneySpanHtml(periodClosing(), undefined, false, true)}</span></div>` : ""}${dates
      .map(
        (date) =>
          `<div class="day-head"><span class="day-num">${Number(date.slice(-2))}</span><span class="day-desc">${parseDate(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br>${parseDate(date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</span><span class="day-total">${moneySpanHtml(ops.filter((o) => o.date === date).reduce((s, o) => s + (o.type === "income" ? 1 : o.type === "expense" ? -1 : 0) * convertCurrency(o.amount, accountById(o.from || o.to)?.currency, appData.settings.currency), 0))}</span></div>${ops
            .filter((o) => o.date === date)
            .map((o) => opRow(o))
            .join("")}`,
      )
      .join(
        "",
      )}${!ops.length ? `<div class="empty">${iconSvg("receipt", 46)}<p>${translate("Empty")}</p></div>` : ""}</div>${!uiState.selection ? buttonHtml(iconSvg("plus", 26) + '<span class="mon-fab-label">Add</span>', () => operationsAddMenu(), "fab mon-operations-add", `aria-label="Add operation"`) : ""}${
      uiState.selection
        ? `<div class="operations-selection-actions">${buttonHtml(iconSvg("trash", 21) + " Delete", bulkDeleteOperations, "selection-action")}${buttonHtml(
            iconSvg("calendar", 21) + " Date",
            () => {
              if (!uiState.selected.length) return toast("Select operations");
              calendar(TODAY, (v) => {
                appData.ops
                  .filter((o) => uiState.selected.includes(o.id))
                  .forEach((o) => (o.date = v));
                save();
                render();
              });
            },
            "selection-action",
          )}${buttonHtml(iconSvg("more", 21) + " More", bulkEdit, "selection-action")}</div>`
        : ""
    }`
  );
}

// Chooser opened by the + button on the operations tab.
function operationsAddMenu() {
  // Three primary tabs exactly as the source application. Selection is the
  // only transition into an editor; switching or dismissing never creates one.
  const state = { direction: "expense" };
  const directions = ["income", "expense", "accounts"];
  const choose = (item) => {
    const dir = state.direction;
    closeLayers();
    const accounts = appData.accounts.filter((a) => !a.archived);
    const expense = appData.categories.find(
      (c) => !c.archived && !c.parent && c.type === "expense",
    );
    const income = appData.categories.find((c) => !c.archived && !c.parent && c.type === "income");
    const preferred = accounts.find((a) => a.type === "Regular") || accounts[0];
    if (dir === "expense")
      operationStart({
        type: "expense",
        category: item.id,
        from: preferred?.id,
      });
    else if (dir === "income")
      operationStart({
        type: "income",
        category: item.id,
        to: preferred?.id,
      });
    else
      operationStart({
        type: "transfer",
        from: item.id,
        to: accounts.find((a) => a.id !== item.id)?.id,
      });
  };
  const view = () => {
    const dir = state.direction;
    const items =
      dir === "accounts"
        ? appData.accounts.filter((a) => !a.archived)
        : appData.categories.filter((c) => !c.archived && !c.parent && c.type === dir);
    return `<div class="mon-add-shell" data-add-chooser="1"><h2 class="mon-add-heading">Add an operation</h2><div class="mon-add-tabs">${directions
      .map((id) =>
        buttonHtml(
          id === "income" ? "Incomes" : id === "expense" ? "Expenses" : "Accounts",
          () => {
            state.direction = id;
            render();
          },
          "mon-add-tab " + (dir === id ? "active" : ""),
        ),
      )
      .join(
        "",
      )}</div><div class="mon-add-grid">${items.map((item) => buttonHtml(`${badgeHtml(item)}<span class="mon-add-item-text"><strong>${escapeHtml(item.name)}</strong><small>${formatMoney(dir === "accounts" ? accountBalance(item.id) : appData.ops.filter((o) => o.category === item.id).reduce((n, o) => n + o.amount, 0), item.currency || appData.settings.currency)}</small></span>`, () => choose(item), "mon-add-item")).join("")}</div></div>`;
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
// Editor for balance adjustments.
function adjustmentEditor(source, duplicate = false) {
  const d = deepClone(source),
    originalId = source.id;
  if (duplicate) delete d.id;
  const initialAccount = d.from || d.to;
  const state = {
    account: initialAccount,
    direction: d.to ? "increase" : "decrease",
    amount: d.amount,
    date: d.date,
    comment: d.comment || "",
  };
  function show() {
    const a = accountById(state.account);
    openSheet(
      () => `<h2>${translate(duplicate ? "Duplicate adjustment" : "Edit adjustment")}</h2>
   ${menuRowHtml(
     "Account",
     a ? badgeHtml(a, true) + " " + escapeHtml(a.name) : "Select account",
     () =>
       accountPicker(state.account, (id) => {
         state.account = id;
         render();
       }),
   )}
   ${menuRowHtml(
     "Direction",
     state.direction === "increase" ? "Increase balance (+)" : "Decrease balance (−)",
     () =>
       optionSheet(
         "Direction",
         [
           ["increase", "Increase balance (+)"],
           ["decrease", "Decrease balance (−)"],
         ],
         state.direction,
         (v) => {
           state.direction = v;
           render();
         },
       ),
   )}
   <label><small>${translate("Amount")} (${escapeHtml(a?.currency || appData.settings.currency)})</small><input inputmode="decimal" type="text" aria-label="Adjustment amount" value="${escapeHtml(String(state.amount / 100))}" data-input="${registerInput(
     (v) => {
       try {
         state.amount = evaluateExpression(v);
       } catch (e) {
         state.amount = NaN;
       }
     },
   )}"></label>
   ${menuRowHtml("Date", dateLabel(state.date), () =>
     calendar(state.date, (v) => {
       state.date = v;
       render();
     }),
   )}
   ${menuRowHtml("Comment", escapeHtml(state.comment || "—"), () =>
     promptText("Comment", state.comment, (v) => {
       state.comment = v;
       render();
     }),
   )}
   ${buttonHtml(
     duplicate ? "Create duplicate" : "Save changes",
     () => {
       try {
         if (!accountById(state.account)) throw Error("Select an account");
         if (!Number.isSafeInteger(state.amount) || state.amount <= 0)
           throw Error("Enter an amount greater than zero");
         if (
           !/^\d{4}-\d{2}-\d{2}$/.test(state.date) ||
           toIsoDate(parseDate(state.date)) !== state.date
         )
           throw Error("Choose a valid date");
         const op = {
           ...d,
           type: "adjustment",
           from: state.direction === "decrease" ? state.account : null,
           to: state.direction === "increase" ? state.account : null,
           amount: state.amount,
           date: state.date,
           comment: state.comment,
           tags: Array.isArray(d.tags) ? d.tags : [],
         };
         if (duplicate) op.id = newId();
         else op.id = originalId;
         const i = appData.ops.findIndex((x) => x.id === op.id);
         if (!duplicate && i < 0) throw Error("Original adjustment no longer exists");
         if (i >= 0) appData.ops[i] = op;
         else appData.ops.push(op);
         save();
         uiState.layers = [];
         render();
         toast(duplicate ? "Adjustment duplicated" : "Adjustment updated");
       } catch (e) {
         toast(e.message);
       }
     },
     "primary",
   )}
   ${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
      "Adjustment",
    );
  }
  show();
}
// Details page of a single operation.
export function operationDetails(o, scheduled = false) {
  openSheet(
    () =>
      `<div class="sheet-account">${badgeHtml(categoryById(o.category) || { icon: "transfer", color: "#8694bb" })}<div class="grow"><strong>${escapeHtml(opTitle(o))}</strong><div>${formatMoney(o.amount, accountById(o.from || o.to)?.currency)}</div></div>${iconButtonHtml("edit", "Edit", () => operationStart(o, scheduled))}</div><p>${escapeHtml(dateLabel(o.date))}</p><p>${escapeHtml(accountById(o.from || o.to)?.name || "")}${o.type === "transfer" ? " → " + escapeHtml(accountById(o.to)?.name || "") : ""}</p>${o.comment ? `<p>${escapeHtml(o.comment)}</p>` : ""}${o.photo ? `<img class="preview-photo" src="${o.photo}" alt="Attached photo">` : ""}${
        scheduled
          ? `<p>${recurLabel(o.recur)}</p><div class="action-grid two">${buttonHtml(
              iconSvg("plus") + translate("Add now"),
              () =>
                confirmAction(
                  "Add this scheduled payment now?",
                  () => {
                    processScheduled(o.id, true);
                    uiState.layers = [];
                    render();
                  },
                  false,
                  "Add now",
                ),
            )}${buttonHtml(iconSvg("right") + translate("Skip"), () =>
              confirmAction(
                "Skip this occurrence?",
                () => {
                  processScheduled(o.id, false);
                  uiState.layers = [];
                  render();
                },
                false,
                "Skip",
              ),
            )}</div>${menuRowHtml("Date", "calendar", () =>
              calendar(o.date, (v) => {
                o.date = v;
                save();
                render();
              }),
            )}`
          : ""
      }${
        menuRowHtml("Edit", "edit", () => operationStart(o, scheduled)) +
        menuRowHtml("Duplicate", "copy", () => {
          let d = deepClone(o);
          delete d.id;
          operationStart(d, scheduled);
        })
      }${menuRowHtml("Delete", "trash", () =>
        confirmAction(
          "Delete this operation?",
          () => {
            deleteOperation(o.id, scheduled);
            uiState.layers = [];
            render();
          },
          true,
          "Delete",
        ),
      )}`,
    opTitle(o),
  );
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
  const groups = [
    ["Accounts", (a) => a.type === "Regular"],
    ["Savings", (a) => a.type === "Savings"],
    ["I owe", (a) => a.type === "Debt" && a.debtType !== "oweMe" && a.debtType !== "Owe me"],
    ["Owe me", (a) => a.type === "Debt" && (a.debtType === "oweMe" || a.debtType === "Owe me")],
  ];
  const checked = (ids) => ids.length > 0 && ids.every((id) => values.has(id));
  const expanded = new Set(groups.map((g) => g[0]));
  openSheet(
    () =>
      `<div class="mon-filter-picker-head"><h2>Accounts</h2><span>${values.size} selected</span></div><div class="mon-filter-scroll">${groups
        .map(([name, predicate]) => {
          const items = appData.accounts.filter(predicate),
            ids = items.map((a) => a.id);
          if (!items.length) return "";
          return `<div class="mon-filter-group"><div class="mon-filter-group-head"><button type="button" class="mon-filter-group-check" aria-label="Toggle all ${name}" data-action="${registerAction(
            () => {
              const on = checked(ids);
              ids.forEach((id) => (on ? values.delete(id) : values.add(id)));
              render();
            },
          )}"><span class="mon-check ${checked(ids) ? "on" : ""}">${checked(ids) ? "✓" : ""}</span></button><button type="button" class="mon-filter-group-toggle" data-action="${registerAction(
            () => {
              expanded.has(name) ? expanded.delete(name) : expanded.add(name);
              render();
            },
          )}">${iconSvg(expanded.has(name) ? "down" : "right", 18)} <strong>${name}</strong><small>${ids.filter((id) => values.has(id)).length}/${ids.length}</small></button></div>${
            expanded.has(name)
              ? items
                  .map(
                    (a) =>
                      `<button class="mon-filter-choice" data-action="${registerAction(() => {
                        values.has(a.id) ? values.delete(a.id) : values.add(a.id);
                        render();
                      })}"><span class="mon-check ${values.has(a.id) ? "on" : ""}">${values.has(a.id) ? "✓" : ""}</span>${badgeHtml(a, true)}<span>${escapeHtml(a.name)}</span></button>`,
                  )
                  .join("")
              : ""
          }</div>`;
        })
        .join(
          "",
        )}</div><div class="mon-filter-footer">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
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
  const partial = (group) => group.some((id) => values.has(id)) && !checked(group);
  const toggle = (group) => {
    const on = checked(group);
    group.forEach((id) => (on ? values.delete(id) : values.add(id)));
    render();
  };
  openSheet(
    () =>
      `<div class="mon-filter-picker-head"><h2>Filter by categories</h2></div><div class="mon-filter-scroll mon-filter-category-tree">${[
        "expense",
        "income",
      ]
        .map((type) => {
          const group = appData.categories.filter((c) => c.type === type),
            groupIds = group.map((c) => c.id);
          return `<div class="mon-filter-group"><div class="mon-filter-group-head"><button class="mon-filter-expand" aria-label="Expand ${type}" data-action="${registerAction(
            () => {
              expanded.has(type) ? expanded.delete(type) : expanded.add(type);
              render();
            },
          )}">${iconSvg(expanded.has(type) ? "down" : "right", 19)}</button><strong>${type === "expense" ? "Expenses" : "Incomes"}</strong><button class="mon-filter-check-action" aria-label="Select ${type}" data-action="${registerAction(() => toggle(groupIds))}"><span class="mon-check ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${
            expanded.has(type)
              ? group
                  .filter((c) => !c.parent)
                  .map((c) => {
                    const children = group.filter((x) => x.parent === c.id),
                      groupIds = [c.id, ...children.map((x) => x.id)],
                      open = parentExpanded.has(c.id);
                    return `<div class="mon-filter-parent-row">${
                      children.length
                        ? `<button class="mon-filter-expand" aria-label="Expand ${escapeHtml(c.name)}" data-action="${registerAction(
                            () => {
                              open ? parentExpanded.delete(c.id) : parentExpanded.add(c.id);
                              render();
                            },
                          )}">${iconSvg(open ? "down" : "right", 18)}</button>`
                        : '<span class="mon-filter-expand-placeholder"></span>'
                    }${badgeHtml(c, true)}<span class="mon-filter-label">${escapeHtml(c.name)}</span><button class="mon-filter-check-action" aria-label="Select ${escapeHtml(c.name)}" data-action="${registerAction(() => toggle(groupIds))}"><span class="mon-check ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${open && children.length ? `<div class="mon-filter-subcategories">${children.map((x) => `<div class="mon-filter-child-row"><span class="mon-filter-label">${escapeHtml(x.name)}</span><button class="mon-filter-check-action" aria-label="Select ${escapeHtml(x.name)}" data-action="${registerAction(() => toggle([x.id]))}"><span class="mon-check ${values.has(x.id) ? "on" : ""}">${values.has(x.id) ? "✓" : ""}</span></button></div>`).join("")}</div>` : ""}`;
                  })
                  .join("")
              : ""
          }</div>`;
        })
        .join(
          "",
        )}</div><div class="mon-filter-footer">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
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
  const count = (v, all) => (v ? `${v.length} ${all}` : null);
  openSheet(
    () =>
      `<h2 class="mon-filters-title">Filters</h2><p class="mon-filters-note">Archived accounts and categories are included in the selection.</p><div class="mon-filter-fields">${fieldButtonHtml(
        "Accounts",
        count(f.accounts, "accounts") || "All accounts",
        () =>
          filterAccountSelect(f.accounts, (v) => {
            f.accounts = v;
            render();
          }),
      )}${fieldButtonHtml(
        "Categories",
        count(f.categories, "categories") || "All categories (All subcategories)",
        () =>
          filterCategorySelect(f.categories, (v) => {
            f.categories = v;
            render();
          }),
      )}${fieldButtonHtml(
        "Type",
        f.types ? f.types.map(escapeHtml).join(", ") : "All types of operations",
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
      )}</div><div class="mon-filter-main-actions">${buttonHtml(
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
          f = {
            accounts: null,
            categories: null,
            types: null,
            tags: null,
            comment: "",
          };
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
  let d = {
    account: null,
    role: "sender",
    category: null,
    date: null,
    comment: null,
    tagMode: null,
    tagNames: [],
  };
  const hasTransfers = selected.some((o) => o.type === "transfer");
  const tagsLabel = () =>
    d.tagMode === null
      ? translate("No changes")
      : d.tagMode === "clear"
        ? "Clear all"
        : (d.tagMode === "add" ? "Add: " : "Remove: ") + (d.tagNames.join(", ") || "Select tags");
  const chooseTags = () => {
    let mode = d.tagMode || "add",
      chosen = [...d.tagNames],
      query = "";
    const allTags = [...new Set([...appData.tags, ...selected.flatMap((o) => o.tags || [])])];
    openSheet(
      () =>
        `<h2>Tags</h2><div class="tabs">${[
          ["add", "Add"],
          ["remove", "Remove"],
          ["clear", "Clear all"],
        ]
          .map(([v, label]) =>
            buttonHtml(
              label,
              () => {
                mode = v;
                render();
              },
              mode === v ? "active" : "",
            ),
          )
          .join("")}</div>${
          mode === "clear"
            ? '<p class="footnote">Remove all tags from selected operations</p>'
            : `<div class="tag-cloud">${allTags
                .map((tag) =>
                  buttonHtml(
                    escapeHtml(tag) + (chosen.includes(tag) ? " " + iconSvg("check", 15) : ""),
                    () => {
                      chosen = chosen.includes(tag)
                        ? chosen.filter((x) => x !== tag)
                        : [...chosen, tag];
                      render();
                    },
                    "tag " + (chosen.includes(tag) ? "active" : ""),
                  ),
                )
                .join("")}</div>`
        }${buttonHtml(
          "Complete",
          () => {
            if (mode !== "clear" && !chosen.length) return toast("Select tags");
            d.tagMode = mode;
            d.tagNames = mode === "clear" ? [] : [...chosen];
            closeLayers();
            render();
          },
          "primary",
        )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
      "Tags",
    );
  };
  openSheet(
    () =>
      `<h2>${translate("Bulk edit")}</h2>${fieldButtonHtml(
        "Account",
        escapeHtml(accountById(d.account)?.name || translate("No changes")),
        () =>
          accountPicker(d.account, (v) => {
            d.account = v;
            render();
          }),
      )}${
        hasTransfers
          ? fieldButtonHtml("Transfer account", d.role === "sender" ? "Sender" : "Receiver", () =>
              openSheet(
                () =>
                  `<h2>Transfer account</h2>${menuRowHtml("Sender", "left", () => {
                    d.role = "sender";
                    closeLayers();
                    render();
                  })}${menuRowHtml("Receiver", "right", () => {
                    d.role = "receiver";
                    closeLayers();
                    render();
                  })}`,
                "Transfer account",
              ),
            )
          : ""
      }${fieldButtonHtml(
        "Category",
        escapeHtml(categoryById(d.category)?.name || translate("No changes")),
        () =>
          categoryPicker("expense", d.category, (v) => {
            d.category = v;
            render();
          }),
      )}${fieldButtonHtml("Tags", escapeHtml(tagsLabel()), chooseTags)}${fieldButtonHtml(
        "Date",
        d.date || translate("No changes"),
        () =>
          calendar(d.date || TODAY, (v) => {
            d.date = v;
            render();
          }),
      )}${fieldButtonHtml(
        "Comment",
        d.comment === null ? translate("No changes") : escapeHtml(d.comment),
        () =>
          promptText(
            "Comment",
            d.comment || "",
            (v) => {
              d.comment = v;
              render();
            },
            "Comment",
          ),
      )}${buttonHtml(
        "Confirm",
        () => {
          try {
            const replacements = selected.map((o) => {
              const n = deepClone(o);
              if (d.category && n.type !== "transfer") {
                n.category = d.category;
                const a = n.from || n.to;
                n.type = categoryById(d.category).type;
                n.from = n.type === "expense" ? a : null;
                n.to = n.type === "income" ? a : null;
              }
              if (d.account) {
                if (n.type === "transfer") n[d.role === "receiver" ? "to" : "from"] = d.account;
                else if (n.type === "income") n.to = d.account;
                else n.from = d.account;
              }
              if (d.date) n.date = d.date;
              if (d.comment !== null) n.comment = d.comment;
              if (d.tagMode) {
                const old = [...(n.tags || [])];
                n.tags =
                  d.tagMode === "clear"
                    ? []
                    : d.tagMode === "add"
                      ? [...new Set([...old, ...d.tagNames])]
                      : old.filter((x) => !d.tagNames.includes(x));
              }
              validateOp(n);
              return n;
            });
            for (const o of replacements)
              appData.ops[appData.ops.findIndex((x) => x.id === o.id)] = o;
            uiState.selection = false;
            uiState.selected = [];
            save();
            closeLayers();
            toast("Operations updated");
          } catch (e) {
            toast(e.message);
          }
        },
        "primary",
      )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    "Bulk edit",
  );
}
// Text describing a recurrence rule.
export function recurLabel(r) {
  return r
    ? `Every ${r.every} ${r.unit.toLowerCase()}${r.unit === "Weeks" && r.days?.length ? " · " + r.days.map((n) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n]).join(", ") : ""}${r.remaining !== null ? " · " + r.remaining + " times" : ""}`
    : translate("One time");
}
