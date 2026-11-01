/* Progress of a goal or a debt repayment: percent, meter and the block in the account sheet */
import { accountProgress, debtDirection, formatMoney } from "../../domain/finance.js";
import { translate, translateWith } from "../../i18n/index.js";
import { meterHtml } from "../../ui/primitives.js";

// Percent with up to two decimals, the digits after the point set smaller.
export function percentLabel(percent) {
  const parts = percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").split(".");
  return `<span class="goal-pct-main">${parts[0]}</span>${parts[1] ? `<span class="goal-pct-frac">.${parts[1]}</span>` : ""}<span class="goal-pct-unit">%</span>`;
}

// A debt I still have to pay back is shown in a soft red, everything else in green.
export const isOwed = (p, a) => p.kind === "debt" && p.left > 0 && debtDirection(a) === "I owe";

export const accountMeter = (p, a, cls) => meterHtml(p.percent, isOwed(p, a), cls);

// Target, progress meter and what is left, shown in the account sheet.
export function progressBlockHtml(a) {
  const p = accountProgress(a);
  if (!p) return "";
  const money = (n) => formatMoney(n, a.currency);
  const say = (text, amount) => translateWith(text, { amount: money(amount) });
  let status;
  if (p.kind === "limit") status = say("Used: {amount}", p.used);
  else if (p.kind === "debt")
    status = p.left > 0 ? say("Left to repay: {amount}", p.left) : translate("Debt repaid");
  else if (p.left > 0) status = say("Left: {amount}", p.left);
  else if (p.left < 0) status = say("Goal exceeded by {amount}", -p.left);
  else status = translate("Goal reached");
  const title = { goal: "Goal", debt: "Total debt", limit: "Limit" }[p.kind];
  return `<div class="account-progress ${isOwed(p, a) ? "owed" : ""}"><div class="account-progress-line"><span>${translate(title)} ${money(p.target)}</span><span class="account-progress-percent">${percentLabel(p.percent)}</span></div>${accountMeter(p, a, "sheet-meter")}${status ? `<div class="account-progress-left">${status}</div>` : ""}</div>`;
}
