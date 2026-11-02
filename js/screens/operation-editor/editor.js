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
import { openPage } from "../../ui/navigation.js";
import { spotlight } from "../../ui/spotlight.js";
import { settleDueNow } from "../due-payments.js";
import { operationShown, showOperations } from "../operations/reveal.js";
import { notice, toast } from "../../ui/primitives.js";

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

// The list of scheduled payments, where a notice about a new one leads.
// The scheduled payments page with the payment just saved flashed.
const showScheduled = (id) => {
  openPage("scheduled");
  spotlight([id]);
};

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
    const saved = putOperation(draft, editor.scheduled);
    const onScheduledPage = uiState.pages.at(-1)?.kind === "scheduled";
    uiState.layers = [];
    // A scheduled payment dated today or earlier is due at once.
    const posted = editor.scheduled ? settleDueNow() : [];
    save();
    render();
    if (posted.length)
      notice("Added to the operations", {
        icon: "circleCheck",
        tone: "positive",
        onTap: () => showOperations(posted),
      });
    else if (planned) {
      // It is not in the history but among the scheduled payments: that is worth a longer look.
      // On the scheduled payments themselves the flash of the new row says it.
      if (onScheduledPage) spotlight([saved.id]);
      else
        notice("Payment scheduled", {
          icon: "calendar",
          tone: "accent",
          level: "important",
          detail: translateWith("Will be added on {date}", { date: dateLabel(saved.date) }),
          onTap: () => showScheduled(saved.id),
        });
    } else if (operationShown(saved)) spotlight([saved.id]);
    // Where the operation is not shown, a quiet notice leads to it.
    else
      notice("Operation saved", {
        icon: "circleCheck",
        tone: "positive",
        onTap: () => showOperations([saved.id]),
      });
  } catch (e) {
    toast(e.message);
  }
}

// An opened operation shows its keypad with the check as soon as something was changed.
export function leaveCompactWhenChanged(editor) {
  if (editor.compact && JSON.stringify(editor.draft) !== editor.snapshot) editor.compact = false;
}
