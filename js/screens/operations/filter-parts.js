/* Pieces shared by the pickers of the filters */
import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { translate, translateWith } from "../../i18n/index.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { buttonHtml, sheetFooterHtml } from "../../ui/primitives.js";

export const checkboxHtml = (on) =>
  `<span class="checkbox ${on ? "on" : ""}">${on ? "✓" : ""}</span>`;

// How many are chosen, for the head of a picker.
export const summaryHtml = (n) => `<span>${translateWith("{n} selected", { n })}</span>`;

// The common frame of the pickers of the filters: title, how many are chosen (or tools), a list
// that scrolls and the buttons that stay in view.
export function pickerHtml(title, summary, list, confirm) {
  return `<div class="filter-picker-head"><h2>${translate(title)}</h2>${summary}</div><div class="filter-scroll">${list}</div>${sheetFooterHtml(
    buttonHtml("Cancel", () => closeLayers(), "outline"),
    buttonHtml("Confirm", confirm, "primary"),
  )}`;
}

// Multi-select sheet: one group whose head chooses everything or nothing.
export function multiSelect(title, items, selected, done) {
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
      pickerHtml(title, summaryHtml(values.size), listHtml(), () => {
        closeLayers();
        done(values.size === items.length ? null : [...values]);
      }),
    title,
  );
}
