/* Progress of a goal or a debt repayment: percent, meter and the block in the account sheet */
import { accountProgress, debtDirection, formatMoney } from "../../domain/finance.js";
import { translate, translateWith } from "../../i18n/index.js";
import { percentLabel } from "../../ui/percent.js";
import { meterHtml } from "../../ui/primitives.js";

// A debt I still have to pay back is shown in a soft red, everything else in green.
export const isOwed = (p, a) => p.kind === "debt" && p.left > 0 && debtDirection(a) === "I owe";

export const accountMeter = (p, a, cls) => meterHtml(p.percent, isOwed(p, a), cls);

// Target, progress meter and what is left, shown in the account sheet.
export function progressBlockHtml(a) {
  const p = accountProgress(a);
  if (!p) return "";
  const money = (n) => formatMoney(n, a.currency);
  const say = (text, amount) => translateWith(text, { amount: money(amount) });
  // The card already shows the balance, so the line under the meter adds what the balance does
  // not say: what is left of a goal, how much of a debt is paid, that a limit is used up.
  let status;
  if (p.kind === "limit") {
    // The sheet shows the balance and what is available to spend, so only the extremes are said.
    if (p.used > p.target) status = say("Limit exceeded by {amount}", p.used - p.target);
    else if (p.left === 0) status = translate("Limit reached");
  } else if (p.kind === "debt")
    status = p.left > 0 ? say("Paid back: {amount}", p.done) : translate("Debt repaid");
  else if (p.left > 0) status = say("To goal: {amount}", p.left);
  else if (p.left < 0) status = say("Goal exceeded by {amount}", -p.left);
  else status = translate("Goal reached");
  const title = { goal: "Goal", debt: "Total debt", limit: "Limit" }[p.kind];
  return `<div class="account-progress ${isOwed(p, a) ? "owed" : ""}"><div class="account-progress-line"><span>${translate(title)} ${money(p.target)}</span><span class="account-progress-percent">${percentLabel(p.percent)}</span></div>${accountMeter(p, a, "sheet-meter")}${status ? `<div class="account-progress-left">${status}</div>` : ""}</div>`;
}
