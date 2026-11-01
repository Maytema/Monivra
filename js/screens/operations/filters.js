/* Filters of the operations list */
import { render } from "../../app/shell.js";
import { deepClone, escapeHtml, iconSvg } from "../../core/constants.js";
import { appData, emptyFilters, uiState } from "../../core/state.js";
import { ACCOUNT_GROUPS } from "../../domain/finance.js";
import { translate, translateCount, translateWith } from "../../i18n/index.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { promptText } from "../../ui/dialogs.js";
import { badgeHtml, buttonHtml, fieldButtonHtml, sheetFooterHtml } from "../../ui/primitives.js";
import { registerAction } from "../../ui/handlers.js";

const checkboxHtml = (on) => `<span class="checkbox ${on ? "on" : ""}">${on ? "✓" : ""}</span>`;

// The common frame of the pickers of the filters: title, how many are chosen, a list that scrolls
// and the buttons that stay in view.
function pickerHtml(title, summary, list, confirm) {
  return `<div class="filter-picker-head"><h2>${translate(title)}</h2>${summary ? `<span>${summary}</span>` : ""}</div><div class="filter-scroll">${list}</div>${sheetFooterHtml(
    buttonHtml("Cancel", () => closeLayers(), "outline"),
    buttonHtml("Confirm", confirm, "primary"),
  )}`;
}

// Multi-select sheet: one group whose head chooses everything or nothing.
function multiSelect(title, items, selected, done) {
  const values = new Set(selected ?? items.map((item) => item.id));
  const toggleAll = () => {
    const all = values.size === items.length;
    values.clear();
    if (!all) items.forEach((item) => values.add(item.id));
    render();
  };
  const toggle = (id) => {
    if (!values.delete(id)) values.add(id);
    render();
  };
  const listHtml = () => {
    const head = buttonHtml(
      `<strong>${translate("Select all")}</strong><small>${values.size}/${items.length}</small>${checkboxHtml(items.length > 0 && values.size === items.length)}`,
      toggleAll,
      "filter-group-head filter-group-all",
    );
    const rows = items.map((item) =>
      buttonHtml(
        `${checkboxHtml(values.has(item.id))}<span>${escapeHtml(item.name)}</span>`,
        () => toggle(item.id),
        "filter-choice",
      ),
    );
    return `<div class="filter-group">${head}${rows.join("")}</div>`;
  };
  openSheet(
    () =>
      pickerHtml(title, translateWith("{n} selected", { n: values.size }), listHtml(), () => {
        closeLayers();
        done(values.size === items.length ? null : [...values]);
      }),
    title,
  );
}

// Account selection grouped by account type.
function filterAccountSelect(selected, done) {
  const values = selected ? new Set(selected) : new Set(appData.accounts.map((a) => a.id));
  const groups = ACCOUNT_GROUPS;
  const checked = (ids) => ids.length > 0 && ids.every((id) => values.has(id));
  const expanded = new Set(groups.map((g) => g[0]));
  openSheet(
    () =>
      pickerHtml(
        "Accounts",
        translateWith("{n} selected", { n: values.size }),
        `${groups
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
          .join("")}`,
        () => {
          closeLayers();
          done(values.size === appData.accounts.length ? null : [...values]);
        },
      ),
    "Accounts",
  );
}

// Category selection with expandable tree.
function filterCategorySelect(selected, done) {
  const values = selected ? new Set(selected) : new Set(appData.categories.map((c) => c.id));
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
      pickerHtml(
        "Filter by categories",
        "",
        `<div class="filter-category-tree">${["expense", "income"]
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
          .join("")}</div>`,
        () => {
          closeLayers();
          done(values.size === ids.length ? null : [...values]);
        },
      ),
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
      )}</div>${sheetFooterHtml(
        buttonHtml(
          "Reset all",
          () => {
            f = emptyFilters();
            uiState.filters = deepClone(f);
            closeLayers();
            render();
          },
          "outline",
        ),
        buttonHtml(
          "Apply",
          () => {
            uiState.filters = f;
            closeLayers();
            render();
          },
          "primary",
        ),
      )}`,
    "Filters",
  );
}
