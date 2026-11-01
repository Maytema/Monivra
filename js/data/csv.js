/* Operations as CSV: writing, reading, and turning rows into operations */
import { newId, PALETTE } from "../core/constants.js";
import { appData } from "../core/state.js";
import { blankAccount, blankCategory } from "./defaults.js";
import { accountById, categoryById } from "../domain/finance.js";
import { validateOp } from "../domain/operations.js";
import { translate, translateWith } from "../i18n/index.js";

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
];
const REQUIRED = ["type", "date", "amount", "currency", "from", "to", "category"];
// Subcategories are written as "Parent / Sub".
const SEPARATOR = " / ";

// Category name for a CSV cell.
const categoryCell = (id) => {
  const c = categoryById(id);
  return c?.parent ? categoryById(c.parent)?.name + SEPARATOR + c.name : c?.name;
};

// CSV text of all operations; it can be read back by `prepareCSV`.
export function csvText() {
  const quote = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const money = (n) => (n / 100).toFixed(2);
  return [
    COLUMNS.join(","),
    ...appData.ops.map((o) => {
      const from = accountById(o.from),
        to = accountById(o.to);
      const crossCurrency = o.type === "transfer" && from?.currency !== to?.currency;
      return [
        o.type,
        o.date,
        // Income is written as it reached the account, after taxes and commissions.
        money(o.type === "income" ? (o.receive ?? o.amount) : o.amount),
        (from || to)?.currency,
        from?.name,
        to?.name,
        categoryCell(o.category),
        o.comment,
        (o.tags || []).join("|"),
        crossCurrency ? money(o.receive) : "",
        crossCurrency ? to.currency : "",
      ]
        .map(quote)
        .join(",");
    }),
  ].join("\r\n");
}

// Parse CSV text (commas or semicolons) into one object per row.
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const endRow = () => {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quote");
  endRow();
  if (!rows.length) throw Error("CSV is empty");
  const headers = rows.shift().map((h) => h.trim());
  if (!REQUIRED.every((x) => headers.includes(x)))
    throw Error(
      translateWith("The first row must contain: {columns}", { columns: REQUIRED.join(", ") }),
    );
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}

const rowError = (index, message) =>
  Error(translateWith("CSV row {row}: {message}", { row: index + 2, message: translate(message) }));

// Finds the account of a row by name and currency, or creates it (the list `created` collects those).
function accountResolver(accounts, created) {
  return (name, currency, index) => {
    if (!name) throw rowError(index, "account is missing");
    if (!(appData.rates[currency] > 0))
      throw rowError(index, translateWith("unknown currency {code}", { code: currency }));
    let account = accounts.find((x) => x.name === name && x.currency === currency);
    if (!account) {
      account = blankAccount({ name, currency, color: PALETTE[accounts.length % PALETTE.length] });
      accounts.push(account);
      created.accounts.push(account);
    }
    return account;
  };
}

// Finds the category of a row ("Category / Subcategory"), or creates what is missing.
function categoryResolver(categories, created) {
  return (cell, type, index) => {
    const [top, sub] = cell.split(SEPARATOR).map((x) => x.trim());
    if (!top) throw rowError(index, "category is missing");
    const find = (name, parent) =>
      categories.find((c) => c.name === name && c.type === type && (c.parent || null) === parent);
    const make = (name, parent) => {
      const category = blankCategory({
        name,
        type,
        parent,
        currency: appData.settings.currency,
        color: PALETTE[categories.length % PALETTE.length],
      });
      categories.push(category);
      created.categories.push(category);
      return category;
    };
    const parent = find(top, null) || make(top, null);
    return sub ? find(sub, parent.id) || make(sub, parent.id) : parent;
  };
}

const MINOR_UNITS = 100;
const toMinorUnits = (text) => Math.round(Number(text.replace(",", ".")) * MINOR_UNITS);

// The operation described by one row of the file.
function operationFromRow(row, index, accountFor, categoryFor) {
  if (!["income", "expense", "transfer", "adjustment"].includes(row.type))
    throw rowError(index, "invalid type");
  if (!/^\d+(\.\d{1,2})?$/.test(row.amount.replace(",", ".")))
    throw rowError(index, "invalid amount");
  const op = {
    id: newId(),
    type: row.type,
    date: row.date,
    amount: toMinorUnits(row.amount),
    comment: row.comment,
    tags: row.tags ? row.tags.split("|") : [],
  };
  // Income has no source and expense no destination; an adjustment has exactly one side.
  if (row.type !== "income" && (row.type !== "adjustment" || row.from))
    op.from = accountFor(row.from, row.currency, index).id;
  if (row.type !== "expense" && (row.type !== "adjustment" || row.to))
    op.to = accountFor(
      row.to,
      row.type === "transfer" && row.to_currency ? row.to_currency : row.currency,
      index,
    ).id;
  if (row.type === "income" || row.type === "expense")
    op.category = categoryFor(row.category, row.type, index).id;
  if (row.type === "transfer" && row.to_amount) {
    op.receive = toMinorUnits(row.to_amount);
    op.receiveManual = true;
  }
  return op;
}

// Operations for the rows, plus the accounts and categories they need that do not exist yet.
export function prepareCSV(text) {
  const rows = parseCSV(text);
  const accounts = [...appData.accounts];
  const categories = [...appData.categories];
  const created = { accounts: [], categories: [] };
  const accountFor = accountResolver(accounts, created);
  const categoryFor = categoryResolver(categories, created);
  const known = new Set(appData.ops.map(duplicateKey));
  const ops = [];
  let duplicates = 0;
  for (const [index, row] of rows.entries()) {
    const op = operationFromRow(row, index, accountFor, categoryFor);
    if (known.has(duplicateKey(op))) duplicates++;
    else ops.push({ row: index, op });
  }
  // Validate against the accounts and categories that will exist after the import.
  const lookup = {
    account: (id) => accounts.find((x) => x.id === id),
    category: (id) => categories.find((x) => x.id === id),
  };
  for (const { row, op } of ops)
    try {
      if (op.type === "adjustment") {
        if (Boolean(op.from) === Boolean(op.to)) throw Error("Choose an account");
      } else validateOp(op, lookup);
    } catch (error) {
      throw rowError(row, error.message);
    }
  return { ops: ops.map((x) => x.op), created, duplicates };
}

// Operations with the same key are taken for the same record.
function duplicateKey(o) {
  return [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");
}
