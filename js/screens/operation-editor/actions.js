/* Actions of an opened operation: delete, duplicate, skip or add a scheduled payment */
import { render } from "../../app/shell.js";
import { deepClone } from "../../core/constants.js";
import { forgetDeleted, uiState } from "../../core/state.js";
import { deleteOperation, earliestScheduleDate } from "../../domain/operations.js";
import { processScheduled } from "../../domain/scheduled.js";
import { confirmAction } from "../../ui/dialogs.js";
import { actionTileHtml, notice } from "../../ui/primitives.js";

// What can be done with an operation that is opened: delete, duplicate and, for a payment, skip or add now.
export function compactActionsHtml(editor, duplicate) {
  const { draft, scheduled } = editor;
  const finish = (message, icon, tone) => {
    uiState.layers = [];
    render();
    notice(message, { icon, tone });
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
    delete clone.fromSchedule;
    // A copy of a payment that is due or overdue starts on the first day a payment can.
    if (scheduled && clone.date < earliestScheduleDate()) clone.date = earliestScheduleDate();
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
    ? actionTileHtml("close", "Skip", "var(--negative)", skip) +
      actionTileHtml("check", "Add now", "var(--positive)", addNow)
    : "";
  return `<div class="sheet-actions" style="--cols:2" role="group" aria-label="Operation actions">${actionTileHtml("trash", "Delete", "var(--negative)", remove)}${actionTileHtml("copy", "Duplicate", "#c04fd8", copy)}${payment}</div>`;
}
