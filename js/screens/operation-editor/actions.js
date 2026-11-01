import { render } from "../../app/shell.js";
import { deepClone, iconSvg } from "../../core/constants.js";
import { forgetDeleted, uiState } from "../../core/state.js";
import { deleteOperation } from "../../domain/operations.js";
import { processScheduled } from "../../domain/scheduled.js";
import { confirmAction } from "../../ui/dialogs.js";
import { banner, buttonHtml } from "../../ui/primitives.js";

const actionButton = (icon, label, onTap) =>
  buttonHtml(`${iconSvg(icon, 28)}<span>${label}</span>`, onTap);

// What can be done with an operation that is opened: delete, duplicate and, for a payment, skip or add now.
export function compactActionsHtml(editor, duplicate) {
  const { draft, scheduled } = editor;
  const finish = (message, icon, tone) => {
    uiState.layers = [];
    render();
    banner(message, icon, tone);
  };
  const remove = () =>
    confirmAction(
      "Delete this operation?",
      () => {
        deleteOperation(draft.id, scheduled);
        forgetDeleted({ operations: [draft.id] });
        uiState.layers = [];
        render();
      },
      true,
      "Delete",
    );
  const copy = () => {
    const clone = deepClone(draft);
    delete clone.id;
    duplicate(clone, scheduled);
  };
  const skip = () =>
    confirmAction(
      "Skip this occurrence?",
      () => {
        processScheduled(draft.id, false);
        finish("Payment skipped", "circleCross", "negative");
      },
      false,
      "Skip",
    );
  const addNow = () => {
    processScheduled(draft.id, true);
    finish("Payment added", "circleCheck", "positive");
  };
  const payment = scheduled
    ? actionButton("right", "Skip", skip) + actionButton("plus", "Add now", addNow)
    : "";
  return `<div class="ops-compact-actions">${actionButton("trash", "Delete", remove)}${actionButton("copy", "Duplicate", copy)}${payment}</div>`;
}
