/* Categories screens */
import { render } from "../app/shell.js";
import { CURRENCIES, I, clone, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  bal,
  cat,
  categoryTotal,
  convert,
  money,
  moneySpan,
  totalType,
} from "../domain/finance.js";
import { deleteCategory, moveCategory } from "../domain/operations.js";
import { accountActions, hero } from "./accounts.js";
import { operationStart } from "./operation-editor.js";
import {
  back,
  close,
  confirmAction,
  currencyPicker,
  finish,
  header,
  home,
  iconPicker,
  page,
  periodBar,
  promptText,
  sheet,
} from "../ui/kit.js";
import { B, IB, badge, field, row, t, toast, txt } from "../ui/primitives.js";

export function orderView(kind) {
  const list = kind === "accounts" ? D.accounts : D.categories.filter((c) => !c.parent);
  function move(id, n) {
    const arr = kind === "accounts" ? D.accounts : D.categories,
      i = arr.findIndex((x) => x.id === id),
      j = i + n;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    save();
    render();
  }
  return (
    header("Change order") +
    `<div class="content">${list.map((a, i) => `<div class="row">${badge(a, true)}<span class="grow">${esc(a.name)}</span>${IB("up", "Move up", () => move(a.id, -1))}${IB("down", "Move down", () => move(a.id, 1))}</div>`).join("")}${B("Complete", back, "primary")}</div>`
  );
}
export function sumTabs() {
  return `<div class="sum-tabs">${["expense", "income"]
    .map((type) =>
      B(
        `<span>${t(type === "expense" ? "Expenses" : "Incomes")}</span><span class="money ${type === "expense" ? "neg" : "pos"}">${money(totalType(type))}</span>`,
        () => {
          U.catType = type;
          U.donut = null;
          render();
        },
        U.catType === type ? "active" : "",
      ),
    )
    .join("")}</div>`;
}

function categoryTile(c, fn = null) {
  return B(
    `${badge(c)}<span class="grow"><span class="name">${esc(c.name)}</span><span class="money ${categoryTotal(c.id) === 0 ? "muted" : c.type === "income" ? "pos" : "neg"}">${money(convert(categoryTotal(c.id), D.settings.currency, c.currency), c.currency)}</span></span>`,
    fn ||
      (() =>
        operationStart({
          type: c.type,
          category: c.id,
          from: c.type === "expense" ? D.accounts.find((a) => !a.archived)?.id : null,
          to: c.type === "income" ? D.accounts.find((a) => !a.archived)?.id : null,
        })),
    "cat-tile",
    `data-category="${c.id}"`,
  );
}

export function categoriesView() {
  let list = D.categories.filter((c) => c.type === U.catType && !c.archived && !c.parent);
  return (
    hero() +
    periodBar() +
    sumTabs() +
    `<div class="content"><div class="grid ${D.settings.oneColumn ? "one" : ""}">${list.map((c) => categoryTile(c)).join("")}${D.accounts
      .filter(
        (a) =>
          a.type === "Debt" &&
          !a.archived &&
          (U.catType === "expense" ? a.showExpense : a.showIncome),
      )
      .map((a) =>
        categoryTile({ ...a, id: "debt:" + a.id, type: U.catType }, () => accountActions(a)),
      )
      .join("")}</div></div>`
  );
}
export function categoryActions(c) {
  sheet(
    () =>
      `<div class="sheet-account">${badge(c)}<div class="grow"><strong>${esc(c.name)}</strong><div>${money(categoryTotal(c.id), c.currency)}</div></div>${IB("edit", "Edit", () => editCategory(c))}</div><div class="action-grid two">${B(I("plus") + t("Add an operation"), () => operationStart({ type: c.type, category: c.id }))}${B(
        I("receipt") + t("Operations"),
        () => {
          U.filters.categories = [c.id];
          home("operations");
        },
      )}</div>${
        D.settings.subcategories
          ? D.categories
              .filter((x) => x.parent === c.id && !x.archived)
              .map((x) =>
                row(
                  esc(x.name),
                  x.icon,
                  () => categoryActions(x),
                  money(categoryTotal(x.id), x.currency),
                ),
              )
              .join("")
          : ""
      }${!c.parent ? row("Add subcategory", "plus", () => editCategory(null, c.id)) : ""}${row("Edit", "edit", () => editCategory(c))}`,
    c.name,
  );
}
export function editCategory(c, parent = null) {
  page("categoryEdit", {
    editing: !!c,
    draft: c
      ? clone(c)
      : {
          id: null,
          name: "",
          type: cat(parent)?.type || U.catType,
          icon: U.catType === "income" ? "trend" : "pizza",
          color: "#9d00b5",
          currency: D.settings.currency,
          parent,
          archived: false,
        },
    pending: null,
  });
}
function categoryTarget(d, mode, p, subId = null) {
  const opts = D.categories.filter(
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
  sheet(
    () =>
      `<h2>${t(mode === "mergeSub" ? "Choose a subcategory" : "Choose a category")}</h2><div class="cat-target-grid">${opts
        .map((c) =>
          B(
            `${badge(c)}<span>${esc(c.name)}</span>`,
            () => {
              close();
              if (mode === "nest" || mode === "merge") {
                p.pending = { mode, target: c.id };
                render();
                return;
              }
              categoryScheduleSub(p, subId, mode, c.id);
            },
            "cat-target-item",
          ),
        )
        .join("")}</div>${B("Cancel", () => close(), "outline")}`,
    "Choose a category",
  );
}
function categoryScheduleSub(p, id, mode, target = null) {
  const sub = D.categories.find((c) => c.id === id);
  if (!sub) return;
  const titles = {
    moveSub: "Move to a category?",
    mergeSub: "Merge into a subcategory?",
    promoteSub: "Convert to a category?",
  };
  const descriptions = {
    moveSub:
      "This subcategory and its operations will be moved to the selected category. The change will be applied after you tap Save.",
    mergeSub:
      "The operations will be moved to the selected subcategory and this subcategory will be deleted. The change will be applied after you tap Save.",
    promoteSub:
      "This subcategory will become a standalone category, and its operations will be re-pointed to it directly. The change will be applied after you tap Save.",
  };
  if (mode === "archiveSub" || mode === "restoreSub") {
    p.subActions = p.subActions || [];
    p.subActions.push({ id, mode, target });
    render();
    return;
  }
  confirmAction(
    (titles[mode] || "Apply changes?") + " " + (descriptions[mode] || ""),
    () => {
      p.subActions = p.subActions || [];
      p.subActions = p.subActions.filter((a) => a.id !== id);
      p.subActions.push({ id, mode, target });
      render();
    },
    false,
    mode === "promoteSub" ? "Confirm" : "Schedule",
  );
}
function categorySubMenu(p, id) {
  const c = D.categories.find((x) => x.id === id);
  if (!c) return;
  sheet(
    () =>
      `<div class="mon-submenu-title">${esc(c.name)}</div><div class="cat-sub-actions">${row(
        "Edit",
        "edit",
        () => {
          close();
          editCategory(c);
        },
      )}${row("Move to a category", "transfer", () => {
        close();
        categoryTarget(p.draft, "moveSub", p, id);
      })}${row("Merge into a subcategory", "transfer", () => {
        close();
        categoryTarget(p.draft, "mergeSub", p, id);
      })}${row("Convert to a category", "categories", () => {
        close();
        categoryScheduleSub(p, id, "promoteSub");
      })}${row(c.archived ? "Return from archive" : "Move to archive", "archive", () => {
        close();
        categoryScheduleSub(p, id, c.archived ? "restoreSub" : "archiveSub");
      })}${row("Delete", "trash", () => {
        close();
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
export function saveCategory(p) {
  const d = p.draft;
  if (!d.name.trim()) return toast("Enter a name");
  const apply = () => {
    if (d.id && cat(d.id)) {
      Object.assign(cat(d.id), d);
    } else {
      if (!d.id) d.id = uid();
      D.categories.push(clone(d));
    }
    for (const sub of p.newSubcategories || []) {
      sub.parent = d.id;
      if (!D.categories.some((c) => c.id === sub.id)) D.categories.push(clone(sub));
    }
    for (const a of p.subActions || []) {
      const sub = cat(a.id);
      if (!sub) continue;
      if (a.mode === "archiveSub") sub.archived = true;
      else if (a.mode === "restoreSub") sub.archived = false;
      else if (a.mode === "promoteSub") sub.parent = null;
      else if (a.mode === "moveSub" && cat(a.target)?.type === sub.type) sub.parent = a.target;
      else if (a.mode === "mergeSub" && cat(a.target)?.type === sub.type) {
        for (const key of ["ops", "scheduled"])
          for (const o of D[key]) if (o.category === sub.id) o.category = a.target;
        D.categories = D.categories.filter((x) => x.id !== sub.id);
      } else if (a.mode === "deleteSub") {
        deleteCategory(sub.id);
      }
    }
    if (p.pending?.mode === "nest" && cat(p.pending.target))
      moveCategory(d.id, p.pending.target, true);
    if (p.pending?.mode === "merge" && cat(p.pending.target))
      moveCategory(d.id, p.pending.target, false);
    save();
    finish("Category saved");
  };
  if (
    p.pending ||
    (p.subActions || []).some((a) => ["moveSub", "mergeSub", "promoteSub"].includes(a.mode))
  )
    confirmAction(
      "Apply changes? The planned actions on subcategories will be applied",
      apply,
      true,
      "Confirm",
    );
  else apply();
}
function categoryTypePicker(d) {
  const typeSvg = (kind) =>
    kind === "expense"
      ? `<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10V4h16v6M12 20V9m-6 6 6-6 6 6"/></svg>`
      : `<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15m-6-6 6 6 6-6M4 20h16"/></svg>`;
  sheet(
    () =>
      `<div class="mon65-cat-type-picker"><h2>Select type</h2>${[
        ["expense", "Expenses"],
        ["income", "Incomes"],
      ]
        .map(([value, label]) =>
          B(
            `<span class="mon65-cat-type-icon ${value}">${typeSvg(value)}</span><span class="grow">${label}</span><span class="mon65-cat-type-radio ${d.type === value ? "selected" : ""}"></span>`,
            () => {
              if (d.parent && cat(d.parent)?.type !== value)
                return toast("Subcategory type follows its parent");
              d.type = value;
              close();
              render();
            },
            "mon65-cat-type-choice",
          ),
        )
        .join("")}</div>`,
    "Select type",
  );
}
export function categoryEditView(p) {
  const d = p.draft,
    children = d.id ? D.categories.filter((c) => c.parent === d.id) : [];
  const active = children.filter((c) => !c.archived),
    archived = children.filter((c) => c.archived);
  const planned = (id) => (p.subActions || []).find((x) => x.id === id);
  const chip = (c) =>
    `<div class="cat-sub-chip">${B(
      `<span class="cat-sub-row-name">${esc(c.name)}</span>${I("right", 19)}`,
      () => {
        if ((p.newSubcategories || []).some((x) => x.id === c.id))
          promptText(
            "Subcategory",
            c.name,
            (v) => {
              c.name = v.trim() || c.name;
              render();
            },
            "Title",
          );
        else categorySubMenu(p, c.id);
      },
      "cat-sub-chip-button",
    )}${planned(c.id) ? `<small>→ ${esc({ moveSub: "Move to " + (cat(planned(c.id).target)?.name || ""), mergeSub: "Merge into " + (cat(planned(c.id).target)?.name || ""), promoteSub: "Make a category", archiveSub: "Move to archive", restoreSub: "Return from archive", deleteSub: "Delete" }[planned(c.id).mode] || "")}</small>` : ""}</div>`;
  return (
    header(p.editing ? "Change category" : "New category") +
    `<div class="content cat-editor-content"><div class="cat-edit-form">${txt("Title", d.name, (v) => (d.name = v), "Enter the title")}${field("Icon", badge(d), () => iconPicker(d))}${field("Type", (d.type === "expense" ? '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10V4h16v6M12 20V9m-6 6 6-6 6 6"/></svg>' : '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15m-6-6 6 6 6-6M4 20h16"/></svg>') + " " + t(d.type === "expense" ? "Expenses" : "Incomes"), () => categoryTypePicker(d))}${field(
      "Account currency",
      esc(CURRENCIES.find(([id]) => id === d.currency)?.[1] || d.currency),
      () =>
        currencyPicker(d.currency, (v) => {
          d.currency = v;
          render();
        }),
    )}<div class="cat-sub-section"><div class="cat-sub-heading">${t("Subcategories")}</div>${active.map(chip).join("")}${B(
      t("Add subcategory"),
      () => {
        sheet(
          () =>
            `<h2>Subcategory</h2><input id="cat-sub-name" aria-label="Subcategory name" placeholder="Name" maxlength="80"/> <div class="cat-sub-modal-buttons">${B("Cancel", () => close(), "outline")}${B(
              "OK",
              () => {
                const input = document.getElementById("cat-sub-name");
                const name = input?.value?.trim();
                if (!name) return toast("Enter a name");
                if (!d.id) d.id = uid();
                p.newSubcategories = p.newSubcategories || [];
                p.newSubcategories.push({
                  id: uid(),
                  name,
                  type: d.type,
                  parent: d.id,
                  icon: "circle",
                  color: d.color,
                  currency: d.currency,
                  archived: false,
                });
                close();
                render();
              },
              "primary",
            )}</div>`,
          "Subcategory",
          "dialog",
        );
      },
      "cat-add-sub",
    )}${archived.length ? `<div class="cat-sub-heading cat-archive-heading">Archive</div>${archived.map(chip).join("")}` : ""}</div></div>${
      p.pending
        ? `<div class="cat-scheduled">→ ${esc(p.pending.mode === "nest" ? "Nest into " + (cat(p.pending.target)?.name || "") : "Move into " + (cat(p.pending.target)?.name || ""))}${B(
            "Cancel",
            () => {
              p.pending = null;
              render();
            },
            "text-button",
          )}</div>`
        : ""
    }<div class="cat-editor-actions">${B(t(p.editing ? "Save" : "Create"), () => saveCategory(p), "primary")}${p.editing && !d.parent ? B("Nest into category", () => categoryTarget(d, "nest", p), "cat-action-secondary") : ""}${p.editing && !d.parent ? B("Move into category", () => categoryTarget(d, "merge", p), "cat-action-secondary") : ""}${
      p.editing
        ? B(
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
        ? B(
            "Delete",
            () =>
              confirmAction(
                "All operations associated with the category will be deleted. This applies to both normal operations and scheduled ones. The category and transactions cannot be restored. If a category or subcategory was included in a budget, it will be removed from that budget.",
                () => {
                  deleteCategory(d.id);
                  finish("Category deleted");
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
function manageCategoryTabs() {
  return `<div class="cat-manage-tabs">${["expense", "income"]
    .map((type) =>
      B(
        t(type === "expense" ? "Expenses" : "Incomes"),
        () => {
          U.catType = type;
          U.manageArchive = false;
          render();
        },
        U.catType === type ? "active" : "",
      ),
    )
    .join("")}</div>`;
}
export function categoryManageView() {
  const active = D.categories.filter((c) => c.type === U.catType && !c.parent && !c.archived),
    archived = D.categories.filter((c) => c.type === U.catType && !c.parent && c.archived);
  return (
    header("Change categories") +
    manageCategoryTabs() +
    `<div class="content cat-manage-content">${B(`${I("plus", 17)}<span>Create a new category</span>`, () => editCategory(), "cat-manage-create")}<div class="cat-manage-grid">${active.map((c) => B(`${badge(c)}<span class="grow"><span class="name">${esc(c.name)}</span><small>${money(categoryTotal(c.id), c.currency)}</small></span>`, () => editCategory(c), "cat-manage-tile")).join("")}</div>${
      archived.length
        ? `<div class="cat-manage-archive">${B(
            `Archive (${archived.length}) ${I(U.manageArchive ? "chevronUp" : "chevronDown", 17)}`,
            () => {
              U.manageArchive = !U.manageArchive;
              render();
            },
            "cat-archive-toggle",
          )}${U.manageArchive ? `<div class="cat-manage-grid">${archived.map((c) => B(`${badge(c)}<span>${esc(c.name)}</span>`, () => editCategory(c), "cat-manage-tile cat-is-archived")).join("")}</div>` : ""}</div>`
        : ""
    }</div>`
  );
}
export function accountPicker(value, fn, exclude = null) {
  sheet(() => {
    const list = D.accounts.filter((a) => !a.archived && a.id !== exclude);
    return `<h2>${t("Account")}</h2>${
      list.length
        ? list
            .map((a) =>
              B(
                `${badge(a, true)}<span class="grow">${esc(a.name)}</span>${moneySpan(bal(a.id), a.currency, false, true)}${value === a.id ? I("check", 18) : ""}`,
                () => {
                  close();
                  fn(a.id);
                },
                "row",
              ),
            )
            .join("")
        : '<p class="footnote">No available accounts</p>'
    }${B("Cancel", () => close(), "outline")}`;
  }, "Account");
}
export function categoryPicker(type, value, fn) {
  let active = type;
  sheet(
    () =>
      `<h2>${t("Category")}</h2><div class="tabs">${["expense", "income"]
        .map((x) =>
          B(
            t(x === "expense" ? "Expenses" : "Incomes"),
            () => {
              active = x;
              render();
            },
            active === x ? "active" : "",
          ),
        )
        .join("")}</div><div class="grid ${D.settings.onePicker ? "one" : ""}">${D.categories
        .filter((c) => !c.archived && c.type === active)
        .map((c) =>
          B(
            `${badge(c)}<span>${c.parent ? "↳ " : ""}${esc(c.name)}</span>${c.id === value ? I("check", 16) : ""}`,
            () => {
              close();
              fn(c.id);
            },
            "cat-tile",
          ),
        )
        .join("")}</div>`,
    "Category",
  );
}
