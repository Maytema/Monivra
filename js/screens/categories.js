/* Categories screens */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  categoryById,
  categoryCount,
  categoryShare,
  categoryTotal,
  convertCurrency,
  formatMoney,
  totalByType,
} from "../domain/finance.js";
import { deleteCategory, moveCategory } from "../domain/operations.js";
import { currencyName, translate, translateCount, translateWith } from "../i18n/index.js";
import { accountActions, hero } from "./accounts.js";
import { operationStart } from "./operation-editor.js";
import { openFilteredOperations } from "./operations.js";
import {
  actionTileHtml,
  closeLayers,
  confirmAction,
  currencyPicker,
  finishFlow,
  goBack,
  iconPicker,
  openPage,
  openSheet,
  pageHeader,
  periodBar,
  promptText,
  swipePane,
  tabsHtml,
} from "../ui/kit.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  menuRowHtml,
  textFieldHtml,
  toast,
} from "../ui/primitives.js";

// Screen for changing the order of accounts or categories.
export function orderView(kind) {
  const list = kind === "accounts" ? appData.accounts : appData.categories.filter((c) => !c.parent);
  function move(id, n) {
    const arr = kind === "accounts" ? appData.accounts : appData.categories,
      i = arr.findIndex((x) => x.id === id),
      j = i + n;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    save();
    render();
  }
  return (
    pageHeader("Change order") +
    `<div class="content">${list.map((a) => `<div class="row">${badgeHtml(a, true)}<span class="grow">${escapeHtml(a.name)}</span>${iconButtonHtml("up", "Move up", () => move(a.id, -1))}${iconButtonHtml("down", "Move down", () => move(a.id, 1))}</div>`).join("")}${buttonHtml("Complete", goBack, "primary")}</div>`
  );
}
// Expense/income tabs shared by categories and statistics.
export function sumTabs() {
  return `<div class="sum-tabs">${["expense", "income"]
    .map((type) =>
      buttonHtml(
        `<span>${translate(type === "expense" ? "Expenses" : "Incomes")}</span><span class="money ${type === "expense" ? "neg" : "pos"}">${formatMoney(totalByType(type))}</span>`,
        () => {
          uiState.catType = type;
          uiState.donut = null;
          render();
        },
        uiState.catType === type ? "active" : "",
      ),
    )
    .join("")}</div>`;
}

// Total of a category for the report period, shown in the currency of the category.
const categoryMoney = (c) =>
  formatMoney(
    convertCurrency(categoryTotal(c.id, c.type), appData.settings.currency, c.currency),
    c.currency,
  );
// One tile in the categories grid.
function categoryTile(c, fn = null) {
  return buttonHtml(
    `${badgeHtml(c)}<span class="grow"><span class="name">${escapeHtml(c.name)}</span><span class="money ${categoryTotal(c.id, c.type) === 0 ? "muted" : c.type === "income" ? "pos" : "neg"}">${categoryMoney(c)}</span></span>`,
    fn ||
      (() =>
        operationStart({
          type: c.type,
          category: c.id,
          from: c.type === "expense" ? appData.accounts.find((a) => !a.archived)?.id : null,
          to: c.type === "income" ? appData.accounts.find((a) => !a.archived)?.id : null,
        })),
    "cat-tile",
    `data-category="${c.id}"`,
  );
}

// Categories tab.
export function categoriesView() {
  let list = appData.categories.filter(
    (c) => c.type === uiState.catType && !c.archived && !c.parent,
  );
  return (
    hero() +
    swipePane(
      periodBar() +
        sumTabs() +
        `<div class="content"><div class="grid ${appData.settings.oneColumn ? "one" : ""}">${list.map((c) => categoryTile(c)).join("")}${appData.accounts
          .filter(
            (a) =>
              a.type === "Debt" &&
              !a.archived &&
              (uiState.catType === "expense" ? a.showExpense : a.showIncome),
          )
          .map((a) =>
            categoryTile({ ...a, id: "debt:" + a.id, type: uiState.catType }, () =>
              accountActions(a),
            ),
          )
          .join("")}</div></div>`,
    )
  );
}
// Action sheet shown on a long press of a category: figures for the period and two actions;
// "Operations" lists the category over `period` (all time by default).
export function categoryActions(c, period = { mode: "all", anchor: TODAY }) {
  const share = Math.round(categoryShare(c.id, c.type) * 100),
    count = categoryCount(c.id, c.type);
  openSheet(
    () =>
      `<div class="category-sheet-head">${badgeHtml(c)}<strong>${escapeHtml(c.name)}</strong></div><div class="category-sheet-stats"><span>${translateCount("{n} operation", "{n} operations", count)}</span><span>${categoryMoney(c)}</span></div><div class="category-share"><span class="category-share-bar"><i style="width:${share}%;background:${escapeHtml(c.color)}"></i></span><span>${share} %</span></div><div class="sheet-actions" style="--cols:2" role="group" aria-label="Category actions">${actionTileHtml("edit", "Edit", "#c04fd8", () => editCategory(c))}${actionTileHtml(
        "receipt",
        "Operations",
        "#1f8fe0",
        () => openFilteredOperations({ categories: [c.id] }, period),
      )}</div>${
        appData.settings.subcategories
          ? appData.categories
              .filter((x) => x.parent === c.id && !x.archived)
              .map((x) =>
                menuRowHtml(
                  escapeHtml(x.name),
                  x.icon,
                  () => openFilteredOperations({ categories: [x.id] }, period),
                  categoryMoney(x),
                ),
              )
              .join("")
          : ""
      }`,
    c.name,
  );
}
// How many operations and scheduled payments use a category or its sub-categories.
function operationsUsing(id) {
  const ids = [id, ...appData.categories.filter((c) => c.parent === id).map((c) => c.id)];
  return [...appData.ops, ...appData.scheduled].filter((o) => ids.includes(o.category)).length;
}
// Open the category editor (new category when no argument is given).
export function editCategory(c, parent = null) {
  openPage("categoryEdit", {
    editing: !!c,
    draft: c
      ? deepClone(c)
      : {
          id: null,
          name: "",
          type: categoryById(parent)?.type || uiState.catType,
          icon: uiState.catType === "income" ? "trend" : "pizza",
          color: "#9d00b5",
          currency: appData.settings.currency,
          parent,
          archived: false,
        },
  });
}
// Picker for the target category when merging, nesting or moving categories.
function categoryTarget(d, mode, p, subId = null) {
  const opts = appData.categories.filter(
    (c) =>
      !c.archived &&
      c.type === d.type &&
      c.id !== d.id &&
      (mode === "mergeSub"
        ? c.parent === d.id && c.id !== subId
        : mode === "nest" || mode === "moveSub"
          ? !c.parent
          : !c.parent),
  );
  openSheet(
    () =>
      `<h2>${translate(mode === "mergeSub" ? "Choose a subcategory" : "Choose a category")}</h2><div class="cat-target-grid">${opts
        .map((c) =>
          buttonHtml(
            `${badgeHtml(c)}<span>${escapeHtml(c.name)}</span>`,
            () => {
              closeLayers();
              if (mode === "nest" || mode === "merge") {
                confirmAction(
                  translateWith(
                    mode === "nest"
                      ? 'This category and its subcategories will become subcategories of "{name}". Their operations will be re-pointed to "{name}" accordingly.'
                      : 'All operations of this category will be moved to "{name}", and this category will be deleted.',
                    { name: c.name },
                  ),
                  () => saveCategory(p, { mode, target: c.id }),
                  true,
                  "Confirm",
                  { title: mode === "nest" ? "Nest into category?" : "Move into category?" },
                );
                return;
              }
              categoryScheduleSub(p, subId, mode, c.id);
            },
            "cat-target-item",
          ),
        )
        .join("")}</div>${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    "Choose a category",
  );
}
// Plan an action on a sub-category; it is applied when the category is saved. Merging and
// converting ask first, because they cannot be undone afterwards.
function categoryScheduleSub(p, id, mode, target = null) {
  const sub = appData.categories.find((c) => c.id === id);
  if (!sub) return;
  const plan = () => {
    p.subActions = (p.subActions || []).filter((a) => a.id !== id);
    p.subActions.push({ id, mode, target });
    render();
  };
  const asks = {
    mergeSub: {
      title: "Merge into a subcategory?",
      text: translateWith(
        'All operations of this subcategory will be moved to "{name}", and this subcategory will be deleted.\n\nThe change will be applied after you tap "Save".',
        { name: categoryById(target)?.name || "" },
      ),
    },
    promoteSub: {
      title: "Convert to a category?",
      text: translate(
        'This subcategory will become a standalone category, and its operations will be re-pointed to it directly.\n\nThe change will be applied after you tap "Save".',
      ),
    },
  };
  const ask = asks[mode];
  if (ask) confirmAction(ask.text, plan, false, "Schedule", { title: ask.title, tone: "info" });
  else plan();
}
// Action sheet for a sub-category.
function categorySubMenu(p, id) {
  const c = appData.categories.find((x) => x.id === id);
  if (!c) return;
  openSheet(
    () =>
      `<div class="submenu-title">${escapeHtml(c.name)}</div><div class="cat-sub-actions">${menuRowHtml(
        "Edit",
        "edit",
        () => {
          closeLayers();
          editCategory(c);
        },
      )}${menuRowHtml("Move to a category", "transfer", () => {
        closeLayers();
        categoryTarget(p.draft, "moveSub", p, id);
      })}${menuRowHtml("Merge into a subcategory", "transfer", () => {
        closeLayers();
        categoryTarget(p.draft, "mergeSub", p, id);
      })}${menuRowHtml("Convert to a category", "categories", () => {
        closeLayers();
        categoryScheduleSub(p, id, "promoteSub");
      })}${menuRowHtml(c.archived ? "Return from archive" : "Move to archive", "archive", () => {
        closeLayers();
        categoryScheduleSub(p, id, c.archived ? "restoreSub" : "archiveSub");
      })}${menuRowHtml("Delete", "trash", () => {
        closeLayers();
        confirmAction(
          "Delete this subcategory and its associated operations?",
          () => {
            p.subActions = p.subActions || [];
            p.subActions.push({ id, mode: "deleteSub" });
            render();
          },
          true,
          "Delete",
        );
      })}</div>`,
    "Subcategory actions",
  );
}
// Validate and store the category being edited.
// `relocate` nests the category into another one or merges it into it ({ mode, target }).
export function saveCategory(p, relocate = null) {
  const d = p.draft;
  if (!d.name.trim()) return toast("Enter a name");
  const apply = () => {
    if (d.id && categoryById(d.id)) {
      Object.assign(categoryById(d.id), d);
    } else {
      if (!d.id) d.id = newId();
      appData.categories.push(deepClone(d));
    }
    for (const sub of p.newSubcategories || []) {
      sub.parent = d.id;
      if (!appData.categories.some((c) => c.id === sub.id)) appData.categories.push(deepClone(sub));
    }
    for (const a of p.subActions || []) {
      const sub = categoryById(a.id);
      if (!sub) continue;
      if (a.mode === "archiveSub") sub.archived = true;
      else if (a.mode === "restoreSub") sub.archived = false;
      else if (a.mode === "promoteSub") sub.parent = null;
      else if (a.mode === "moveSub" && categoryById(a.target)?.type === sub.type)
        sub.parent = a.target;
      else if (a.mode === "mergeSub" && categoryById(a.target)?.type === sub.type) {
        for (const key of ["ops", "scheduled"])
          for (const o of appData[key]) if (o.category === sub.id) o.category = a.target;
        appData.categories = appData.categories.filter((x) => x.id !== sub.id);
      } else if (a.mode === "deleteSub") {
        deleteCategory(sub.id);
      }
    }
    if (relocate && categoryById(relocate.target))
      moveCategory(d.id, relocate.target, relocate.mode === "nest");
    save();
    finishFlow("Category saved");
  };
  if ((p.subActions || []).some((a) => ["moveSub", "mergeSub", "promoteSub"].includes(a.mode)))
    confirmAction("The planned actions on subcategories will be applied.", apply, true, "Confirm", {
      title: "Apply changes?",
    });
  else apply();
}
// Expense/income switch in the category editor.
function categoryTypePicker(d) {
  const typeSvg = (kind) =>
    kind === "expense"
      ? `<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10V4h16v6M12 20V9m-6 6 6-6 6 6"/></svg>`
      : `<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15m-6-6 6 6 6-6M4 20h16"/></svg>`;
  openSheet(
    () =>
      `<div class="type-picker"><h2>Select type</h2>${[
        ["expense", "Expenses"],
        ["income", "Incomes"],
      ]
        .map(([value, label]) =>
          buttonHtml(
            `<span class="type-picker-icon ${value}">${typeSvg(value)}</span><span class="grow">${label}</span><span class="type-picker-radio ${d.type === value ? "selected" : ""}"></span>`,
            () => {
              if (d.parent && categoryById(d.parent)?.type !== value)
                return toast("Subcategory type follows its parent");
              d.type = value;
              closeLayers();
              render();
            },
            "type-picker-choice",
          ),
        )
        .join("")}</div>`,
    "Select type",
  );
}
// Action sheet for a sub-category that is not saved yet: rename or delete it.
function newSubMenu(p, c) {
  openSheet(
    () =>
      `<div class="submenu-title">${escapeHtml(c.name)}</div><div class="cat-sub-actions">${menuRowHtml(
        "Edit",
        "edit",
        () => {
          closeLayers();
          promptText(
            "Subcategory",
            c.name,
            (v) => {
              c.name = v.trim() || c.name;
              render();
            },
            "Title",
          );
        },
      )}${menuRowHtml("Delete", "trash", () => {
        p.newSubcategories = p.newSubcategories.filter((x) => x.id !== c.id);
        closeLayers();
      })}</div>`,
    "Subcategory actions",
  );
}
// Category editor form.
export function categoryEditView(p) {
  const d = p.draft,
    children = d.id ? appData.categories.filter((c) => c.parent === d.id) : [];
  const active = children.filter((c) => !c.archived),
    archived = children.filter((c) => c.archived);
  const planned = (id) => (p.subActions || []).find((x) => x.id === id);
  const chip = (c) =>
    `<div class="cat-sub-chip" data-sub="${escapeHtml(c.id)}">${buttonHtml(
      `<span class="cat-sub-row-name">${escapeHtml(c.name)}</span>${iconSvg("right", 19)}`,
      () => {
        if ((p.newSubcategories || []).some((x) => x.id === c.id)) newSubMenu(p, c);
        else categorySubMenu(p, c.id);
      },
      "cat-sub-chip-button",
    )}${planned(c.id) ? `<small>→ ${escapeHtml({ moveSub: translateWith("Move to {name}", { name: categoryById(planned(c.id).target)?.name || "" }), mergeSub: translateWith("Merge into {name}", { name: categoryById(planned(c.id).target)?.name || "" }), promoteSub: "Make a category", archiveSub: "Move to archive", restoreSub: "Return from archive", deleteSub: "Delete" }[planned(c.id).mode] || "")}</small>` : ""}</div>`;
  return (
    pageHeader(p.editing ? "Change category" : "New category") +
    `<div class="content cat-editor-content"><div class="cat-edit-form">${textFieldHtml("Title", d.name, (v) => (d.name = v), "Enter the title")}${fieldButtonHtml("Icon", badgeHtml(d), () => iconPicker(d))}${fieldButtonHtml("Type", (d.type === "expense" ? '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10V4h16v6M12 20V9m-6 6 6-6 6 6"/></svg>' : '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15m-6-6 6 6 6-6M4 20h16"/></svg>') + " " + translate(d.type === "expense" ? "Expenses" : "Incomes"), () => categoryTypePicker(d))}${fieldButtonHtml(
      "Category currency",
      escapeHtml(currencyName(d.currency)),
      () =>
        currencyPicker(d.currency, (v) => {
          d.currency = v;
          render();
        }),
    )}<div class="cat-sub-section"><div class="cat-sub-heading">${translate("Subcategories")}</div>${[...active, ...(p.newSubcategories || [])].map(chip).join("")}${buttonHtml(
      translate("Add subcategory"),
      () => {
        openSheet(
          () =>
            `<h2>Subcategory</h2><input id="cat-sub-name" aria-label="Subcategory name" placeholder="Name" maxlength="80"/> <div class="cat-sub-modal-buttons">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
              "OK",
              () => {
                const input = document.getElementById("cat-sub-name");
                const name = input?.value?.trim();
                if (!name) return toast("Enter a name");
                if (!d.id) d.id = newId();
                p.newSubcategories = p.newSubcategories || [];
                p.newSubcategories.push({
                  id: newId(),
                  name,
                  type: d.type,
                  parent: d.id,
                  icon: d.icon,
                  color: d.color,
                  currency: d.currency,
                  archived: false,
                });
                closeLayers();
                render();
              },
              "primary",
            )}</div>`,
          "Subcategory",
          "dialog",
        );
      },
      "cat-add-sub",
    )}${archived.length ? `<div class="cat-sub-heading cat-archive-heading">Archive</div>${archived.map(chip).join("")}` : ""}</div></div><div class="cat-editor-actions">${buttonHtml(translate(p.editing ? "Save" : "Create"), () => saveCategory(p), "primary")}${p.editing && !d.parent ? buttonHtml("Nest into category", () => categoryTarget(d, "nest", p), "cat-action-secondary") : ""}${p.editing && !d.parent ? buttonHtml("Move into category", () => categoryTarget(d, "merge", p), "cat-action-secondary") : ""}${
      p.editing
        ? buttonHtml(
            d.archived ? "Return from archive" : "Move to archive",
            () => {
              d.archived = !d.archived;
              render();
            },
            "cat-action-archive",
          )
        : ""
    }${
      p.editing
        ? buttonHtml(
            "Delete",
            () =>
              confirmAction(
                translateWith(
                  "All operations ({n}) associated with the category will be removed. This applies to both normal operations and scheduled ones.\n\nThe category and transactions cannot be restored. If you only want to hide the category - select Move to archive.\n\nIf this category or subcategory was in the budget, it will be removed from there. If this was the only category in the budget, the budget will also be deleted.",
                  { n: operationsUsing(d.id) },
                ),
                () => {
                  deleteCategory(d.id);
                  finishFlow("Category deleted");
                },
                true,
                "Delete",
              ),
            "cat-action-delete",
          )
        : ""
    }</div></div>`
  );
}
// Expense/income tabs on the manage-categories page.
function manageCategoryTabs() {
  return tabsHtml(
    [
      ["expense", "Expenses"],
      ["income", "Incomes"],
    ],
    uiState.catType,
    (type) => {
      uiState.catType = type;
      uiState.manageArchive = false;
    },
    "cat-manage-tabs",
  );
}
// Manage-categories page (reorder, archive).
export function categoryManageView() {
  const active = appData.categories.filter(
      (c) => c.type === uiState.catType && !c.parent && !c.archived,
    ),
    archived = appData.categories.filter(
      (c) => c.type === uiState.catType && !c.parent && c.archived,
    );
  return (
    pageHeader("Change categories") +
    manageCategoryTabs() +
    `<div class="content cat-manage-content">${buttonHtml(`${iconSvg("plus", 17)}<span>Create a new category</span>`, () => editCategory(), "cat-manage-create")}<div class="cat-manage-grid">${active.map((c) => buttonHtml(`${badgeHtml(c)}<span class="grow"><span class="name">${escapeHtml(c.name)}</span><small>${categoryMoney(c)}</small></span>`, () => editCategory(c), "cat-manage-tile", `data-category="${escapeHtml(c.id)}"`)).join("")}</div>${
      archived.length
        ? `<div class="cat-manage-archive">${buttonHtml(
            `${translateWith("Archive ({n})", { n: archived.length })} ${iconSvg(uiState.manageArchive ? "chevronUp" : "chevronDown", 17)}`,
            () => {
              uiState.manageArchive = !uiState.manageArchive;
              render();
            },
            "cat-archive-toggle",
          )}${uiState.manageArchive ? `<div class="cat-manage-grid">${archived.map((c) => buttonHtml(`${badgeHtml(c)}<span>${escapeHtml(c.name)}</span>`, () => editCategory(c), "cat-manage-tile cat-is-archived")).join("")}</div>` : ""}</div>`
        : ""
    }</div>`
  );
}
