/* Operations as CSV: writing, reading, and turning rows into operations */
import { appData } from "../core/state.js";
import { accountById, categoryById, transferRoles } from "../domain/finance.js";

const COLUMNS = [
  "type",
  "date",
  "amount",
  "currency",
  "from",
  "to",
  "category",
  "comment",
  "tags",
  "to_amount",
  "to_currency",
  "counted_as",
];
// Subcategories are written as "Parent / Sub".
const SEPARATOR = " / ";

// Category name for a CSV cell.
const categoryCell = (id) => {
  const c = categoryById(id);
  return c?.parent ? categoryById(c.parent)?.name + SEPARATOR + c.name : c?.name;
};

// The part of an operation each column tells; the date is always written.
const COLUMN_PART = {
  type: "type",
  amount: "amount",
  currency: "amount",
  from: "accounts",
  to: "accounts",
  category: "accounts",
  comment: "comment",
  tags: "tags",
  to_amount: "amount",
  to_currency: "amount",
  counted_as: "type",
};
// A cell that starts with = + - @ or a tab or return would be taken for a formula by a spreadsheet:
// it is written with a leading apostrophe, which the import takes away again.
const FORMULA_START = /^[=+\-@\t\r]/;
export const protectCell = (s) => (FORMULA_START.test(s) ? `'${s}` : s);
export const unprotectCell = (s) =>
  s.startsWith("'") && FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
const quote = (s) => '"' + protectCell(String(s ?? "")).replace(/"/g, '""') + '"';
const money = (n) => (n / 100).toFixed(2);

// Cells of one operation by column name.
function cellsOf(o) {
  const from = accountById(o.from),
    to = accountById(o.to);
  const crossCurrency = o.type === "transfer" && from?.currency !== to?.currency;
  return {
    type: o.type,
    date: o.date,
    // Income is written as it reached the account, after taxes and commissions.
    amount: money(o.type === "income" ? (o.receive ?? o.amount) : o.amount),
    currency: (from || to)?.currency,
    from: from?.name,
    to: to?.name,
    category: categoryCell(o.category),
    comment: o.comment,
    tags: (o.tags || []).join("|"),
    to_amount: crossCurrency ? money(o.receive) : "",
    to_currency: crossCurrency ? to.currency : "",
    // A transfer to or from a debt account may count as an expense or an income in the reports:
    // the file says so, to be added up the way the reports do. The import ignores this column.
    counted_as: transferRoles(o).expense ? "expense" : transferRoles(o).income ? "income" : "",
  };
}

// The columns and the rows of the file for the operations with the parts chosen in `parts` ({ type,
// accounts, amount, comment, tags }, all by default), as plain text cells.
export function csvTable(ops = appData.ops, parts = {}) {
  const columns = COLUMNS.filter((c) => c === "date" || parts[COLUMN_PART[c]] !== false);
  return {
    columns,
    rows: ops.map((o) => {
      const cells = cellsOf(o);
      return columns.map((c) => String(cells[c] ?? ""));
    }),
  };
}

// CSV text of the operations with the parts chosen; written with all parts it can be read back by
// the import (More > Data > Import data).
export function csvText(ops = appData.ops, parts = {}) {
  const { columns, rows } = csvTable(ops, parts);
  return [columns.join(","), ...rows.map((row) => row.map(quote).join(","))].join("\r\n");
}

// Rows of text as the lines of a CSV file, each cell quoted and protected from being a formula.
export const csvLines = (rows) => rows.map((row) => row.map(quote).join(",")).join("\r\n");

// A file with the columns of the operations and no rows, to be filled in and imported.
export const csvTemplate = () => COLUMNS.join(",");

// The same with a few rows of every kind of operation, to show how each is written. The rows are
// examples: they name accounts and categories that are made when the file is imported.
export const csvExample = () =>
  [
    COLUMNS.join(","),
    "expense,2026-03-01,12.50,USD,Wallet,,Food / Lunch,Lunch with a friend,work|lunch,,",
    "expense,2026-03-02,45.00,USD,Wallet,,Transport,Taxi,,,",
    "income,2026-03-05,2500.00,USD,,Wallet,Salary,March salary,,,",
    "transfer,2026-03-06,300.00,USD,Wallet,Savings,,Monthly saving,,,",
    "transfer,2026-03-07,100.00,USD,Wallet,Euro wallet,,Exchange,,92.00,EUR",
    "adjustment,2026-03-08,5.00,USD,,Wallet,,Found in a coat,,,",
  ].join("\r\n");
// The rows of the example as cells, for showing them in a table.
export const csvExampleRows = () =>
  csvExample()
    .split("\r\n")
    .map((line) => line.split(","));
