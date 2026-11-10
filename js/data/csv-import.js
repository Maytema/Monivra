/* Import of operations from a CSV file, in steps that never touch the data until the last one:
   read the table, match its columns to the fields of an operation, link the accounts and categories
   it names to the ones there are (or to new ones), work out what would be added, and add it.
   Every step is a plain function of its input, so a preview can run any of them again. */
import { newId, PALETTE } from "../core/constants.js";
import { appData, setAppData } from "../core/state.js";
import { blankAccount, blankCategory } from "./defaults.js";
import { describeProblem } from "./problems.js";
import { findDataProblem, save } from "./storage.js";
import { unprotectCell } from "./csv.js";
import { BACKUP_NOT_STORED, createBackup } from "../domain/backups.js";
import { parseDate, toIsoDate } from "../domain/finance.js";
import { isPlanned, scheduledForm, validateOp } from "../domain/operations.js";
import { translate, translateWith } from "../i18n/index.js";

// The most rows one import takes, and the longest text of a cell; a file beyond these is refused.
export const MAX_ROWS = 100000;
export const MAX_CELL = 20000;
const SEPARATOR = " / ";

// The fields an operation can get from a column: [key, required, label].
export const FIELDS = [
  ["date", true, "Date"],
  ["amount", true, "Amount"],
  ["type", false, "Type"],
  ["currency", false, "Currency"],
  ["from", false, "From account"],
  ["to", false, "To account"],
  ["account", false, "Account"],
  ["category", false, "Category"],
  ["comment", false, "Comment"],
  ["tags", false, "Tags"],
  ["to_amount", false, "Amount received"],
  ["to_currency", false, "Currency received"],
];
// What a column may be called in the file for each field, as written in English and Russian.
const NAMES = {
  date: ["date", "day", "transaction date", "booking date", "дата", "дата операции"],
  amount: ["amount", "sum", "value", "сумма"],
  type: ["type", "operation type", "kind", "тип", "вид", "тип операции"],
  currency: ["currency", "curr", "ccy", "валюта"],
  from: ["from", "from account", "source", "откуда", "со счета", "со счёта"],
  to: ["to", "to account", "destination", "target", "куда", "на счет", "на счёт"],
  account: ["account", "wallet", "card", "счет", "счёт"],
  category: ["category", "cat", "категория"],
  comment: [
    "comment",
    "note",
    "notes",
    "description",
    "memo",
    "details",
    "комментарий",
    "описание",
  ],
  tags: ["tags", "tag", "labels", "теги", "метки"],
  to_amount: ["to amount", "amount received", "received", "сумма зачисления"],
  to_currency: ["to currency", "currency received", "валюта зачисления"],
};
// Words of the type column.
const TYPES = {
  income: ["income", "incomes", "доход", "доходы"],
  expense: ["expense", "expenses", "расход", "расходы"],
  transfer: ["transfer", "transfers", "перевод", "переводы"],
  adjustment: ["adjustment", "correction", "корректировка"],
};

// ---- Reading the table ----

// The delimiter that occurs most often in the first line (the names of the columns), outside quotes.
function guessDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0];
  let best = ",";
  let bestCount = 0;
  for (const delimiter of [",", ";", "\t"]) {
    let n = 0;
    let quoted = false;
    for (const c of first) {
      if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) n++;
    }
    if (n > bestCount) [best, bestCount] = [delimiter, n];
  }
  return best;
}

// Reads CSV text into { delimiter, headers, rows: [{ line, cells }], empty, ragged }. Quoted cells
// may hold the delimiter, line breaks and doubled quotes; blank lines are skipped. Throws an error
// for a file that is not a table.
export function readTable(text) {
  text = text.replace(/^﻿/, "");
  if (!text.trim()) throw Error(translate("The file is empty."));
  if (text.includes("\u0000")) throw Error(translate("This is not a text file."));
  const delimiter = guessDelimiter(text);
  const all = [];
  let cells = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let wasQuoted = false;
  const endCell = () => {
    cells.push(wasQuoted ? cell : cell.trim());
    cell = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (cells.some((x) => x.trim() !== "")) all.push({ line: startLine, cells });
    cells = [];
    if (all.length > MAX_ROWS + 1) throw Error(translate("The file has too many rows."));
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell.trim() === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (c === delimiter) endCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      startLine = line;
    } else cell += c;
    if (cell.length > MAX_CELL) throw Error(translate("A cell of the file is too long."));
  }
  if (quoted)
    throw Error(translate("The file ends inside a quoted text: a closing quote is missing."));
  endRow();
  if (!all.length) throw Error(translate("The file is empty."));
  const header = all.shift();
  const headers = header.cells.map((h) => h.trim());
  const width = headers.length;
  let ragged = 0;
  const rows = all.map((row) => {
    if (row.cells.length !== width) ragged++;
    return { line: row.line, cells: Array.from({ length: width }, (_, i) => row.cells[i] ?? "") };
  });
  return { delimiter, headers, rows, ragged };
}

// ---- Matching columns ----

const plain = (name) =>
  name
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

// The column each field most likely comes from, as { field: index } with -1 for none. Columns named
// as in the files this application writes (and a few common names) are recognised.
export function guessColumns(headers) {
  const mapping = {};
  const used = new Set();
  for (const [key] of FIELDS) {
    const index = headers.findIndex((h, i) => !used.has(i) && NAMES[key].includes(plain(h)));
    mapping[key] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

// Day, month and year order: "ymd" 2026-03-04, "dmy" 04.03.2026, "mdy" 03/04/2026.
export const DATE_ORDERS = ["ymd", "dmy", "mdy"];
export const DATE_EXAMPLES = { ymd: "2026-03-04", dmy: "04.03.2026", mdy: "03/04/2026" };
export const DECIMALS = [".", ","];

const column = (table, index, limit = 300) =>
  index < 0
    ? []
    : table.rows
        .slice(0, limit)
        .map((r) => r.cells[index])
        .filter(Boolean);

// The way dates and amounts are most likely written in the file: { dateOrder, decimal, ambiguous }.
export function guessFormats(table, mapping) {
  const dates = column(table, mapping.date);
  let dateOrder = "ymd";
  let ambiguous = false;
  const parts = dates
    .map((d) => d.split(/[ T]/)[0].split(/[./-]/))
    .filter((p) => p.length === 3 && p.every((x) => /^\d+$/.test(x)));
  if (parts.length && parts.every((p) => p[0].length === 4)) dateOrder = "ymd";
  else if (parts.length) {
    if (parts.some((p) => Number(p[0]) > 12)) dateOrder = "dmy";
    else if (parts.some((p) => Number(p[1]) > 12)) dateOrder = "mdy";
    else {
      dateOrder = "dmy";
      ambiguous = true;
    }
  }
  const amounts = column(table, mapping.amount);
  const comma = amounts.filter((a) => /,\d{1,2}\D*$/.test(a) && !/\.\d{1,2}\D*$/.test(a)).length;
  const dot = amounts.filter((a) => /\.\d{1,2}\D*$/.test(a)).length;
  return { dateOrder, decimal: comma > dot ? "," : ".", ambiguous };
}

// ---- Reading the values of a row ----

// A date as written in the file into YYYY-MM-DD, or null.
export function parseDateText(text, order) {
  const parts = text.trim().split(/[ T]/)[0].split(/[./-]/);
  if (parts.length !== 3 || !parts.every((x) => /^\d{1,4}$/.test(x))) return null;
  const [a, b, c] = parts;
  const [y, m, d] = order === "ymd" ? [a, b, c] : order === "dmy" ? [c, b, a] : [c, a, b];
  if (y.length !== 4 || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31)
    return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toIsoDate(parseDate(iso)) === iso ? iso : null;
}

// An amount as written in the file into { minor, negative } (minor units), or a reason it cannot be
// read. The last . or , of a number is its decimal point when one or two digits follow it, or when
// both signs are there; groups of three digits are taken away. Only "1,234" or "1.234" could be
// either, and there the file's `decimal` decides. A number is never read as another one: what does
// not fit gives a reason instead.
export function parseAmountText(text, decimal) {
  let s = text.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) [negative, s] = [true, s.slice(1, -1)];
  s = s.replace(/[\s\u00a0\u202f']/g, "");
  if (/^[-−]/.test(s)) [negative, s] = [true, s.slice(1)];
  else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^[^\d.,]+|[^\d.,]+$/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return { reason: "invalid amount" };
  const count = (ch) => s.split(ch).length - 1;
  const [dots, commas] = [count("."), count(",")];
  let point = null;
  if (dots && commas) point = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1 || commas === 1) {
    const ch = dots ? "." : ",";
    const tail = s.length - s.lastIndexOf(ch) - 1;
    point = tail !== 3 || ch === decimal ? ch : null;
  }
  const group = point === "." ? "," : point === "," ? "." : dots ? "." : ",";
  const [whole, ...rest] = point ? s.split(point) : [s];
  if (rest.length > 1) return { reason: "invalid amount" };
  const fraction = rest[0] ?? "";
  if (whole.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(whole))
    return { reason: "invalid amount" };
  const digits = whole.split(group).join("");
  if (!/^\d+$/.test(digits) || (fraction && !/^\d+$/.test(fraction)))
    return { reason: "invalid amount" };
  if (fraction.length > 2) return { reason: "the amount has more than two decimals" };
  if (digits.length > 12) return { reason: "the amount is too large" };
  const minor = Number(digits) * 100 + Number(fraction.padEnd(2, "0"));
  if (minor <= 0) return { reason: "the amount must be greater than zero" };
  return { minor, negative };
}

const typeOf = (text) => {
  const word = plain(text);
  return Object.keys(TYPES).find((type) => TYPES[type].includes(word)) ?? null;
};
const cleanName = (s) => s.replace(/\s+/g, " ").trim();

// The rows of the table as records, with the problem of a row that cannot be an operation (a reason
// as a key of the translation table). `mapping` is { field: column index }, `formats` is
// { dateOrder, decimal }.
export function readRecords(table, mapping, formats) {
  const cell = (row, key) => {
    const i = mapping[key];
    return i >= 0 ? unprotectCell(row.cells[i] ?? "").trim() : "";
  };
  return table.rows.map((row) => {
    const record = {
      line: row.line,
      cells: row.cells,
      problem: null,
      ignoredSign: false,
    };
    const fail = (reason) => {
      record.problem ??= reason;
    };
    const rawType = cell(row, "type");
    let type = rawType ? typeOf(rawType) : null;
    if (rawType && !type) fail(translateWith("unknown type {type}", { type: rawType }));
    const date = parseDateText(cell(row, "date"), formats.dateOrder);
    if (!cell(row, "date")) fail("the date is missing");
    else if (!date) fail("the date is not valid");
    const amount = parseAmountText(cell(row, "amount"), formats.decimal);
    if (!cell(row, "amount")) fail("the amount is missing");
    else if (amount.reason) fail(amount.reason);
    const name = (key) => cleanName(cell(row, key));
    let from = name("from");
    let to = name("to");
    const account = name("account");
    if (!type) {
      if (from && to) type = "transfer";
      else if (!amount.reason && cell(row, "amount")) type = amount.negative ? "expense" : "income";
    }
    // The account column serves wherever from or to is not given, on the side the type needs.
    if (type === "expense" || (type === "adjustment" && amount.negative && !from && !to))
      from ||= account || to;
    if (type === "income" || (type === "adjustment" && !amount.negative && !from && !to))
      to ||= account || from;
    if (type === "expense") to = "";
    if (type === "income") from = "";
    const currency = cell(row, "currency").toUpperCase();
    const toCurrency = cell(row, "to_currency").toUpperCase();
    const category = cleanName(cell(row, "category"));
    const toAmount = cell(row, "to_amount");
    let received = null;
    if (type === "transfer" && toAmount) {
      const parsed = parseAmountText(toAmount, formats.decimal);
      if (parsed.reason) fail(parsed.reason);
      else received = parsed.minor;
    }
    if (type === "income" && amount.negative) record.ignoredSign = true;
    if (type === "transfer") {
      if (!from || !to) fail("a transfer needs two accounts");
      else if (from === to && currency === (toCurrency || currency))
        fail("a transfer needs two different accounts");
    } else if (type === "adjustment") {
      if (Boolean(from) === Boolean(to)) fail("an adjustment needs one account");
    } else if (type && !(type === "expense" ? from : to)) fail("account is missing");
    if ((type === "income" || type === "expense") && !category) fail("category is missing");
    return Object.assign(record, {
      type,
      date,
      minor: amount.minor,
      from,
      to,
      category: type === "income" || type === "expense" ? category : "",
      currency,
      toCurrency,
      received,
      comment: cell(row, "comment"),
      tags: [
        ...new Set(
          cell(row, "tags")
            .split("|")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
    });
  });
}

// ---- Linking accounts and categories ----

const same = (a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
export const categoryPath = (c, all = appData.categories) =>
  c.parent ? `${all.find((x) => x.id === c.parent)?.name}${SEPARATOR}${c.name}` : c.name;

export const categoryKey = (type, name) => `${type}\u0000${name}`;

// What the usable rows name: the accounts (with the currencies written next to them) and the
// categories (by type), each with the number of rows.
export function referencesOf(records) {
  const accounts = new Map();
  const categories = new Map();
  for (const r of records.filter((x) => !x.problem)) {
    const named = [
      [r.from, r.currency],
      [r.to, r.type === "transfer" && r.toCurrency ? r.toCurrency : r.currency],
    ];
    for (const [name, currency] of named) {
      if (!name) continue;
      const item = accounts.get(name) ?? { name, currencies: new Set(), rows: 0 };
      if (currency) item.currencies.add(currency);
      item.rows++;
      accounts.set(name, item);
    }
    if (r.category) {
      const key = categoryKey(r.type, r.category);
      const item = categories.get(key) ?? { key, type: r.type, name: r.category, rows: 0 };
      item.rows++;
      categories.set(key, item);
    }
  }
  return { accounts: [...accounts.values()], categories: [...categories.values()] };
}

// An object for names that come from a file: it has no prototype, so a name such as "__proto__" is
// only a name.
export function dictionary(entries = []) {
  const object = Object.create(null);
  for (const [key, value] of entries) object[key] = value;
  return object;
}

// The link of each account and category the file names: the id of the one that is there already,
// or "new". An account is the one of the same name (and the same currency when the file says it);
// a category is the one of the same name and type, "Parent / Sub" for a subcategory.
export function guessLinks(refs) {
  const accounts = dictionary();
  for (const ref of refs.accounts) {
    const named = appData.accounts.filter((a) => !a.archived && same(a.name, ref.name));
    const currencies = [...ref.currencies];
    const match =
      currencies.length === 1
        ? named.find((a) => a.currency === currencies[0])
        : currencies.length === 0 && named.length === 1
          ? named[0]
          : null;
    accounts[ref.name] = match?.id ?? "new";
  }
  const categories = dictionary();
  for (const ref of refs.categories) {
    const match = appData.categories.find(
      (c) => c.type === ref.type && same(categoryPath(c), ref.name) && !c.archived,
    );
    categories[ref.key] = match?.id ?? "new";
  }
  return { accounts, categories };
}

// ---- Working out what an import adds ----

// Operations with the same key are taken for the same record.
const duplicateKey = (o) =>
  [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");

// The plan of an import: the operations, accounts, categories and tags it would add, and what it
// leaves out and why. Nothing is changed.
export function planImport(records, links) {
  const main = appData.settings.currency;
  const created = { accounts: [], categories: [] };
  // What exists or is made so far, found by id, by name or by place in the tree.
  const accountsById = new Map(appData.accounts.map((a) => [a.id, a]));
  const categoriesById = new Map(appData.categories.map((c) => [c.id, c]));
  const madeAccounts = new Map();
  const treeKey = (c) => `${c.type}\u0000${c.parent || ""}\u0000${c.name}`;
  const tree = new Map();
  for (const c of appData.categories) if (!tree.has(treeKey(c))) tree.set(treeKey(c), c);
  const known = new Map();
  for (const o of [...appData.ops, ...appData.scheduled])
    known.set(duplicateKey(o), (known.get(duplicateKey(o)) ?? 0) + 1);
  const knownTags = new Set(appData.tags);
  const plan = {
    total: records.length,
    ops: [],
    lines: [],
    invalid: [],
    duplicates: 0,
    repeated: 0,
    ignoredSigns: 0,
    future: 0,
    created,
    newTags: [],
  };
  const seen = new Set();

  // The account for a name; one that has to be made is staged and kept only if its row is.
  const accountFor = (name, currency, stage) => {
    const link = links.accounts[name];
    if (link && link !== "new") {
      const account = accountsById.get(link);
      if (!account) throw Error("the linked account no longer exists");
      if (currency && account.currency !== currency)
        throw Error(
          translateWith("the currency {code} is not the currency of the account {name}", {
            code: currency,
            name: account.name,
          }),
        );
      return account;
    }
    const code = currency || main;
    if (!(appData.rates[code] > 0)) throw Error(translateWith("unknown currency {code}", { code }));
    const made =
      madeAccounts.get(`${name}\u0000${code}`) ??
      stage.accounts.find((a) => a.name === name && a.currency === code);
    if (made) return made;
    const account = blankAccount({
      name,
      currency: code,
      color: PALETTE[(accountsById.size + stage.accounts.length) % PALETTE.length],
    });
    stage.accounts.push(account);
    return account;
  };
  const categoryFor = (type, name, stage) => {
    const link = links.categories[categoryKey(type, name)];
    if (link && link !== "new") {
      const category = categoriesById.get(link);
      if (!category) throw Error("the linked category no longer exists");
      return category;
    }
    const [top, sub] = name.split(SEPARATOR).map((x) => x.trim());
    const find = (n, parent) =>
      tree.get(treeKey({ type, parent, name: n })) ??
      stage.categories.find(
        (c) => c.type === type && c.name === n && (c.parent || null) === parent,
      );
    const make = (n, parent) => {
      const category = blankCategory({
        name: n,
        type,
        parent,
        currency: main,
        color: PALETTE[(categoriesById.size + stage.categories.length) % PALETTE.length],
      });
      stage.categories.push(category);
      return category;
    };
    const parent = find(top, null) || make(top, null);
    return sub ? find(sub, parent.id) || make(sub, parent.id) : parent;
  };

  for (const r of records) {
    if (r.problem) {
      plan.invalid.push({ line: r.line, reason: r.problem, cells: r.cells });
      continue;
    }
    const stage = { accounts: [], categories: [] };
    try {
      const op = {
        id: newId(),
        type: r.type,
        date: r.date,
        amount: r.minor,
        comment: r.comment,
        tags: r.tags,
      };
      if (r.from) op.from = accountFor(r.from, r.currency, stage).id;
      if (r.to) {
        const toCode = r.type === "transfer" && r.toCurrency ? r.toCurrency : r.currency;
        op.to = accountFor(r.to, toCode, stage).id;
      }
      if (r.category) op.category = categoryFor(r.type, r.category, stage).id;
      if (r.received) {
        op.receive = r.received;
        op.receiveManual = true;
      }
      const lookup = {
        account: (id) => accountsById.get(id) ?? stage.accounts.find((x) => x.id === id),
        category: (id) => categoriesById.get(id) ?? stage.categories.find((x) => x.id === id),
      };
      if (op.type === "adjustment" && Boolean(op.from) === Boolean(op.to))
        throw Error("an adjustment needs one account");
      validateOp(op, lookup);
      const key = duplicateKey(op);
      if (known.get(key) > 0) {
        known.set(key, known.get(key) - 1);
        plan.duplicates++;
        continue;
      }
      if (seen.has(key)) plan.repeated++;
      seen.add(key);
      for (const a of stage.accounts) {
        created.accounts.push(a);
        accountsById.set(a.id, a);
        madeAccounts.set(`${a.name}\u0000${a.currency}`, a);
      }
      for (const c of stage.categories) {
        created.categories.push(c);
        categoriesById.set(c.id, c);
        tree.set(treeKey(c), c);
      }
      plan.ops.push(op);
      if (isPlanned(op)) plan.future++;
      plan.lines.push(r.line);
      if (r.ignoredSign) plan.ignoredSigns++;
      for (const tag of op.tags)
        if (!knownTags.has(tag)) {
          knownTags.add(tag);
          plan.newTags.push(tag);
        }
    } catch (error) {
      plan.invalid.push({ line: r.line, reason: error.message, cells: r.cells });
    }
  }
  return plan;
}

// ---- Adding ----

// Adds what the plan holds. A backup of the data is made first; the result is checked as a whole
// before anything changes, and if it cannot be stored the data stays as it was and an error is
// thrown. Returns what was added, which `undoImport` takes away again.
export function applyImport(plan) {
  if (!plan.ops.length) throw Error(translate("There is nothing to import."));
  if (!createBackup("safety")) throw Error(translate(BACKUP_NOT_STORED));
  const before = appData;
  // What is dated ahead is not done yet: it is added as a scheduled payment, like one entered by hand.
  const planned = plan.ops.filter(isPlanned);
  const next = {
    ...before,
    accounts: [...before.accounts, ...plan.created.accounts],
    categories: [...before.categories, ...plan.created.categories],
    ops: [...before.ops, ...plan.ops.filter((o) => !isPlanned(o))],
    scheduled: [...before.scheduled, ...planned.map(scheduledForm)],
    tags: [...before.tags, ...plan.newTags],
  };
  const problem = findDataProblem(next);
  if (problem) throw Error(describeProblem(problem));
  setAppData(next);
  if (!save()) {
    setAppData(before);
    throw Error(translate("The data could not be stored, so nothing was changed."));
  }
  return {
    ops: plan.ops.map((o) => o.id),
    accounts: plan.created.accounts.map((a) => a.id),
    categories: plan.created.categories.map((c) => c.id),
    tags: [...plan.newTags],
  };
}

// Takes away what an import added: its operations, and the accounts, categories and tags it made
// that nothing else uses by now.
export function undoImport(added) {
  const gone = new Set(added.ops);
  appData.ops = appData.ops.filter((o) => !gone.has(o.id));
  appData.scheduled = appData.scheduled.filter((o) => !gone.has(o.id));
  const used = (key, id) =>
    [...appData.ops, ...appData.scheduled].some(
      (o) => o[key] === id || (key === "from" && o.to === id),
    );
  appData.accounts = appData.accounts.filter(
    (a) => !added.accounts.includes(a.id) || used("from", a.id),
  );
  // Categories go leaf first, so a made parent goes once its made children are gone.
  for (let again = true; again; ) {
    const parents = new Set(appData.categories.map((c) => c.parent).filter(Boolean));
    const before = appData.categories.length;
    appData.categories = appData.categories.filter(
      (c) =>
        !added.categories.includes(c.id) ||
        used("category", c.id) ||
        parents.has(c.id) ||
        appData.budgets.some((b) => b.categories?.includes(c.id)),
    );
    again = appData.categories.length < before;
  }
  appData.tags = appData.tags.filter(
    (t) => !added.tags.includes(t) || appData.ops.some((o) => o.tags.includes(t)),
  );
  save();
}
