/* Scheduled payments that came due are posted on their own; the person is told afterwards */
import { render } from "../app/shell.js";
import { iconSvg } from "../core/constants.js";
import { uiState } from "../core/state.js";
import { dateLabel } from "../domain/finance.js";
import { missedPayments, postDue, settleMissed } from "../domain/scheduled.js";
import { translate, translateCount, translateWith } from "../i18n/index.js";
import { confirmAction } from "../ui/dialogs.js";
import { buttonHtml, iconButtonHtml } from "../ui/primitives.js";
import { operationTitle } from "./operation-title.js";
import { showOperations } from "./operations/reveal.js";

// Post what came due; the operations are remembered until the person has seen them. Returns how
// many were posted.
export function postDuePayments() {
  const posted = postDue();
  uiState.paymentsPosted.push(...posted);
  return posted.length;
}

// Ask about the payments that are far behind, one at a time: add what was missed to the operations,
// or skip it and carry on from the next occurrence. Until answered, a payment stays as it is.
export function askAboutMissed() {
  if (asking) return;
  const [entry] = missedPayments();
  if (!entry) return;
  const { item, count, since } = entry;
  const answer = (post) => {
    asking = false;
    uiState.paymentsPosted.push(...settleMissed(item.id, post));
    render();
    askAboutMissed();
  };
  asking = true;
  confirmAction(
    translateWith(
      "“{name}” has not been added since {date} (payments: {n}). Add them to the operations?",
      { name: translate(operationTitle(item)), date: dateLabel(since), n: count },
    ),
    () => answer(true),
    false,
    "Add",
    { title: "Missed payments", tone: "info", cancel: { label: "Skip", fn: () => answer(false) } },
  );
}
let asking = false;

// After a scheduled payment was saved: what is due is posted at once, and what is far behind is
// asked about. Returns the ids of the operations posted.
export function settleDueNow() {
  const posted = postDue();
  askAboutMissed();
  return posted;
}

// The notice is read: it goes away, and the tap that read it can go on to the operations.
function dismiss() {
  uiState.paymentsPosted = [];
  render();
}

// Notice on the main tabs: how many payments were posted; a tap shows them among the operations.
export function postedNoticeHtml() {
  const n = uiState.paymentsPosted.length;
  if (!n) return "";
  const text = translateCount(
    "{n} scheduled payment was added to the operations. Tap to view.",
    "{n} scheduled payments were added to the operations. Tap to view.",
    n,
  );
  const open = () => {
    const ids = uiState.paymentsPosted;
    uiState.paymentsPosted = [];
    showOperations(ids);
  };
  return `<div class="hint-banner">${buttonHtml(`${iconSvg("bell", 20)}<span class="grow">${text}</span>`, open, "hint-text")}${iconButtonHtml("close", "Dismiss", dismiss)}</div>`;
}
