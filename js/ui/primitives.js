/* UI primitives: translation, action registry, buttons, fields, toast */
import { I, esc } from "../core/constants.js";
import { D } from "../core/state.js";
import { russianStrings } from "../core/translations.js";

export let actions = {};
export let inputs = {};
export let counter = 0;
let toastTimer = 0;
export let photoCallback = null;
export let importKind = "json";
export let locked = false;
export let pinEntry = "";

export const t = (s) => (D.settings.language === "ru" ? russianStrings[s] || s : s),
  act = (fn) => {
    const id = "a" + ++counter;
    actions[id] = fn;
    return id;
  },
  inp = (fn) => {
    const id = "i" + ++counter;
    inputs[id] = fn;
    return id;
  };
export const B = (label, fn, cls = "", attrs = "") =>
  `<button class="${cls}" data-action="${act(fn)}" ${attrs}>${t(label)}</button>`;
export const IB = (icon, label, fn) =>
  B(I(icon), fn, "icon-button", `aria-label="${esc(t(label))}" title="${esc(t(label))}"`);
export const badge = (x, small = false) =>
  `<span class="badge${small ? " small" : ""}" style="--c:${esc(x?.color || "#777")}">${I(x?.icon || "wallet")}</span>`;
export const txt = (label, value, fn, placeholder = "", type = "text") =>
  `<label class="field"><span class="field-label">${t(label)}</span><input aria-label="${esc(t(label))}" type="${type}" value="${esc(value)}" placeholder="${esc(t(placeholder))}" data-input="${inp(fn)}"></label>`;
function select(label, value, options, fn) {
  return `<label class="field"><span class="field-label">${t(label)}</span><select aria-label="${esc(t(label))}" data-input="${inp(fn)}">${options
    .map((o) => {
      let [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${v == value ? "selected" : ""}>${esc(t(l))}</option>`;
    })
    .join("")}</select></label>`;
}
export const field = (label, value, fn, hint = "") =>
  B(
    `<span class="field-label">${t(label)}</span><span class="value">${value}</span>${hint ? `<span class="hint">${t(hint)}</span>` : ""}`,
    fn,
    "field",
    `aria-label="${esc(t(label))}"`,
  );
export const toggle = (label, on, fn, hint = "") =>
  B(
    `<span class="grow"><span>${t(label)}</span>${hint ? `<small class="hint">${t(hint)}</small>` : ""}</span><span class="toggle ${on ? "on" : ""}"></span>`,
    fn,
    "field inline",
    `role="switch" aria-checked="${!!on}" aria-label="${esc(t(label))}"`,
  );
export const row = (label, icon, fn, sub = "", end = "") =>
  B(
    `${icon ? I(icon, 22) : ""}<span class="grow"><span class="title">${t(label)}</span>${sub ? `<span class="sub" style="display:block">${t(sub)}</span>` : ""}</span>${end || '<span class="chevron">›</span>'}`,
    fn,
    "row",
    `aria-label="${esc(t(label))}"`,
  );
export function toast(s) {
  if (window.__MONIVRA_TEST__) {
    window.__toast = s;
    return;
  }
  const el = document.getElementById("toast");
  el.textContent = t(s);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1450);
}
export function setActions(value) {
  actions = value;
  return value;
}

export function setInputs(value) {
  inputs = value;
  return value;
}

export function setCounter(value) {
  counter = value;
  return value;
}

export function setPhotoCallback(value) {
  photoCallback = value;
  return value;
}

export function setImportKind(value) {
  importKind = value;
  return value;
}

export function setLocked(value) {
  locked = value;
  return value;
}

export function setPinEntry(value) {
  pinEntry = value;
  return value;
}
