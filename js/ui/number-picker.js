/* Pickers for amounts and numbers with an on-screen keypad */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import { evaluateExpression } from "../domain/finance.js";
import { keypadDigits, typeKey } from "../domain/keypad.js";
import { translate } from "../i18n/index.js";
import { buttonHtml, toast } from "./primitives.js";
import { closeLayers, openSheet } from "./navigation.js";

// Sheet with a calculator keypad for entering an amount: the typed expression is shown
// at the top, "=" replaces the check mark while an operation is waiting to be calculated.
export function amountPicker(title, value, fn, allowNegative = false, currency = "") {
  let expr = String(value / 100);
  // The first digit typed over a shown value starts a new number; an operator continues it.
  let fresh = value !== 0;
  const unit = currency || appData.settings.currency;
  openSheet(
    () =>
      `<div class="calc-readout" aria-live="polite" aria-label="${translate("Amount")}">${escapeHtml(
        expr.replace(/[\d.]+/g, (n) => `${n} ${unit}`).replace(/[÷×−+]/g, " $& "),
      )}</div>${calculatorKeys(
        () => expr,
        (v) => (expr = v),
        () => {
          const was = fresh;
          fresh = false;
          return was;
        },
        () => {
          try {
            const n = evaluateExpression(expr);
            if (n < 0 && !allowNegative) throw Error("Use a non-negative amount");
            closeLayers();
            fn(n);
          } catch (e) {
            toast(e.message);
          }
        },
      )}`,
    title,
  );
}
// Digit keypad of the number sheet: the digits and a backspace
// in four columns, the tall confirm key at the right, the zero filling the last row
// (next to the dot when decimals are allowed; the dot is off once the number has one).
export function digitPadHtml(press, confirm, decimal, text = "") {
  const digits = keypadDigits();
  const digit = (i) => buttonHtml(digits[i], () => press(digits[i]), "key");
  return `<div class="keypad digit-pad ${decimal ? "has-dot" : ""}">${digit(0)}${digit(1)}${digit(2)}${buttonHtml(
    iconSvg("backspace", 26),
    () => press("⌫"),
    "key",
    `aria-label="${translate("Backspace")}"`,
  )}${digit(3)}${digit(4)}${digit(5)}${buttonHtml(
    iconSvg("check", 30),
    confirm,
    "key ok",
    `aria-label="${translate("Save")}"`,
  )}${digit(6)}${digit(7)}${digit(8)}${buttonHtml("0", () => press("0"), "key zero-wide")}${
    decimal ? buttonHtml(".", () => press("."), "key", text.includes(".") ? "disabled" : "") : ""
  }</div>`;
}
// The text after a key of the digit keypad; `maxLength` limits the digits.
function typeDigit(text, key, { decimal = false, maxLength = 12 }, fresh = false) {
  const base = fresh ? "" : text;
  if (key === "⌫") return base.slice(0, -1);
  if (key === "." && (!decimal || base.includes("."))) return base;
  if (base.length >= maxLength) return base;
  return base + (key === "." && !base ? "0." : key);
}
// Sheet with a digit keypad for a plain number (a day, an exchange rate).
// `fn` gets the typed text; returning false keeps the sheet open.
export function numberPicker(title, value, fn, options = {}) {
  let text = value === null || value === undefined ? "" : String(value);
  let fresh = text !== "";
  const press = (k) => {
    text = typeDigit(text, k, options, fresh && k !== "⌫");
    fresh = false;
    render();
  };
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><div class="number-display" aria-live="polite">${escapeHtml(options.mask ? "•".repeat(text.length) : text) || "&nbsp;"}</div>${digitPadHtml(
        press,
        () => {
          if (fn(text) !== false) closeLayers();
        },
        options.decimal,
        text,
      )}`,
    title,
  );
}
// Form field that shows a number; tapping it opens the digit keypad sheet.
export const numberFieldHtml = (label, value, fn, options = {}) => {
  const text = value === null || value === undefined ? "" : String(value);
  const shown = options.mask ? "•".repeat(text.length) : text;
  return buttonHtml(
    `<span class="field-label">${translate(label)}</span><span class="value">${escapeHtml(shown) || (options.hint ? "" : "—")}${!shown && options.hint ? `<small class="field-hint">${translate(options.hint)}</small>` : ""}</span>`,
    () => numberPicker(label, value, fn, options),
    "field",
    `aria-label="${escapeHtml(translate(label))}"`,
  );
};
// Calculator keypad shared by all amount inputs. The operators stand in the first column,
// the digits in the middle, the backspace and the tall confirm key at the right.
function calculatorKeys(get, set, takeFresh, done) {
  const press = (k) => {
    try {
      const startsNumber = takeFresh() && /^[\d.]$/.test(k);
      set(typeKey(get(), k, startsNumber));
    } catch (e) {
      toast(e.message);
    }
    render();
  };
  const digits = keypadDigits();
  const pending = /\d[÷×−+]/.test(get());
  const key = (label, fn, cls = "", attrs = "") =>
    buttonHtml(label, fn, `key ${cls}`.trim(), attrs);
  const digit = (i) => key(digits[i], () => press(digits[i]));
  const op = (symbol) => key(symbol, () => press(symbol), "calc-op");
  // Placed row by row; the confirm key spans the three lower rows of the last column.
  return `<div class="keypad calc-pad">${op("÷")}${digit(0)}${digit(1)}${digit(2)}${key(
    iconSvg("backspace", 26),
    () => press("⌫"),
    "",
    `aria-label="${translate("Backspace")}"`,
  )}${op("×")}${digit(3)}${digit(4)}${digit(5)}${key(
    pending ? "=" : iconSvg("check", 30),
    pending ? () => press("=") : done,
    "ok",
    `aria-label="${translate(pending ? "Calculate" : "Save")}"`,
  )}${op("−")}${digit(6)}${digit(7)}${digit(8)}${op("+")}${key("0", () => press("0"), "calc-zero")}${key(".", () => press("."), "", /\.\d*$/.test(get()) ? "disabled" : "")}</div>`;
}
