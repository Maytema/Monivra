/* Printable report (saved as PDF from the print dialog) of the operations in the chosen period */
import { APP_NAME, escapeHtml } from "../core/constants.js";
import { appData } from "../core/state.js";
import { printHtml } from "../platform/files.js";
import {
  accountBalance,
  accountById,
  categoryById,
  dateLabel,
  formatMoney,
  periodTitle,
  totalByType,
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

const typeName = {
  expense: "Expenses",
  income: "Incomes",
  transfer: "Transfers",
  adjustment: "Adjustment",
};

// Columns of the operations table: [part it belongs to, heading, cell].
const OPERATION_COLUMNS = [
  [null, "Date", (o) => `<td class="date">${escapeHtml(dateLabel(o.date, true))}</td>`],
  ["type", "Type", (o) => `<td>${escapeHtml(translate(typeName[o.type]))}</td>`],
  [
    "accounts",
    "Category",
    (o) => `<td>${escapeHtml(subject(o))}<small>${escapeHtml(accountsOf(o) ?? "")}</small></td>`,
  ],
  ["comment", "Comment", (o) => `<td>${escapeHtml(o.comment)}</td>`],
  ["tags", "Tags", (o) => `<td>${escapeHtml((o.tags || []).join(", "))}</td>`],
  ["amount", "Amount", amountCell],
];

// Table of the operations with the columns the person chose.
function operationsTable(ops, parts) {
  const columns = OPERATION_COLUMNS.filter(([part]) => part === null || parts[part] !== false);
  return `<table><thead><tr>${columns.map(([, heading]) => `<th>${translate(heading)}</th>`).join("")}</tr></thead><tbody>${ops.map((o) => `<tr>${columns.map(([, , cell]) => cell(o)).join("")}</tr>`).join("")}</tbody></table>`;
}

// What an account adds to the report: its balance, goal (savings) and who owes whom (debts).
const ACCOUNT_COLUMNS = [
  ["balance", "Balance", (a) => formatMoney(accountBalance(a.id), a.currency)],
  ["goal", "Goal", (a) => (a.type === "Savings" ? formatMoney(a.goal, a.currency) : "")],
  ["debt", "Debt", (a) => (a.type === "Debt" ? translate(a.debt) : "")],
];

// Table of the accounts with the details the person chose.
function accountsTable(parts) {
  const columns = ACCOUNT_COLUMNS.filter(([part]) => parts[part] !== false);
  return `<table><thead><tr><th>${translate("Account")}</th>${columns.map(([, heading]) => `<th>${translate(heading)}</th>`).join("")}</tr></thead><tbody>${appData.accounts
    .filter((a) => !a.archived)
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.name)}</td>${columns.map(([, , cell]) => `<td>${escapeHtml(cell(a))}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

// Open the print dialog with the report: `ops` are the operations to list, `sections` tell what
// the report holds ({ operations, accounts }) and `parts` which details of each are written.
export function printReport({ ops, sections, parts }) {
  const income = totalByType("income", ops),
    expense = totalByType("expense", ops);
  const operations = sections.operations
    ? `<div class="totals"><span>${translate("Income")}<b class="in">${formatMoney(income)}</b></span><span>${translate("Expenses")}<b class="out">${formatMoney(expense)}</b></span><span>${translate("Cash flow")}<b>${formatMoney(income - expense)}</b></span></div>${operationsTable(ops, parts)}`
    : "";
  const accounts = sections.accounts ? accountsTable(parts) : "";
  printHtml(
    translateMarkup(
      `<h1>${APP_NAME} · ${translate("Report")}</h1><p class="period">${escapeHtml(periodTitle())}</p>${operations}${accounts}`,
    ),
  );
}
