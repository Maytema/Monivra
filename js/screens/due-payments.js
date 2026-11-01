/* Reminder on the main screens that scheduled payments came due while the app was closed */
import { render } from "../app/shell.js";
import { iconSvg } from "../core/constants.js";
import { dueCount, postDue } from "../domain/scheduled.js";
import { translateCount } from "../i18n/index.js";
import { banner, buttonHtml } from "../ui/primitives.js";

// Tapping the reminder posts what is due to the operations.
function addDue() {
  const posted = postDue();
  render();
  banner(
    translateCount("{n} payment added", "{n} payments added", posted),
    "circleCheck",
    "positive",
  );
}

// The reminder, or nothing when no payment is due.
export function dueBannerHtml() {
  const due = dueCount();
  if (!due) return "";
  const text = translateCount(
    "{n} scheduled payment is due. Tap to add it to the operations.",
    "{n} scheduled payments are due. Tap to add them to the operations.",
    due,
  );
  return `<div class="hint-banner">${buttonHtml(`${iconSvg("bell", 20)}<span class="grow">${text}</span>`, addDue, "hint-text")}</div>`;
}
