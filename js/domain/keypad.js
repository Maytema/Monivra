/* Shared rules of every calculator keypad: digit order and editing of the typed expression */
import { appData } from "../core/state.js";
import { evaluateExpression } from "./finance.js";

// Digits of the three upper rows, in the order chosen in settings.
export function keypadDigits() {
  return appData.settings.reverseKeys
    ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    : ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
}

// Expression after one key press. `fresh` starts a new expression (after a result);
// "=" evaluates and throws when the expression is invalid.
export function typeKey(expr, key, fresh = false) {
  if (key === "⌫") return String(expr).slice(0, -1) || "0";
  if (key === "C") return "0";
  if (key === "=") return String(evaluateExpression(expr) / 100);
  const base = fresh ? "0" : String(expr);
  return (base === "0" && /[0-9]/.test(key) ? "" : base) + key;
}
