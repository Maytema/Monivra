/* Tax and commission: menu labels, edit dialog, chips under the calculator */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import { applyFees, feeOfKind, setFee } from "../domain/fees.js";
import { accountById, formatMoney } from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { closeLayers, numberFieldHtml, openSheet } from "../ui/kit.js";
import { buttonHtml, iconButtonHtml, toggleRowHtml } from "../ui/primitives.js";

const KIND_TITLES = { tax: "Add tax", commission: "Add commission" };

// Sign and size of a fee, e.g. "−5 %" or "+2".
function feeSizeLabel(fee) {
  const size = fee.percent > 0 ? fee.percent + " %" : String(fee.value);
  return (fee.add ? "+" : "−") + size;
}

// Name of a fee with its size: "Tax (−1.5 %)".
export const feeTitle = (fee) =>
  `${translate(fee.kind === "tax" ? "Tax" : "Commission")} (${feeSizeLabel(fee)})`;

// Lines under an operation with fees: every fee, then what is left for the account.
export function feeLinesHtml(op) {
  const { steps, net } = applyFees(op.amount, op.fees);
  const account = accountById(op.from || op.to);
  const currency = account?.currency;
  const line = (icon, title, amount, tone = "") =>
    `<div class="detail-line">${icon}<span class="grow">${title}</span><span class="${tone}">${formatMoney(amount, currency)}</span></div>`;
  return `<div class="detail-lines fee-lines">${steps
    .map(({ fee, delta }) =>
      line(
        iconSvg("link", 18),
        escapeHtml(feeTitle(fee)),
        Math.abs(delta),
        delta < 0 ? "neg" : "pos",
      ),
    )
    .join(
      "",
    )}${line(iconSvg(account?.icon || "wallet", 18), translate("Operation"), net, "muted")}</div>`;
}

// Short description shown under the menu row; "Turned off" when nothing is set.
export function feeLabel(op, kind) {
  const fee = feeOfKind(op, kind);
  return fee ? feeSizeLabel(fee) : "Turned off";
}

// Dialog with a percent or a fixed value for one kind of fee.
export function feeDialog(op, kind, onDone) {
  const current = feeOfKind(op, kind);
  const draft = {
    percent: current?.percent || "",
    value: current?.value || "",
    add: !!current?.add,
  };
  openSheet(
    () =>
      `<h2>${translate(KIND_TITLES[kind])}</h2>${numberFieldHtml(
        "Percent",
        draft.percent,
        (v) => {
          draft.percent = v;
          draft.value = "";
          render();
        },
        { decimal: true },
      )}<p class="dialog-or">${translate("Or")}</p>${numberFieldHtml(
        "Value",
        draft.value,
        (v) => {
          draft.value = v;
          draft.percent = "";
          render();
        },
        { decimal: true },
      )}${toggleRowHtml("Subtract from operation", !draft.add, () => {
        draft.add = false;
        render();
      })}${toggleRowHtml("Add to operation", draft.add, () => {
        draft.add = true;
        render();
      })}<div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          const percent = Number(draft.percent),
            value = Number(draft.value);
          setFee(op, kind, percent > 0 || value > 0 ? { percent, value, add: draft.add } : null);
          closeLayers();
          onDone();
        },
        "primary",
      )}</div>`,
    KIND_TITLES[kind],
    "dialog",
  );
}

// Explanation shown by the question mark next to the result line.
function resultHelp() {
  openSheet(
    () =>
      `<h2>${translate("Result")}</h2><p>${translate("Fees are applied one after another, in the order shown. The sender account is charged the full amount; the receiver gets the result.")}</p><div class="dialog-actions">${buttonHtml("OK", () => closeLayers(), "primary")}</div>`,
    "Result",
    "dialog",
  );
}

// Fee chips and the result line shown under the calculator tools.
export function feeBlockHtml(op, amount, fromCurrency, toCurrency, convert, onChange) {
  const fees = op.fees || [];
  if (!fees.length || !(amount > 0)) return "";
  const { steps, net } = applyFees(amount, fees);
  const swapFirstTwo = () => {
    [fees[0], fees[1]] = [fees[1], fees[0]];
    onChange();
  };
  const chips = steps
    .map(
      ({ fee, delta }) =>
        `<div class="fee-chip">${buttonHtml(
          `${translate(fee.kind === "tax" ? "Tax" : "Commission")} (${feeSizeLabel(fee)}): ${formatMoney(delta, fromCurrency)}`,
          () => feeDialog(op, fee.kind, onChange),
          "fee-chip-label",
        )}${
          steps.length > 1 ? iconButtonHtml("swap", "Change order", swapFirstTwo) : ""
        }${iconButtonHtml("close", "Remove", () => {
          setFee(op, fee.kind, null);
          onChange();
        })}</div>`,
    )
    .join("");
  return `<div class="fee-block">${chips}<div class="fee-result"><span>${translate("Result (from -> to)")}:<br>${formatMoney(amount, fromCurrency)} -&gt; ${formatMoney(convert(net), toCurrency)}</span>${iconButtonHtml("help", "Help", resultHelp)}</div></div>`;
}
