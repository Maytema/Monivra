import { render } from "../../app/shell.js";
import { deepClone, escapeHtml, iconSvg } from "../../core/constants.js";
import { appData, emptyFilters, uiState } from "../../core/state.js";
import { ACCOUNT_GROUPS } from "../../domain/finance.js";
import { translate, translateCount, translateWith } from "../../i18n/index.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { promptText } from "../../ui/dialogs.js";
import { badgeHtml, buttonHtml, fieldButtonHtml } from "../../ui/primitives.js";
import { registerAction } from "../../ui/handlers.js";

// Generic multi-select sheet with select-all.
function multiSelect(title, items, selected, fn) {
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
  const values = selected ? new Set(selected) : new Set(appData.accounts.map((a) => a.id));
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
