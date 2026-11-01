/* Dialogs: messages, confirmations, text prompts, option lists and small menus */
import { escapeHtml, iconSvg } from "../core/constants.js";
import { createBackup } from "../domain/backups.js";
import { translate } from "../i18n/index.js";
import { buttonHtml, toast } from "./primitives.js";
import { registerInput } from "./handlers.js";
import { closeLayers, openSheet } from "./navigation.js";

// Dialog with a title, a message and an OK button.
export function showInfo(message, title = "Information") {
  openSheet(
    () =>
      `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${buttonHtml("OK", () => closeLayers(), "primary")}`,
    title,
    "dialog",
  );
}
// Confirmation dialog with an optional "create backup first" checkbox.
// `look` sets the dialog title and its icon: a red warning (default) or a green notice (tone "info").
export function confirmAction(message, fn, backupOption = true, label = "Confirm", look = {}) {
  const title = look.title || "Are you sure?",
    notice = look.tone === "info";
  let doBackup = false;
  openSheet(
    () =>
      `<div class="confirm-icon ${notice ? "notice" : "warning"}">${iconSvg(notice ? "info" : "warning", 32)}</div><h2>${translate(title)}</h2><p class="confirm-message">${escapeHtml(message)}</p>${backupOption ? `<label class="checkrow"><input type="checkbox" data-input="${registerInput((v) => (doBackup = v))}"><span>${translate("Create a backup first")}</span></label>` : ""}${buttonHtml(
        label,
        () => {
          if (doBackup) createBackup();
          closeLayers();
          try {
            fn();
          } catch (e) {
            toast(e.message);
          }
        },
        label === "Delete" ? "danger" : "primary",
      )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    title,
    "dialog",
  );
}
// Dialog asking for a single line of text.
export function promptText(title, value, fn, label = "Name") {
  let draft = value;
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><label><small>${translate(label)}</small><input aria-label="${escapeHtml(translate(label))}" value="${escapeHtml(draft)}" data-input="${registerInput((v) => (draft = v))}"></label><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          fn(draft);
        },
        "primary",
      )}</div>`,
    title,
    "dialog",
  );
  focusFieldEnd();
}
// Put the caret after the text of the first field of the top layer, so it can be edited at once.
function focusFieldEnd() {
  const field = [...document.querySelectorAll(".overlay")].at(-1)?.querySelector("input");
  if (!field) return;
  field.focus({ preventScroll: true });
  field.setSelectionRange(field.value.length, field.value.length);
}
// Bottom sheet with radio options.
export function optionSheet(title, options, value, fn, kind = "sheet") {
  const cancel =
    kind === "dialog"
      ? `<div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}</div>`
      : buttonHtml("Cancel", () => closeLayers(), "outline");
  openSheet(
    () =>
      `<h2>${translate(title)}</h2>${options
        .map((o) => {
          const [v, l, hint, icon = ""] = Array.isArray(o) ? o : [o, o];
          const radio = `<input type="radio" tabindex="-1" ${value === v ? "checked" : ""} aria-label="${escapeHtml(translate(l))}">`;
          const text = `<span class="grow">${escapeHtml(translate(l))}${hint ? `<small class="hint">${escapeHtml(translate(hint))}</small>` : ""}</span>`;
          // A dialog puts the radio first, a sheet last; an icon (ready markup) stands before the text.
          return buttonHtml(
            kind === "dialog" ? radio + icon + text : icon + text + radio,
            () => {
              closeLayers();
              fn(v);
            },
            "row",
          );
        })
        .join("")}${cancel}`,
    title,
    kind,
  );
}
// Small menu next to an element (a long press on a chip, say); `items` are [label, handler].
export function popupMenu(element, items) {
  const box = document.getElementById("app").getBoundingClientRect(),
    at = element.getBoundingClientRect();
  const height = items.length * 48 + 16;
  // Below the element when there is room, otherwise above it.
  const below = at.bottom + height + 8 < box.bottom;
  openSheet(
    () =>
      items
        .map(([label, fn]) =>
          buttonHtml(
            label,
            () => {
              closeLayers();
              fn();
            },
            "popup-item",
          ),
        )
        .join(""),
    "Menu",
    "popup",
    { x: at.left - box.left, y: (below ? at.bottom + 4 : at.top - height - 4) - box.top },
  );
}
