/* Printable report (saved as PDF from the print dialog) of the operations in the chosen period */
import { escapeHtml } from "../core/constants.js";
import { isTestMode } from "../core/test-mode.js";
import {
  accountById,
  categoryById,
  dateLabel,
  formatMoney,
  periodTitle,
  totalByType,
  visibleOperations,
} from "../domain/finance.js";
import { translate, translateMarkup } from "../i18n/index.js";

// Category name with its parent: "Food / Market".
const categoryPath = (id) => {
  const c = categoryById(id);
  return c?.parent ? `${categoryById(c.parent)?.name} / ${c.name}` : c?.name;
};

// What the operation is about: its category, or the kind of operation.
const subject = (o) =>
  o.type === "transfer"
    ? translate("Transfer")
    : o.type === "adjustment"
      ? translate("Adjustment")
      : categoryPath(o.category) || translate("Category");

// Accounts the money moved between.
const accountsOf = (o) =>
  o.type === "transfer"
    ? `${accountById(o.from)?.name} → ${accountById(o.to)?.name}`
    : accountById(o.from || o.to)?.name;

// Signed amount in the currency of the account it was paid from or received on.
function amountCell(o) {
  const incoming = o.type === "income" || (o.type === "adjustment" && o.to);
  const outgoing = o.type === "expense" || (o.type === "adjustment" && o.from);
  const account = accountById(o.from || o.to);
  const money = formatMoney(incoming ? (o.receive ?? o.amount) : o.amount, account?.currency);
  const cls = incoming ? "in" : outgoing ? "out" : "";
  return `<td class="amount ${cls}">${incoming ? "+" : outgoing ? "−" : ""}${money}</td>`;
}

const row = (o) =>
  `<tr><td class="date">${escapeHtml(dateLabel(o.date, true))}</td><td>${escapeHtml(subject(o))}${
    o.tags?.length ? `<small>${escapeHtml(o.tags.join(", "))}</small>` : ""
  }</td><td>${escapeHtml(accountsOf(o))}</td><td>${escapeHtml(o.comment)}</td>${amountCell(o)}</tr>`;

// Open the print dialog with the report of the visible operations.
export function printReport() {
  const income = totalByType("income"),
    expense = totalByType("expense");
  const out = translateMarkup(
    `<h1>Monivra · ${translate("Report")}</h1><p class="period">${escapeHtml(periodTitle())}</p><div class="totals"><span>${translate("Income")}<b class="in">${formatMoney(income)}</b></span><span>${translate("Expenses")}<b class="out">${formatMoney(expense)}</b></span><span>${translate("Cash flow")}<b>${formatMoney(income - expense)}</b></span></div><table><thead><tr><th>Date</th><th>Category</th><th>Account</th><th>Comment</th><th class="amount">Amount</th></tr></thead><tbody>${visibleOperations().map(row).join("")}</tbody></table>`,
  );
  if (isTestMode()) {
    window.__print = out;
    return;
  }
  document.getElementById("printout").innerHTML = out;
  window.print();
}
