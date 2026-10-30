/* Operations as CSV: writing, reading, and turning rows into operations */
import { PALETTE, newId } from "../core/constants.js";
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

// Operations for the rows, plus the accounts and categories they need that do not exist yet.
export function prepareCSV(text) {
  const rows = parseCSV(text);
  const accounts = [...appData.accounts],
    categories = [...appData.categories],
    created = { accounts: [], categories: [] },
    ops = [];
  const known = new Set(appData.ops.map(duplicateKey));
  let duplicates = 0;
  const fail = (i, message) =>
    Error(translateWith("CSV row {row}: {message}", { row: i + 2, message: translate(message) }));

  const accountFor = (name, currency, i) => {
    if (!name) throw fail(i, "account is missing");
    if (!(appData.rates[currency] > 0))
      throw fail(i, translateWith("unknown currency {code}", { code: currency }));
    let a = accounts.find((x) => x.name === name && x.currency === currency);
    if (!a) {
      a = blankAccount({ name, currency, color: PALETTE[accounts.length % PALETTE.length] });
      accounts.push(a);
      created.accounts.push(a);
    }
    return a;
  };
  const categoryFor = (cell, type, i) => {
    const [top, sub] = cell.split(SEPARATOR).map((x) => x.trim());
    if (!top) throw fail(i, "category is missing");
    const find = (name, parent) =>
      categories.find((c) => c.name === name && c.type === type && (c.parent || null) === parent);
    const make = (name, parent) => {
      const c = blankCategory({
        name,
        type,
        parent,
        currency: appData.settings.currency,
        color: PALETTE[categories.length % PALETTE.length],
      });
      categories.push(c);
      created.categories.push(c);
      return c;
    };
    const parent = find(top, null) || make(top, null);
    return sub ? find(sub, parent.id) || make(sub, parent.id) : parent;
  };

  for (const [i, r] of rows.entries()) {
    if (!["income", "expense", "transfer", "adjustment"].includes(r.type))
      throw fail(i, "invalid type");
    const amount = r.amount.replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw fail(i, "invalid amount");
    const o = {
      id: newId(),
      type: r.type,
      date: r.date,
      amount: Math.round(Number(amount) * 100),
      comment: r.comment,
      tags: r.tags ? r.tags.split("|") : [],
    };
    // Income has no source and expense no destination; an adjustment has exactly one side.
    if (r.type !== "income" && (r.type !== "adjustment" || r.from))
      o.from = accountFor(r.from, r.currency, i).id;
    if (r.type !== "expense" && (r.type !== "adjustment" || r.to))
      o.to = accountFor(
        r.to,
        r.type === "transfer" && r.to_currency ? r.to_currency : r.currency,
        i,
      ).id;
    if (r.type === "income" || r.type === "expense")
      o.category = categoryFor(r.category, r.type, i).id;
    if (r.type === "transfer" && r.to_amount) {
      o.receive = Math.round(Number(r.to_amount.replace(",", ".")) * 100);
      o.receiveManual = true;
    }
    if (known.has(duplicateKey(o))) duplicates++;
    else ops.push({ row: i, op: o });
  }
  // Validate against the accounts and categories that will exist after the import.
  const lookup = {
    account: (id) => accounts.find((x) => x.id === id),
    category: (id) => categories.find((x) => x.id === id),
  };
  for (const { row, op } of ops)
    try {
      if (op.type === "adjustment") {
        if (!!op.from === !!op.to) throw Error("Choose an account");
      } else validateOp(op, lookup);
    } catch (error) {
      throw fail(row, error.message);
    }
  return { ops: ops.map((x) => x.op), created, duplicates };
}

// Operations with the same key are taken for the same record.
function duplicateKey(o) {
  return [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");
}
