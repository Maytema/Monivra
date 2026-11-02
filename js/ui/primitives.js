/* UI building blocks: buttons, fields, rows, tabs, page header, toast and banner */
import { escapeHtml, iconSvg } from "../core/constants.js";
import { translate } from "../i18n/index.js";
import { render } from "../app/shell.js";
import { registerAction, registerInput } from "./handlers.js";
import { goBack } from "./navigation.js";

let toastTimer = 0;
let bannerTimer = 0;

// HTML for a button wired to a click handler.
export const buttonHtml = (label, fn, cls = "", attrs = "") =>
  `<button class="${cls}" data-action="${registerAction(fn)}" ${attrs}>${translate(label)}</button>`;
// HTML for an icon-only button with an accessible label.
export const iconButtonHtml = (icon, label, fn, disabled = false) =>
  buttonHtml(
    iconSvg(icon),
    fn,
    "icon-button",
    `aria-label="${escapeHtml(translate(label))}" title="${escapeHtml(translate(label))}"${disabled ? " disabled" : ""}`,
  );
// Colored round badge with an account/category icon.
export const badgeHtml = (x, small = false) =>
  `<span class="badge${small ? " small" : ""}" style="--c:${escapeHtml(x?.color || "#777")}">${iconSvg(x?.icon || "wallet")}</span>`;
// Labeled text input wired to an input handler.
export const textFieldHtml = (label, value, fn, placeholder = "") =>
  `<label class="field"><span class="field-label">${translate(label)}</span><input aria-label="${escapeHtml(translate(label))}" value="${escapeHtml(value)}" placeholder="${escapeHtml(translate(placeholder))}" data-input="${registerInput(fn)}"></label>`;
// Search field with a magnifier: one look for every list that can be narrowed by typing.
export const searchFieldHtml = (placeholder, value, fn) =>
  `<div class="search-field"><span>${iconSvg("search", 22)}</span><input aria-label="${escapeHtml(translate(placeholder))}" placeholder="${escapeHtml(translate(placeholder))}" value="${escapeHtml(value)}" autocomplete="off" data-input="${registerInput(fn)}"></div>`;
// Form row that looks like a field and opens a picker when clicked.
export const fieldButtonHtml = (label, value, fn, hint = "") =>
  buttonHtml(
    `<span class="field-label">${translate(label)}</span><span class="value">${value}</span>${hint ? `<span class="hint">${translate(hint)}</span>` : ""}`,
    fn,
    "field",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
// A value between two arrows: the arrows change it by one, tapping the value types it in.
export const stepperHtml = (label, shown, step, edit) =>
  `<div class="field-title">${translate(label)}</div><div class="stepper">${iconButtonHtml("left", "Decrease", () => step(-1))}${buttonHtml(escapeHtml(String(shown)), edit, "stepper-value", `aria-label="${escapeHtml(translate(label))}"`)}${iconButtonHtml("right", "Increase", () => step(1))}</div>`;
// Outlined button that shows the current choice of a list and opens the list.
export const dropdownHtml = (shown, fn) =>
  buttonHtml(`<span>${translate(shown)}</span>${iconSvg("down", 20)}`, fn, "dropdown");
// Buttons at the bottom of a sheet; they stay in view while the content above them scrolls.
export const sheetFooterHtml = (...buttons) =>
  `<div class="sheet-footer">${buttons.join("")}</div>`;
// Floating "Add" button: the label folds away when the list under it is scrolled.
export const fabHtml = (label, fn) =>
  buttonHtml(
    iconSvg("plus", 26) + `<span class="fab-label"><span>${translate(label)}</span></span>`,
    fn,
    "fab fab-add",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
// Message that slides down from the top edge; the icon and the tone say what happened. With
// `onTap` it ends in an arrow, stays longer and a tap on it leads on to what it is about.
export function banner(s, icon, tone = "", onTap = null) {
  const el = document.getElementById("banner");
  el.className = `show ${tone} ${onTap ? "tappable" : ""}`;
  el.innerHTML = `${iconSvg(icon, 30)}<span class="grow">${escapeHtml(translate(s))}</span>${onTap ? iconSvg("right", 22) : ""}`;
  el.onclick = onTap
    ? () => {
        el.classList.remove("show");
        onTap();
      }
    : null;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove("show"), onTap ? 5000 : 1800);
}
// Progress meter: a thin outlined track with the fill set a little inside it; `owed` tints it red.
export const meterHtml = (percent, owed = false, cls = "") =>
  `<span class="meter ${owed ? "owed" : ""} ${cls}"><i style="width:${Math.min(100, Math.max(0, percent))}%"></i></span>`;
// Switch row (label, optional hint, on/off toggle).
export const toggleRowHtml = (label, on, fn, hint = "") =>
  buttonHtml(
    `<span class="grow"><span>${translate(label)}</span>${hint ? `<small class="hint">${translate(hint)}</small>` : ""}</span><span class="toggle ${on ? "on" : ""}"></span>`,
    fn,
    "field inline",
    `role="switch" aria-checked="${!!on}" aria-label="${escapeHtml(translate(label))}"`,
  );
// List row with icon, label, optional subtitle and trailing content.
export const menuRowHtml = (label, icon, fn, sub = "", end) =>
  buttonHtml(
    `${icon ? iconSvg(icon, 22) : ""}<span class="grow"><span class="title">${translate(label)}</span>${sub ? `<span class="sub">${translate(sub)}</span>` : ""}</span>${end ?? `<span class="chevron">${iconSvg("right", 22)}</span>`}`,
    fn,
    "row",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
// Show a short message at the bottom of the screen.
export function toast(s) {
  const el = document.getElementById("toast");
  el.textContent = translate(s);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1450);
}
// Wrap the part of a root screen that slides when swiping between tabs or periods.
export function swipePane(html) {
  return `<div class="swipe-pane">${html}</div>`;
}
// Header of a full-screen page: back button, title and extra controls.
export function pageHeader(title, extra = "") {
  return `<div class="topbar">${iconButtonHtml("back", "Back", goBack)}<h1>${translate(title)}</h1>${extra || '<span class="spacer"></span>'}</div>`;
}
// Round-cornered tile with a colored icon and a caption, for the action sheets.
export const actionTileHtml = (icon, label, tone, fn) =>
  buttonHtml(
    `<span class="sheet-action-icon" style="--tone:${tone}">${iconSvg(icon, 26)}</span><span>${translate(label)}</span>`,
    fn,
    "sheet-action",
  );
// Strip of tabs: `tabs` are [id, label] pairs; `onChange(id)` runs before the redraw.
export function tabsHtml(tabs, active, onChange, className = "tabs") {
  return `<div class="${className}">${tabs
    .map(([id, label]) =>
      buttonHtml(
        translate(label),
        () => {
          onChange(id);
          render();
        },
        active === id ? "active" : "",
      ),
    )
    .join("")}</div>`;
}
