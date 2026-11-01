/* Scheduled payments that came due are posted on their own; the person is told afterwards */
import { render } from "../app/shell.js";
import { iconSvg } from "../core/constants.js";
import { uiState } from "../core/state.js";
import { postDue } from "../domain/scheduled.js";
import { translateCount } from "../i18n/index.js";
import { goHome } from "../ui/navigation.js";
import { buttonHtml, iconButtonHtml } from "../ui/primitives.js";

// Post what came due; the count is kept until the person has seen it. Returns how many were posted.
export function postDuePayments() {
  const posted = postDue();
  uiState.paymentsPosted += posted;
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
