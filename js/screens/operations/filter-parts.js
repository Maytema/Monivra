/* Pieces shared by the pickers of the filters */
import { translate, translateWith } from "../../i18n/index.js";
import { closeLayers } from "../../ui/navigation.js";
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
