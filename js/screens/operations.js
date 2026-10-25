/* Operations list, filters, details, bulk actions */
import { render } from "../app/shell.js";
import { I, TODAY, clone, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  acc,
  bal,
  bounds,
  calculate,
  cat,
  convert,
  dateLabel,
  dateObj,
  iso,
  money,
  moneySpan,
  totalType,
  visibleOps,
} from "../domain/finance.js";
import { deleteOperation, processScheduled, validateOp } from "../domain/operations.js";
import { hero } from "./accounts.js";
import { accountPicker, categoryPicker } from "./categories.js";
import { opTitle, operationStart } from "./operation-editor.js";
import {
  calendar,
  close,
  confirmAction,
  optionSheet,
  periodBar,
  promptText,
  sheet,
} from "../ui/kit.js";
import { B, IB, act, badge, field, inp, row, t, toast } from "../ui/primitives.js";

export function opRow(o, scheduled = false) {
  const a = acc(o.from || o.to),
    c = cat(o.category),
    selected = U.selected.includes(o.id);
  return B(
    `${U.selection ? `<span class="ops-select-icon ${selected ? "is-selected" : ""}">${selected ? I("check", 25) : badge(c || { icon: "transfer", color: "#8694bb" }, true)}</span>` : badge(c || { icon: "transfer", color: "#8694bb" }, true)}<span class="grow"><span class="op-name">${esc(opTitle(o))}</span><span class="op-account">${I(a?.icon || "wallet", 18)} ${esc(a?.name || "")}${o.type === "transfer" ? " → " + esc(acc(o.to)?.name || "") : ""}${scheduled ? " · " + esc(dateLabel(o.date, true)) : ""}</span>${o.comment ? `<span class="op-comment">${esc(o.comment)}</span>` : ""}${o.tags?.length ? `<span class="op-comment">${o.tags.map(esc).join(" · ")}</span>` : ""}</span><span class="op-amount ${o.type === "expense" || (o.type === "adjustment" && o.from) ? "neg" : o.type === "income" || (o.type === "adjustment" && o.to) ? "pos" : ""}">${o.type === "adjustment" ? (o.to ? "+" : "−") : ""}${money(o.amount, a?.currency)}</span>`,
    () => {
      if (U.selection) {
        U.selected = selected ? U.selected.filter((x) => x !== o.id) : [...U.selected, o.id];
        render();
      } else operationStart(o, scheduled);
    },
    "op-row " + (selected ? "selected" : ""),
    `data-operation="${esc(o.id)}"`,
  );
}
export function filterActive() {
  const f = U.filters;
  return !!(f.accounts || f.categories || f.types || f.tags || f.comment);
}
function balanceAt(date, exclusive = false) {
  return D.accounts
    .filter(
      (a) => a.include && !a.archived && (!U.filters.accounts || U.filters.accounts.includes(a.id)),
    )
    .reduce(
      (sum, a) =>
        sum +
        convert(
          a.opening +
            D.ops
              .filter((o) => (exclusive ? o.date < date : o.date <= date))
              .reduce(
                (n, o) =>
                  n +
                  (o.to === a.id ? (o.receive ?? o.amount) : 0) -
                  (o.from === a.id ? o.amount : 0),
                0,
              ),
          a.currency,
          D.settings.currency,
        ),
      0,
    );
}
function periodOpening() {
  return balanceAt(bounds()[0], true);
}
function periodClosing() {
  return balanceAt(bounds()[1]);
}
export function operationsView() {
  const ops = visibleOps(),
    dates = [...new Set(ops.map((o) => o.date))],
    income = totalType("income", ops),
    expense = totalType("expense", ops);
  let opening = periodOpening();
  return (
    (U.selection
      ? `<div class="ops-selection-header">${IB("close", "Exit selection", () => {
          U.selection = false;
          U.selected = [];
          render();
        })}<strong>Selected: ${U.selected.length}</strong>${IB("check", "Select all", () => {
          U.selected = U.selected.length === ops.length ? [] : ops.map((o) => o.id);
          render();
        })}</div>`
      : hero()) +
    periodBar() +
    `${
      false
        ? `<div class="searchbar"><input aria-label="Search by comments" placeholder="${t("Search by comments")}" value="${esc(U.filters.comment)}" data-input="${inp(
            (v) => {
              U.filters.comment = v;
              render();
            },
          )}">${IB("close", "Clear search", () => {
            U.filters.comment = "";
            U.search = false;
            render();
          })}</div>`
        : ""
    }${filterActive() ? B(t("Filtered data") + " " + I("filter", 15), filters, "filtered-banner") : ""}<div class="content">${D.settings.opening && ops.length > 0 && !filterActive() ? `<div class="opening"><span>${t("Opening balance")}${moneySpan(opening, undefined, false, true)}</span><span>${t("Closing balance")}${moneySpan(periodClosing(), undefined, false, true)}</span></div>` : ""}${dates
      .map(
        (date) =>
          `<div class="day-head"><span class="day-num">${Number(date.slice(-2))}</span><span class="day-desc">${dateObj(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br>${dateObj(date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</span><span class="day-total">${moneySpan(ops.filter((o) => o.date === date).reduce((s, o) => s + (o.type === "income" ? 1 : o.type === "expense" ? -1 : 0) * convert(o.amount, acc(o.from || o.to)?.currency, D.settings.currency), 0))}</span></div>${ops
            .filter((o) => o.date === date)
            .map((o) => opRow(o))
            .join("")}`,
      )
      .join(
        "",
      )}${!ops.length ? `<div class="empty">${I("receipt", 46)}<p>${t("Empty")}</p></div>` : ""}</div>${!U.selection ? B(I("plus", 26) + '<span class="mon-fab-label">Add</span>', () => operationsAddMenu(), "fab mon-operations-add", `aria-label="Add operation"`) : ""}${
      U.selection
        ? `<div class="operations-selection-actions">${B(I("trash", 21) + " Delete", bulkDeleteOperations, "selection-action")}${B(
            I("calendar", 21) + " Date",
            () => {
              if (!U.selected.length) return toast("Select operations");
              calendar(TODAY, (v) => {
                D.ops.filter((o) => U.selected.includes(o.id)).forEach((o) => (o.date = v));
                save();
                render();
              });
            },
            "selection-action",
          )}${B(I("more", 21) + " More", bulkEdit, "selection-action")}</div>`
        : ""
    }`
  );
}

function operationsAddMenu() {
  // Three primary tabs exactly as the source application. Selection is the
  // only transition into an editor; switching or dismissing never creates one.
  const state = { direction: "expense" };
  const directions = ["income", "expense", "accounts"];
  const choose = (item) => {
    const dir = state.direction;
    close();
    const accounts = D.accounts.filter((a) => !a.archived);
    const expense = D.categories.find((c) => !c.archived && !c.parent && c.type === "expense");
    const income = D.categories.find((c) => !c.archived && !c.parent && c.type === "income");
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
        ? D.accounts.filter((a) => !a.archived)
        : D.categories.filter((c) => !c.archived && !c.parent && c.type === dir);
    return `<div class="mon-add-shell" data-add-chooser="1"><h2 class="mon-add-heading">Add an operation</h2><div class="mon-add-tabs">${directions
      .map((id) =>
        B(
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
      )}</div><div class="mon-add-grid">${items.map((item) => B(`${badge(item)}<span class="mon-add-item-text"><strong>${esc(item.name)}</strong><small>${money(dir === "accounts" ? bal(item.id) : D.ops.filter((o) => o.category === item.id).reduce((n, o) => n + o.amount, 0), item.currency || D.settings.currency)}</small></span>`, () => choose(item), "mon-add-item")).join("")}</div></div>`;
  };
  sheet(view, "Add an operation");
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

export function operationsMenu() {
  U.search = !U.search;
  if (!U.search) U.filters.comment = "";
  render();
}
function adjustmentEditor(source, duplicate = false) {
  const d = clone(source),
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
    const a = acc(state.account);
    sheet(
      () => `<h2>${t(duplicate ? "Duplicate adjustment" : "Edit adjustment")}</h2>
   ${row("Account", a ? badge(a, true) + " " + esc(a.name) : "Select account", () =>
     accountPicker(state.account, (id) => {
       state.account = id;
       render();
     }),
   )}
   ${row(
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
   <label><small>${t("Amount")} (${esc(a?.currency || D.settings.currency)})</small><input inputmode="decimal" type="text" aria-label="Adjustment amount" value="${esc(String(state.amount / 100))}" data-input="${inp(
     (v) => {
       try {
         state.amount = calculate(v);
       } catch (e) {
         state.amount = NaN;
       }
     },
   )}"></label>
   ${row("Date", dateLabel(state.date), () =>
     calendar(state.date, (v) => {
       state.date = v;
       render();
     }),
   )}
   ${row("Comment", esc(state.comment || "—"), () =>
     promptText("Comment", state.comment, (v) => {
       state.comment = v;
       render();
     }),
   )}
   ${B(
     duplicate ? "Create duplicate" : "Save changes",
     () => {
       try {
         if (!acc(state.account)) throw Error("Select an account");
         if (!Number.isSafeInteger(state.amount) || state.amount <= 0)
           throw Error("Enter an amount greater than zero");
         if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || iso(dateObj(state.date)) !== state.date)
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
         if (duplicate) op.id = uid();
         else op.id = originalId;
         const i = D.ops.findIndex((x) => x.id === op.id);
         if (!duplicate && i < 0) throw Error("Original adjustment no longer exists");
         if (i >= 0) D.ops[i] = op;
         else D.ops.push(op);
         save();
         U.layers = [];
         render();
         toast(duplicate ? "Adjustment duplicated" : "Adjustment updated");
       } catch (e) {
         toast(e.message);
       }
     },
     "primary",
   )}
   ${B("Cancel", () => close(), "outline")}`,
      "Adjustment",
    );
  }
  show();
}
export function operationDetails(o, scheduled = false) {
  sheet(
    () =>
      `<div class="sheet-account">${badge(cat(o.category) || { icon: "transfer", color: "#8694bb" })}<div class="grow"><strong>${esc(opTitle(o))}</strong><div>${money(o.amount, acc(o.from || o.to)?.currency)}</div></div>${IB("edit", "Edit", () => operationStart(o, scheduled))}</div><p>${esc(dateLabel(o.date))}</p><p>${esc(acc(o.from || o.to)?.name || "")}${o.type === "transfer" ? " → " + esc(acc(o.to)?.name || "") : ""}</p>${o.comment ? `<p>${esc(o.comment)}</p>` : ""}${o.photo ? `<img class="preview-photo" src="${o.photo}" alt="Attached photo">` : ""}${
        scheduled
          ? `<p>${recurLabel(o.recur)}</p><div class="action-grid two">${B(
              I("plus") + t("Add now"),
              () =>
                confirmAction(
                  "Add this scheduled payment now?",
                  () => {
                    processScheduled(o.id, true);
                    U.layers = [];
                    render();
                  },
                  false,
                  "Add now",
                ),
            )}${B(I("right") + t("Skip"), () =>
              confirmAction(
                "Skip this occurrence?",
                () => {
                  processScheduled(o.id, false);
                  U.layers = [];
                  render();
                },
                false,
                "Skip",
              ),
            )}</div>${row("Date", "calendar", () =>
              calendar(o.date, (v) => {
                o.date = v;
                save();
                render();
              }),
            )}`
          : ""
      }${
        row("Edit", "edit", () => operationStart(o, scheduled)) +
        row("Duplicate", "copy", () => {
          let d = clone(o);
          delete d.id;
          operationStart(d, scheduled);
        })
      }${row("Delete", "trash", () =>
        confirmAction(
          "Delete this operation?",
          () => {
            deleteOperation(o.id, scheduled);
            U.layers = [];
            render();
          },
          true,
          "Delete",
        ),
      )}`,
    opTitle(o),
  );
}
export function multiSelect(title, items, selected, fn) {
  let values = selected ? new Set(selected) : new Set(items.map((i) => i.id));
  sheet(
    () =>
      `<h2>${t(title)}</h2><div class="toolbar">${B(
        "Select all",
        () => {
          values = new Set(items.map((i) => i.id));
          render();
        },
        "text-button",
      )}${B(
        "Clear",
        () => {
          values.clear();
          render();
        },
        "text-button",
      )}</div>${items
        .map((i) =>
          B(
            `<input type="checkbox" tabindex="-1" ${values.has(i.id) ? "checked" : ""} aria-label="${esc(i.name)}"><span>${esc(i.name)}</span>`,
            () => {
              values.has(i.id) ? values.delete(i.id) : values.add(i.id);
              render();
            },
            "checkrow",
          ),
        )
        .join("")}${B(
        "Apply",
        () => {
          close();
          fn(values.size === items.length ? null : [...values]);
        },
        "primary",
      )}${B("Cancel", () => close(), "outline")}`,
    title,
  );
}
function filterAccountSelect(selected, done) {
  let values = selected ? new Set(selected) : new Set(D.accounts.map((a) => a.id));
  const groups = [
    ["Accounts", (a) => a.type === "Regular"],
    ["Savings", (a) => a.type === "Savings"],
    ["I owe", (a) => a.type === "Debt" && a.debtType !== "oweMe" && a.debtType !== "Owe me"],
    ["Owe me", (a) => a.type === "Debt" && (a.debtType === "oweMe" || a.debtType === "Owe me")],
  ];
  const checked = (ids) => ids.length > 0 && ids.every((id) => values.has(id));
  const expanded = new Set(groups.map((g) => g[0]));
  sheet(
    () =>
      `<div class="mon-filter-picker-head"><h2>Accounts</h2><span>${values.size} selected</span></div><div class="mon-filter-scroll">${groups
        .map(([name, predicate]) => {
          const items = D.accounts.filter(predicate),
            ids = items.map((a) => a.id);
          if (!items.length) return "";
          return `<div class="mon-filter-group"><div class="mon-filter-group-head"><button type="button" class="mon-filter-group-check" aria-label="Toggle all ${name}" data-action="${act(
            () => {
              const on = checked(ids);
              ids.forEach((id) => (on ? values.delete(id) : values.add(id)));
              render();
            },
          )}"><span class="mon-check ${checked(ids) ? "on" : ""}">${checked(ids) ? "✓" : ""}</span></button><button type="button" class="mon-filter-group-toggle" data-action="${act(
            () => {
              expanded.has(name) ? expanded.delete(name) : expanded.add(name);
              render();
            },
          )}">${I(expanded.has(name) ? "down" : "right", 18)} <strong>${name}</strong><small>${ids.filter((id) => values.has(id)).length}/${ids.length}</small></button></div>${
            expanded.has(name)
              ? items
                  .map(
                    (a) =>
                      `<button class="mon-filter-choice" data-action="${act(() => {
                        values.has(a.id) ? values.delete(a.id) : values.add(a.id);
                        render();
                      })}"><span class="mon-check ${values.has(a.id) ? "on" : ""}">${values.has(a.id) ? "✓" : ""}</span>${badge(a, true)}<span>${esc(a.name)}</span></button>`,
                  )
                  .join("")
              : ""
          }</div>`;
        })
        .join("")}</div><div class="mon-filter-footer">${B("Cancel", () => close(), "outline")}${B(
        "Confirm",
        () => {
          close();
          done(values.size === D.accounts.length ? null : [...values]);
        },
        "primary",
      )}</div>`,
    "Accounts",
  );
}
function filterCategorySelect(selected, done) {
  let values = selected ? new Set(selected) : new Set(D.categories.map((c) => c.id));
  const ids = D.categories.map((c) => c.id),
    expanded = new Set(["expense", "income"]);
  const parentExpanded = new Set(D.categories.filter((c) => !c.parent).map((c) => c.id));
  const checked = (group) => group.length > 0 && group.every((id) => values.has(id));
  const partial = (group) => group.some((id) => values.has(id)) && !checked(group);
  const toggle = (group) => {
    const on = checked(group);
    group.forEach((id) => (on ? values.delete(id) : values.add(id)));
    render();
  };
  sheet(
    () =>
      `<div class="mon-filter-picker-head"><h2>Filter by categories</h2></div><div class="mon-filter-scroll mon-filter-category-tree">${[
        "expense",
        "income",
      ]
        .map((type) => {
          const group = D.categories.filter((c) => c.type === type),
            groupIds = group.map((c) => c.id);
          return `<div class="mon-filter-group"><div class="mon-filter-group-head"><button class="mon-filter-expand" aria-label="Expand ${type}" data-action="${act(
            () => {
              expanded.has(type) ? expanded.delete(type) : expanded.add(type);
              render();
            },
          )}">${I(expanded.has(type) ? "down" : "right", 19)}</button><strong>${type === "expense" ? "Expenses" : "Incomes"}</strong><button class="mon-filter-check-action" aria-label="Select ${type}" data-action="${act(() => toggle(groupIds))}"><span class="mon-check ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${
            expanded.has(type)
              ? group
                  .filter((c) => !c.parent)
                  .map((c) => {
                    const children = group.filter((x) => x.parent === c.id),
                      groupIds = [c.id, ...children.map((x) => x.id)],
                      open = parentExpanded.has(c.id);
                    return `<div class="mon-filter-parent-row">${
                      children.length
                        ? `<button class="mon-filter-expand" aria-label="Expand ${esc(c.name)}" data-action="${act(
                            () => {
                              open ? parentExpanded.delete(c.id) : parentExpanded.add(c.id);
                              render();
                            },
                          )}">${I(open ? "down" : "right", 18)}</button>`
                        : '<span class="mon-filter-expand-placeholder"></span>'
                    }${badge(c, true)}<span class="mon-filter-label">${esc(c.name)}</span><button class="mon-filter-check-action" aria-label="Select ${esc(c.name)}" data-action="${act(() => toggle(groupIds))}"><span class="mon-check ${checked(groupIds) ? "on" : ""}">${checked(groupIds) ? "✓" : ""}</span></button></div>${open && children.length ? `<div class="mon-filter-subcategories">${children.map((x) => `<div class="mon-filter-child-row"><span class="mon-filter-label">${esc(x.name)}</span><button class="mon-filter-check-action" aria-label="Select ${esc(x.name)}" data-action="${act(() => toggle([x.id]))}"><span class="mon-check ${values.has(x.id) ? "on" : ""}">${values.has(x.id) ? "✓" : ""}</span></button></div>`).join("")}</div>` : ""}`;
                  })
                  .join("")
              : ""
          }</div>`;
        })
        .join("")}</div><div class="mon-filter-footer">${B("Cancel", () => close(), "outline")}${B(
        "Confirm",
        () => {
          close();
          done(values.size === ids.length ? null : [...values]);
        },
        "primary",
      )}</div>`,
    "Filter by categories",
  );
}
export function filters() {
  let f = clone(U.filters);
  const count = (v, all) => (v ? `${v.length} ${all}` : null);
  sheet(
    () =>
      `<h2 class="mon-filters-title">Filters</h2><p class="mon-filters-note">Archived accounts and categories are included in the selection.</p><div class="mon-filter-fields">${field(
        "Accounts",
        count(f.accounts, "accounts") || "All accounts",
        () =>
          filterAccountSelect(f.accounts, (v) => {
            f.accounts = v;
            render();
          }),
      )}${field(
        "Categories",
        count(f.categories, "categories") || "All categories (All subcategories)",
        () =>
          filterCategorySelect(f.categories, (v) => {
            f.categories = v;
            render();
          }),
      )}${field("Type", f.types ? f.types.map(esc).join(", ") : "All types of operations", () =>
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
      )}${field("Tags", f.tags ? f.tags.map(esc).join(", ") : "All tags", () =>
        multiSelect(
          "Tags",
          D.tags.map((x) => ({ id: x, name: x })),
          f.tags,
          (v) => {
            f.tags = v;
            render();
          },
        ),
      )}${field("Comment", f.comment ? esc(f.comment) : "No comment", () =>
        promptText(
          "Comment",
          f.comment,
          (v) => {
            f.comment = v;
            render();
          },
          "Comment",
        ),
      )}</div><div class="mon-filter-main-actions">${B(
        "Apply",
        () => {
          U.filters = f;
          close();
          render();
        },
        "primary",
      )}${B(
        "Reset all",
        () => {
          f = {
            accounts: null,
            categories: null,
            types: null,
            tags: null,
            comment: "",
          };
          U.filters = clone(f);
          close();
          render();
        },
        "outline",
      )}</div>`,
    "Filters",
  );
}

function bulkDeleteOperations() {
  if (!U.selected.length) return toast("Select operations");
  confirmAction(
    "Delete selected operations?",
    () => {
      D.ops = D.ops.filter((o) => !U.selected.includes(o.id));
      U.selected = [];
      U.selection = false;
      save();
      render();
    },
    true,
    "Delete",
  );
}
export function bulkEdit() {
  if (!U.selected.length) return toast("Select operations");
  const selected = D.ops.filter((o) => U.selected.includes(o.id));
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
      ? t("No changes")
      : d.tagMode === "clear"
        ? "Clear all"
        : (d.tagMode === "add" ? "Add: " : "Remove: ") + (d.tagNames.join(", ") || "Select tags");
  const chooseTags = () => {
    let mode = d.tagMode || "add",
      chosen = [...d.tagNames],
      query = "";
    const allTags = [...new Set([...D.tags, ...selected.flatMap((o) => o.tags || [])])];
    sheet(
      () =>
        `<h2>Tags</h2><div class="tabs">${[
          ["add", "Add"],
          ["remove", "Remove"],
          ["clear", "Clear all"],
        ]
          .map(([v, label]) =>
            B(
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
                  B(
                    esc(tag) + (chosen.includes(tag) ? " " + I("check", 15) : ""),
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
        }${B(
          "Complete",
          () => {
            if (mode !== "clear" && !chosen.length) return toast("Select tags");
            d.tagMode = mode;
            d.tagNames = mode === "clear" ? [] : [...chosen];
            close();
            render();
          },
          "primary",
        )}${B("Cancel", () => close(), "outline")}`,
      "Tags",
    );
  };
  sheet(
    () =>
      `<h2>${t("Bulk edit")}</h2>${field(
        "Account",
        esc(acc(d.account)?.name || t("No changes")),
        () =>
          accountPicker(d.account, (v) => {
            d.account = v;
            render();
          }),
      )}${
        hasTransfers
          ? field("Transfer account", d.role === "sender" ? "Sender" : "Receiver", () =>
              sheet(
                () =>
                  `<h2>Transfer account</h2>${row("Sender", "left", () => {
                    d.role = "sender";
                    close();
                    render();
                  })}${row("Receiver", "right", () => {
                    d.role = "receiver";
                    close();
                    render();
                  })}`,
                "Transfer account",
              ),
            )
          : ""
      }${field("Category", esc(cat(d.category)?.name || t("No changes")), () =>
        categoryPicker("expense", d.category, (v) => {
          d.category = v;
          render();
        }),
      )}${field("Tags", esc(tagsLabel()), chooseTags)}${field(
        "Date",
        d.date || t("No changes"),
        () =>
          calendar(d.date || TODAY, (v) => {
            d.date = v;
            render();
          }),
      )}${field("Comment", d.comment === null ? t("No changes") : esc(d.comment), () =>
        promptText(
          "Comment",
          d.comment || "",
          (v) => {
            d.comment = v;
            render();
          },
          "Comment",
        ),
      )}${B(
        "Confirm",
        () => {
          try {
            const replacements = selected.map((o) => {
              const n = clone(o);
              if (d.category && n.type !== "transfer") {
                n.category = d.category;
                const a = n.from || n.to;
                n.type = cat(d.category).type;
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
            for (const o of replacements) D.ops[D.ops.findIndex((x) => x.id === o.id)] = o;
            U.selection = false;
            U.selected = [];
            save();
            close();
            toast("Operations updated");
          } catch (e) {
            toast(e.message);
          }
        },
        "primary",
      )}${B("Cancel", () => close(), "outline")}`,
    "Bulk edit",
  );
}
export function recurLabel(r) {
  return r
    ? `Every ${r.every} ${r.unit.toLowerCase()}${r.unit === "Weeks" && r.days?.length ? " · " + r.days.map((n) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n]).join(", ") : ""}${r.remaining !== null ? " · " + r.remaining + " times" : ""}`
    : t("One time");
}
