/* Choice of the categories of a filter: income and expense trees, subcategories one by one */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { translate, translateWith } from "../../i18n/index.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { registerAction } from "../../ui/handlers.js";
import { badgeHtml, iconButtonHtml } from "../../ui/primitives.js";
import { checkboxHtml, pickerHtml } from "./filter-parts.js";

const TYPES = [
  ["expense", "Expenses"],
  ["income", "Incomes"],
];

// Expand arrow, or an empty place of the same width so the rows line up.
const expandHtml = (open, label, fn) =>
  `<button class="filter-expand" aria-label="${escapeHtml(label)}" data-action="${registerAction(fn)}">${iconSvg(open ? "down" : "right", 18)}</button>`;

// Checkbox that chooses or clears a whole group of categories.
const checkHtml = (label, on, fn) =>
  `<button class="filter-check-action" aria-label="${escapeHtml(label)}" data-action="${registerAction(fn)}">${checkboxHtml(on)}</button>`;

// Category selection with an expandable tree; a parent with subcategories offers its own
// operations as "Without subcategory", so any subset can be chosen.
export function filterCategorySelect(selected, done) {
  const all = appData.categories.map((c) => c.id);
  const values = new Set(selected ?? all);
  const hasChildren = (c) => appData.categories.some((x) => x.parent === c.id);
  const parents = appData.categories.filter((c) => !c.parent);
  const types = new Set(TYPES.map(([type]) => type));
  const open = new Set(parents.filter(hasChildren).map((c) => c.id));
  const chosen = (ids) => ids.length > 0 && ids.every((id) => values.has(id));
  const toggle = (ids) => {
    const on = chosen(ids);
    ids.forEach((id) => (on ? values.delete(id) : values.add(id)));
    render();
  };
  const flip = (set, key) => () => {
    if (!set.delete(key)) set.add(key);
    render();
  };

  const childRow = (name, id) =>
    `<div class="filter-child-row"><span class="filter-label">${name}</span>${checkHtml(translateWith("Select {name}", { name }), values.has(id), () => toggle([id]))}</div>`;
  const parentRow = (c) => {
    const children = appData.categories.filter((x) => x.parent === c.id);
    const family = [c.id, ...children.map((x) => x.id)];
    const name = escapeHtml(c.name);
    const arrow = children.length
      ? expandHtml(open.has(c.id), translateWith("Expand {name}", { name }), flip(open, c.id))
      : '<span class="filter-expand-placeholder"></span>';
    const rows =
      children.length && open.has(c.id)
        ? `<div class="filter-subcategories">${children.map((x) => childRow(escapeHtml(x.name), x.id)).join("")}${childRow(translate("Without subcategory"), c.id)}</div>`
        : "";
    return `<div class="filter-parent-row">${arrow}${badgeHtml(c, true)}<span class="filter-label">${name}</span>${checkHtml(translateWith("Select {name}", { name }), chosen(family), () => toggle(family))}</div>${rows}`;
  };
  const typeGroup = ([type, title]) => {
    const group = appData.categories.filter((c) => c.type === type);
    const label = translate(title);
    const arrow = expandHtml(
      types.has(type),
      translateWith("Expand {name}", { name: label }),
      flip(types, type),
    );
    const rows = types.has(type)
      ? group
          .filter((c) => !c.parent)
          .map(parentRow)
          .join("")
      : "";
    return `<div class="filter-group"><div class="filter-group-head">${arrow}<strong>${title}</strong>${checkHtml(translateWith("Select {name}", { name: label }), chosen(group.map((c) => c.id)), () => toggle(group.map((c) => c.id)))}</div>${rows}</div>`;
  };
  const collapse = (on) => () => {
    for (const set of [types, open]) set.clear();
    if (on) {
      TYPES.forEach(([type]) => types.add(type));
      parents.filter(hasChildren).forEach((c) => open.add(c.id));
    }
    render();
  };
  const tools = () =>
    `<span class="filter-tools">${iconButtonHtml("up", "Collapse all", collapse(false))}${iconButtonHtml("down", "Expand all", collapse(true))}</span>`;

  openSheet(
    () =>
      pickerHtml(
        "Filter by categories",
        tools(),
        `<div class="filter-category-tree">${TYPES.map(typeGroup).join("")}</div>`,
        () => {
          closeLayers();
          done(values.size === all.length ? null : [...values]);
        },
      ),
    "Filter by categories",
  );
}
