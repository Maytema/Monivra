/* The whole operation editor sheet */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { dateLabel, parseDate, toIsoDate } from "../../domain/finance.js";
import { calendar } from "../../ui/calendar.js";
import { buttonHtml, iconButtonHtml } from "../../ui/primitives.js";
import { feeBlockHtml } from "../fees.js";
import { compactActionsHtml } from "./actions.js";
import { amountHtml, amountModel } from "./amount.js";
import { leaveCompactWhenChanged } from "./editor.js";
import { extrasHtml } from "./extras.js";
import { keypadHtml } from "./keypad.js";
import { describeParties, partiesHtml } from "./parties.js";

const DAY_MS = 86400000;

function dateRowHtml(draft) {
  const shiftDay = (days) => {
    draft.date = toIsoDate(new Date(parseDate(draft.date).getTime() + days * DAY_MS));
    render();
  };
  const pickDate = () =>
    calendar(draft.date, (value) => {
      draft.date = value;
      render();
    });
  return `<div class="calc-date">${iconButtonHtml("left", "Previous day", () => shiftDay(-1))}${buttonHtml(
    iconSvg("calendar", 16) + " " + escapeHtml(dateLabel(draft.date, true)),
    pickDate,
    "calc-date-label",
  )}${iconButtonHtml("right", "Next day", () => shiftDay(1))}</div>`;
}

// The whole editor: date, parties, amount, extras and fees above; the keypad or, for an opened
// operation, its actions below. `duplicate` starts a new editor from a copy.
export function editorHtml(editor, duplicate) {
  leaveCompactWhenChanged(editor);
  const { draft } = editor;
  const parties = describeParties(draft);
  const model = amountModel(editor, parties);
  const { dual, secondary, accountCurrency } = parties;
  const expandHint = editor.compact
    ? `<div class="ops-tap-to-edit">${buttonHtml("Click on the value to edit", () => {
        editor.compact = false;
        render();
      })}</div>`
    : "";
  const fees = feeBlockHtml(
    draft,
    model.sentAmount(),
    accountCurrency,
    dual ? secondary.currency : accountCurrency,
    dual ? model.sourceToReceive : (cents) => cents,
    render,
  );
  return `<div class="calc-shell ${editor.compact ? "ops-compact-editor" : ""}"><div class="calc-top">${dateRowHtml(draft)}${partiesHtml(draft, parties)}${amountHtml(editor, parties, model)}${expandHint}${extrasHtml(draft)}${fees}</div>${
    editor.compact ? compactActionsHtml(editor, duplicate) : keypadHtml(editor, parties, model)
  }</div>`;
}
