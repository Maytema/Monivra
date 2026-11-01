/* Keypad of the editor and the sheet with additional options */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg, timeNow } from "../../core/constants.js";
import { accountBalance, accountById } from "../../domain/finance.js";
import { keypadDigits } from "../../domain/keypad.js";
import { translate } from "../../i18n/index.js";
import { currencyPicker } from "../../ui/currency-picker.js";
import { timeLabel, timePicker } from "../../ui/time-picker.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { buttonHtml, menuRowHtml, toast } from "../../ui/primitives.js";
import { feeDialog, feeLabel } from "../fees.js";
import { recurLabel, recurrence, remainingLabel, reminder, reminderLabel } from "../recurrence.js";
import { commitOperation } from "./editor.js";

// A tap on the calculator key within this time of the previous one is a double tap.
const DOUBLE_TAP_MS = 340;
const MENU_DELAY_MS = 350;

const digits = keypadDigits();
const LAYOUT = [
  "÷",
  ...digits.slice(0, 3),
  "⌫",
  "×",
  ...digits.slice(3, 6),
  "mode",
  "−",
  ...digits.slice(6, 9),
  "✓",
  "+",
  "currency",
  "0",
  ".",
];

// Everything the keypad cannot show: the whole balance, reminder, recurrence, tax and commission.
function additionalOptions(editor, model) {
  const { draft } = editor;
  const fillMax = () => {
    const account = accountById(draft.from);
    if (!account) return toast("Select sender account");
    const available = Math.max(
      0,
      accountBalance(account.id) + (account.type === "Regular" ? account.limit || 0 : 0),
    );
    if (!available) return toast("No available balance");
    model.fill(available);
    closeLayers();
    render();
  };
  openSheet(
    () =>
      `<h2>Additionally</h2>${menuRowHtml("Fill max", "wallet", fillMax, "Use full sender account balance")}${
        editor.scheduled
          ? menuRowHtml(
              "Time",
              "clock",
              () =>
                timePicker(draft.time || timeNow(), (time) => {
                  draft.time = time;
                  render();
                }),
              timeLabel(draft.time || timeNow()),
            )
          : ""
      }${menuRowHtml("Reminder", "bell", () => reminder(draft), draft.reminder ? reminderLabel(draft.reminder) : "Turned off")}${menuRowHtml("Recur", "repeat", () => recurrence(draft), draft.recur ? recurLabel(draft.recur) + remainingLabel(draft.recur) : "Turned off")}${menuRowHtml("Tax", "receipt", () => feeDialog(draft, "tax", render), feeLabel(draft, "tax"))}${menuRowHtml("Commission", "percent", () => feeDialog(draft, "commission", render), feeLabel(draft, "commission"))}`,
    "Additionally",
  );
}

// One tap opens the additional options, two quick taps switch the calculator.
function tapModeKey(editor, model) {
  const now = Date.now();
  clearTimeout(editor.modeMenuTimer);
  if (editor.lastModeTap && now - editor.lastModeTap < DOUBLE_TAP_MS) {
    editor.lastModeTap = 0;
    model.toggleCalculator();
    return;
  }
  editor.lastModeTap = now;
  editor.modeMenuTimer = setTimeout(() => {
    editor.lastModeTap = 0;
    additionalOptions(editor, model);
  }, MENU_DELAY_MS);
}

function confirmKeyHtml(editor, model) {
  if (!editor.calculatorOn)
    return buttonHtml(
      iconSvg("check", 30),
      () => commitOperation(editor),
      "calc-key calc-confirm",
      'aria-label="Save operation"',
    );
  return editor.resultReady
    ? buttonHtml(
        iconSvg("check", 30),
        model.saveCalculated,
        "calc-key calc-confirm",
        'aria-label="Save operation with calculated result"',
      )
    : buttonHtml(
        '<span class="calc-equals">=</span>',
        () => model.press("="),
        "calc-key calc-confirm",
        'aria-label="Calculate equals without saving"',
      );
}

function currencyKeyHtml(editor, parties) {
  const { canPickCurrency, currency, accountCurrency } = parties;
  if (!canPickCurrency) return `<div class="calc-currency calc-key">${escapeHtml(currency)}</div>`;
  const choose = () =>
    currencyPicker(currency, (id) => {
      editor.draft.entryCurrency = id === accountCurrency ? undefined : id;
      render();
    });
  return buttonHtml(
    escapeHtml(currency),
    choose,
    "calc-currency calc-key",
    `aria-label="${translate("Currency")}"`,
  );
}

function modeKeyHtml(editor, model) {
  const on = editor.calculatorOn;
  return buttonHtml(
    `${iconSvg("calculator", 26)}<span class="mode-indicator ${on ? "is-active" : ""}" aria-hidden="true"></span>`,
    () => tapModeKey(editor, model),
    `calc-key calc-toggle${on ? " is-on" : ""}`,
    `aria-label="Additionally" aria-pressed="${on}" title="${translate("Tap: more options. Double tap: calculator")}"`,
  );
}

export function keypadHtml(editor, parties, model) {
  const keyHtml = (key) => {
    if (key === "✓") return confirmKeyHtml(editor, model);
    if (key === "currency") return currencyKeyHtml(editor, parties);
    if (key === "mode") return modeKeyHtml(editor, model);
    return buttonHtml(key, () => model.press(key), `calc-key ${key === "⌫" ? "calc-delete" : ""}`);
  };
  return `<div class="calc-keypad">${LAYOUT.map(keyHtml).join("")}</div>`;
}
