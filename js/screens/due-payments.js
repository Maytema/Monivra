/* Scheduled payments that came due are posted on their own; the person is told afterwards */
import { render } from "../app/shell.js";
import { iconSvg } from "../core/constants.js";
import { uiState } from "../core/state.js";
import { dateLabel } from "../domain/finance.js";
import { missedPayments, postDue, settleMissed } from "../domain/scheduled.js";
import { translate, translateCount, translateWith } from "../i18n/index.js";
import { confirmAction } from "../ui/dialogs.js";
import { goHome } from "../ui/navigation.js";
import { buttonHtml, iconButtonHtml } from "../ui/primitives.js";
import { operationTitle } from "./operation-title.js";

// Post what came due; the count is kept until the person has seen it. Returns how many were posted.
export function postDuePayments() {
  const posted = postDue();
  uiState.paymentsPosted += posted;
  return posted;
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
    uiState.paymentsPosted += settleMissed(item.id, post);
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
// asked about. Returns how many were posted.
export function settleDueNow() {
  const posted = postDue();
  askAboutMissed();
  return posted;
}

// The notice is read: it goes away, and the tap that read it can go on to the operations.
function dismiss() {
  uiState.paymentsPosted = 0;
  render();
}

// Notice on the main tabs: how many payments were posted; a tap shows them among the operations.
export function postedNoticeHtml() {
  const n = uiState.paymentsPosted;
  if (!n) return "";
  const text = translateCount(
    "{n} scheduled payment was added to the operations. Tap to view.",
    "{n} scheduled payments were added to the operations. Tap to view.",
    n,
  );
  const open = () => {
    uiState.paymentsPosted = 0;
    goHome("operations");
  };
  return `<div class="hint-banner">${buttonHtml(`${iconSvg("bell", 20)}<span class="grow">${text}</span>`, open, "hint-text")}${iconButtonHtml("close", "Dismiss", dismiss)}</div>`;
}
