/* State of one open operation editor and saving of the operation */
import { render } from "../../app/shell.js";
import { uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import {
  accountById,
  convertCurrency,
  dateLabel,
  evaluateExpression,
} from "../../domain/finance.js";
import { isFarDate, isPlanned, putOperation } from "../../domain/operations.js";
import { translateWith } from "../../i18n/index.js";
import { confirmAction } from "../../ui/dialogs.js";
import { settleDueNow } from "../due-payments.js";
import { banner, toast } from "../../ui/primitives.js";

// The state of one open editor: the operation being edited and how it is being edited.
export function createEditor(draft, scheduled) {
  return {
    draft,
    scheduled,
    editing: Boolean(draft.id),
    // An opened operation first shows its details and actions instead of the keypad.
    compact: Boolean(draft.id),
    // The draft as it was opened: any difference means there is something to save.
    snapshot: JSON.stringify(draft),
    // Calculator mode types into a scratch expression that is applied only when saved.
    calculatorOn: false,
    calculatorExpression: String(draft.expr || "0"),
    resultReady: false,
    // Which of the two amounts of a cross-currency operation the keypad edits.
    activeSide: "send",
    typedReceive: undefined,
    // The side typed last sets the other one.
    leader: "send",
    lastModeTap: 0,
    modeMenuTimer: 0,
  };
}

// An amount typed in another currency is kept as entered and converted to the account's currency.
function applyEntryCurrency(draft) {
  const account = accountById(draft.type === "income" ? draft.to : draft.from);
  const entry = draft.entryCurrency;
  delete draft.entryCurrency;
  delete draft.foreign;
  if (!entry || !account || entry === account.currency) return;
  draft.foreign = { currency: entry, amount: draft.amount };
  draft.amount = convertCurrency(draft.amount, entry, account.currency);
}

export function commitOperation(editor) {
  const { draft } = editor;
  try {
    if (!editor.calculatorOn && /[+×÷−*/]/.test(String(draft.expr).replace(/^-/, "")))
      throw Error("Enable calculator for arithmetic");
    if (draft.type === "transfer" && (!draft.from || !draft.to))
      throw Error("Select both accounts");
    if (draft.type === "adjustment" && !(draft.from || draft.to)) throw Error("Select an account");
    if (!["transfer", "adjustment"].includes(draft.type) && !draft.category)
      throw Error("Select a category");
    draft.amount = evaluateExpression(draft.expr);
    applyEntryCurrency(draft);
    delete draft.accountAction;
    if (editor.confirmedDate !== draft.date && isFarDate(draft.date))
      return confirmAction(
        translateWith("The date {date} is more than a year from today. Save anyway?", {
          date: dateLabel(draft.date),
        }),
        () => {
          editor.confirmedDate = draft.date;
          commitOperation(editor);
        },
        false,
        "Save",
        { title: "Check the date", tone: "info" },
      );
    // A date in the future makes it a scheduled payment, whichever way it was opened.
    const planned = editor.scheduled || isPlanned(draft);
    putOperation(draft, editor.scheduled);
    uiState.layers = [];
    // A scheduled payment dated today or earlier is due at once.
    const posted = editor.scheduled ? settleDueNow() : 0;
    save();
    render();
    if (posted) toast("Added to the operations");
    else if (planned) banner("Payment scheduled", "calendar", "accent");
    else toast("Operation saved");
  } catch (e) {
    toast(e.message);
  }
}

// An opened operation shows its keypad with the check as soon as something was changed.
export function leaveCompactWhenChanged(editor) {
  if (editor.compact && JSON.stringify(editor.draft) !== editor.snapshot) editor.compact = false;
}
