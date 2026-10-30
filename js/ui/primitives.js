/* UI primitives: translation, action registry, buttons, fields, toast */
import { escapeHtml, iconSvg } from "../core/constants.js";
import { isTestMode } from "../core/test-mode.js";
import { translate } from "../i18n/index.js";

// Registry of click handlers referenced from markup via data-action.
export let actionHandlers = {};
// Registry of input handlers referenced from markup via data-input.
export let inputHandlers = {};
// Counter used to generate unique handler ids.
export let handlerCounter = 0;
let toastTimer = 0;

// Register a click handler and return the id to put in data-action.
export const registerAction = (fn) => {
  const id = "a" + ++handlerCounter;
  actionHandlers[id] = fn;
  return id;
};
// Register an input handler and return the id to put in data-input.
export const registerInput = (fn) => {
  const id = "i" + ++handlerCounter;
  inputHandlers[id] = fn;
  return id;
};

// HTML for a button wired to a click handler.
export const buttonHtml = (label, fn, cls = "", attrs = "") =>
  `<button class="${cls}" data-action="${registerAction(fn)}" ${attrs}>${translate(label)}</button>`;
// HTML for an icon-only button with an accessible label.
export const iconButtonHtml = (icon, label, fn) =>
  buttonHtml(
    iconSvg(icon),
    fn,
    "icon-button",
    `aria-label="${escapeHtml(translate(label))}" title="${escapeHtml(translate(label))}"`,
  );
// Colored round badge with an account/category icon.
export const badgeHtml = (x, small = false) =>
  `<span class="badge${small ? " small" : ""}" style="--c:${escapeHtml(x?.color || "#777")}">${iconSvg(x?.icon || "wallet")}</span>`;
// Labeled text input wired to an input handler.
export const textFieldHtml = (label, value, fn, placeholder = "", type = "text") =>
  `<label class="field"><span class="field-label">${translate(label)}</span><input aria-label="${escapeHtml(translate(label))}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(translate(placeholder))}" data-input="${registerInput(fn)}"></label>`;
// Form row that looks like a field and opens a picker when clicked.
export const fieldButtonHtml = (label, value, fn, hint = "") =>
  buttonHtml(
    `<span class="field-label">${translate(label)}</span><span class="value">${value}</span>${hint ? `<span class="hint">${translate(hint)}</span>` : ""}`,
    fn,
    "field",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
// Switch row (label, optional hint, on/off toggle).
export const toggleRowHtml = (label, on, fn, hint = "") =>
  buttonHtml(
    `<span class="grow"><span>${translate(label)}</span>${hint ? `<small class="hint">${translate(hint)}</small>` : ""}</span><span class="toggle ${on ? "on" : ""}"></span>`,
    fn,
    "field inline",
    `role="switch" aria-checked="${!!on}" aria-label="${escapeHtml(translate(label))}"`,
  );
// List row with icon, label, optional subtitle and trailing content.
export const menuRowHtml = (label, icon, fn, sub = "", end = "") =>
  buttonHtml(
    `${icon ? iconSvg(icon, 22) : ""}<span class="grow"><span class="title">${translate(label)}</span>${sub ? `<span class="sub" style="display:block">${translate(sub)}</span>` : ""}</span>${end || `<span class="chevron">${iconSvg("right", 22)}</span>`}`,
    fn,
    "row",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
// Show a short message at the bottom of the screen.
export function toast(s) {
  if (isTestMode()) {
    window.__toast = s;
    return;
  }
  const el = document.getElementById("toast");
  el.textContent = translate(s);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1450);
}
export function setActionHandlers(value) {
  actionHandlers = value;
  return value;
}

export function setInputHandlers(value) {
  inputHandlers = value;
  return value;
}

export function setHandlerCounter(value) {
  handlerCounter = value;
  return value;
}
