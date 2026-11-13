// Import of operations from a CSV file (port of js/data/csv-import.js), in steps that never touch the
// data until the last one: read the table, match its columns to the fields of an operation, link the
// accounts and categories it names to the ones there are (or to new ones), work out what would be
// added, and add it. Every step is a plain function of its input, so the wizard can run any again.
import { blankAccount } from "./accounts.ts";
import { blankCategory } from "./categories.ts";
import type { LedgerTx } from "./change.ts";
import { parseDate, toIsoDate } from "./dates.ts";
import type { Env } from "./env.ts";
import { DomainError } from "./errors.ts";
import { isPlanned, scheduledForm, validateOp, type Lookup } from "./operations.ts";
import type { Account, Category, LedgerData, Minor, Operation } from "./types.ts";

export const MAX_ROWS = 100000;
export const MAX_CELL = 20000;
const SEPARATOR = " / ";
// Colours given to what an import makes (js/core/constants.js PALETTE).
const PALETTE = ["#9d00b5", "#7051df", "#4857c7", "#31afd0", "#3a484e", "#f36c08", "#e1c735", "#b13d81", "#22ad89", "#bd5b31", "#00aac7", "#e03366", "#93a334", "#666666", "#abc3ca", "#306b44"];

export type FieldKey = "date" | "amount" | "type" | "currency" | "from" | "to" | "account" | "category" | "comment" | "tags" | "to_amount" | "to_currency";
// The fields an operation can get from a column: [key, required, label].
export const FIELDS: readonly [FieldKey, boolean, string][] = [
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
const NAMES: Record<FieldKey, string[]> = {
  date: ["date", "day", "transaction date", "booking date", "дата", "дата операции"],
  amount: ["amount", "sum", "value", "сумма"],
  type: ["type", "operation type", "kind", "тип", "вид", "тип операции"],
  currency: ["currency", "curr", "ccy", "валюта"],
  from: ["from", "from account", "source", "откуда", "со счета", "со счёта"],
  to: ["to", "to account", "destination", "target", "куда", "на счет", "на счёт"],
  account: ["account", "wallet", "card", "счет", "счёт"],
  category: ["category", "cat", "категория"],
  comment: ["comment", "note", "notes", "description", "memo", "details", "комментарий", "описание"],
  tags: ["tags", "tag", "labels", "теги", "метки"],
  to_amount: ["to amount", "amount received", "received", "сумма зачисления"],
  to_currency: ["to currency", "currency received", "валюта зачисления"],
};
const TYPES: Record<Operation["type"], string[]> = {
  income: ["income", "incomes", "доход", "доходы"],
  expense: ["expense", "expenses", "расход", "расходы"],
  transfer: ["transfer", "transfers", "перевод", "переводы"],
  adjustment: ["adjustment", "correction", "корректировка"],
};

// A reason as English text (a key of the translation table) with its values.
export interface Reason {
  text: string;
  params?: Record<string, string | number>;
}
export class CsvProblem extends DomainError {}

// ---- Reading the table ----

export interface Table {
  delimiter: string;
  headers: string[];
  rows: { line: number; cells: string[] }[];
  ragged: number;
}

function guessDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
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

// Reads CSV text. Quoted cells may hold the delimiter, line breaks and doubled quotes; blank lines are
// skipped. Throws CsvProblem for a file that is not a table.
export function readTable(input: string): Table {
  const text = input.replace(/^﻿/, "");
  if (!text.trim()) throw new CsvProblem("The file is empty.");
  if (text.includes("\u0000")) throw new CsvProblem("This is not a text file.");
  const delimiter = guessDelimiter(text);
  const all: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
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
    if (all.length > MAX_ROWS + 1) throw new CsvProblem("The file has too many rows.");
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
    if (cell.length > MAX_CELL) throw new CsvProblem("A cell of the file is too long.");
  }
  if (quoted) throw new CsvProblem("The file ends inside a quoted text: a closing quote is missing.");
  endRow();
  const header = all.shift();
  if (!header) throw new CsvProblem("The file is empty.");
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

const plain = (name: string) =>
  name
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

export type Mapping = Record<FieldKey, number>;

// The column each field most likely comes from (-1 for none).
export function guessColumns(headers: readonly string[]): Mapping {
  const mapping = {} as Mapping;
  const used = new Set<number>();
  for (const [key] of FIELDS) {
    const index = headers.findIndex((h, i) => !used.has(i) && NAMES[key].includes(plain(h)));
    mapping[key] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

export type DateOrder = "ymd" | "dmy" | "mdy";
export const DATE_ORDERS: readonly DateOrder[] = ["ymd", "dmy", "mdy"];
export const DATE_EXAMPLES: Record<DateOrder, string> = { ymd: "2026-03-04", dmy: "04.03.2026", mdy: "03/04/2026" };
export const DECIMALS = [".", ","] as const;
export interface Formats {
  dateOrder: DateOrder;
  decimal: "." | ",";
  ambiguous?: boolean;
}

const column = (table: Table, index: number, limit = 300) =>
  index < 0
    ? []
    : table.rows
        .slice(0, limit)
        .map((r) => r.cells[index] ?? "")
        .filter(Boolean);

// The way dates and amounts are most likely written in the file.
export function guessFormats(table: Table, mapping: Mapping): Formats {
  const dates = column(table, mapping.date);
  let dateOrder: DateOrder = "ymd";
  let ambiguous = false;
  const parts = dates.map((d) => (d.split(/[ T]/)[0] ?? "").split(/[./-]/)).filter((p) => p.length === 3 && p.every((x) => /^\d+$/.test(x)));
  if (parts.length && parts.every((p) => p[0]!.length === 4)) dateOrder = "ymd";
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

export function parseDateText(text: string, order: DateOrder): string | null {
  const parts = (text.trim().split(/[ T]/)[0] ?? "").split(/[./-]/);
  if (parts.length !== 3 || !parts.every((x) => /^\d{1,4}$/.test(x))) return null;
  const [a, b, c] = parts as [string, string, string];
  const [y, m, d] = order === "ymd" ? [a, b, c] : order === "dmy" ? [c, b, a] : [c, a, b];
  if (y.length !== 4 || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toIsoDate(parseDate(iso)) === iso ? iso : null;
}

// An amount as written in the file into minor units, or a reason it cannot be read. A number is never
// read as another one: what does not fit gives a reason instead.
export function parseAmountText(text: string, decimal: "." | ","): { minor: Minor; negative: boolean; reason?: undefined } | { reason: string; minor?: undefined; negative?: undefined } {
  let s = text.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) [negative, s] = [true, s.slice(1, -1)];
  s = s.replace(/[\s  ']/g, "");
  if (/^[-−]/.test(s)) [negative, s] = [true, s.slice(1)];
  else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^[^\d.,]+|[^\d.,]+$/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return { reason: "invalid amount" };
  const count = (ch: string) => s.split(ch).length - 1;
  const [dots, commas] = [count("."), count(",")];
  let point: string | null = null;
  if (dots && commas) point = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1 || commas === 1) {
    const ch = dots ? "." : ",";
    const tail = s.length - s.lastIndexOf(ch) - 1;
    point = tail !== 3 || ch === decimal ? ch : null;
  }
  const group = point === "." ? "," : point === "," ? "." : dots ? "." : ",";
  const [whole = "", ...rest] = point ? s.split(point) : [s];
  if (rest.length > 1) return { reason: "invalid amount" };
  const fraction = rest[0] ?? "";
  if (whole.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(whole)) return { reason: "invalid amount" };
  const digits = whole.split(group).join("");
  if (!/^\d+$/.test(digits) || (fraction && !/^\d+$/.test(fraction))) return { reason: "invalid amount" };
  if (fraction.length > 2) return { reason: "the amount has more than two decimals" };
  if (digits.length > 12) return { reason: "the amount is too large" };
  const minor = Number(digits) * 100 + Number(fraction.padEnd(2, "0"));
  if (minor <= 0) return { reason: "the amount must be greater than zero" };
  return { minor, negative };
}

const typeOf = (text: string): Operation["type"] | null => {
  const word = plain(text);
  return (Object.keys(TYPES) as Operation["type"][]).find((type) => TYPES[type].includes(word)) ?? null;
};
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
// A cell written with a leading apostrophe so a spreadsheet would not run it (csv.ts protectCell).
const unprotectCell = (s: string) => (s.startsWith("'") && /^[=+\-@\t\r]/.test(s.slice(1)) ? s.slice(1) : s);

export interface CsvRecord {
  line: number;
  cells: string[];
  problem: Reason | null;
  ignoredSign: boolean;
  type: Operation["type"] | null;
  date: string | null;
  minor: Minor | undefined;
  from: string;
  to: string;
  category: string;
  currency: string;
  toCurrency: string;
  received: Minor | null;
  comment: string;
  tags: string[];
}

// The rows of the table as records, with the problem of a row that cannot be an operation.
export function readRecords(table: Table, mapping: Mapping, formats: Formats): CsvRecord[] {
  const cell = (row: Table["rows"][number], key: FieldKey) => {
    const i = mapping[key];
    return i >= 0 ? unprotectCell(row.cells[i] ?? "").trim() : "";
  };
  return table.rows.map((row) => {
    let problem: Reason | null = null;
    const fail = (text: string, params?: Reason["params"]) => {
      problem ??= { text, params };
    };
    const rawType = cell(row, "type");
    let type = rawType ? typeOf(rawType) : null;
    if (rawType && !type) fail("unknown type {type}", { type: rawType });
    const date = parseDateText(cell(row, "date"), formats.dateOrder);
    if (!cell(row, "date")) fail("the date is missing");
    else if (!date) fail("the date is not valid");
    const amount = parseAmountText(cell(row, "amount"), formats.decimal);
    if (!cell(row, "amount")) fail("the amount is missing");
    else if (amount.reason) fail(amount.reason);
    const name = (key: FieldKey) => cleanName(cell(row, key));
    let from = name("from");
    let to = name("to");
    const account = name("account");
    if (!type) {
      if (from && to) type = "transfer";
      else if (!amount.reason && cell(row, "amount")) type = amount.negative ? "expense" : "income";
    }
    if (type === "expense" || (type === "adjustment" && amount.negative && !from && !to)) from ||= account || to;
    if (type === "income" || (type === "adjustment" && !amount.negative && !from && !to)) to ||= account || from;
    if (type === "expense") to = "";
    if (type === "income") from = "";
    const currency = cell(row, "currency").toUpperCase();
    const toCurrency = cell(row, "to_currency").toUpperCase();
    const category = cleanName(cell(row, "category"));
    const toAmount = cell(row, "to_amount");
    let received: Minor | null = null;
    if (type === "transfer" && toAmount) {
      const parsed = parseAmountText(toAmount, formats.decimal);
      if (parsed.reason) fail(parsed.reason);
      else received = parsed.minor ?? null;
    }
    const ignoredSign = type === "income" && amount.negative === true;
    if (type === "transfer") {
      if (!from || !to) fail("a transfer needs two accounts");
      else if (from === to && currency === (toCurrency || currency)) fail("a transfer needs two different accounts");
    } else if (type === "adjustment") {
      if (Boolean(from) === Boolean(to)) fail("an adjustment needs one account");
    } else if (type && !(type === "expense" ? from : to)) fail("account is missing");
    if ((type === "income" || type === "expense") && !category) fail("category is missing");
    return {
      line: row.line,
      cells: row.cells,
      problem,
      ignoredSign,
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
    };
  });
}

// ---- Linking accounts and categories ----

// Case does not matter, accents do (localeCompare with sensitivity "accent" in the first application).
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const categoryPath = (c: Category, all: readonly Category[]): string => (c.parent ? `${all.find((x) => x.id === c.parent)?.name}${SEPARATOR}${c.name}` : c.name);
export const categoryKey = (type: string, name: string): string => `${type}\u0000${name}`;

export interface References {
  accounts: { name: string; currencies: Set<string>; rows: number }[];
  categories: { key: string; type: Operation["type"]; name: string; rows: number }[];
}

// What the usable rows name: the accounts (with their currencies) and the categories, with row counts.
export function referencesOf(records: readonly CsvRecord[]): References {
  const accounts = new Map<string, References["accounts"][number]>();
  const categories = new Map<string, References["categories"][number]>();
  for (const r of records.filter((x) => !x.problem)) {
    const named: [string, string][] = [
      [r.from, r.currency],
      [r.to, r.type === "transfer" && r.toCurrency ? r.toCurrency : r.currency],
    ];
    for (const [name, currency] of named) {
      if (!name) continue;
      const item = accounts.get(name) ?? { name, currencies: new Set<string>(), rows: 0 };
      if (currency) item.currencies.add(currency);
      item.rows++;
      accounts.set(name, item);
    }
    if (r.category && r.type) {
      const key = categoryKey(r.type, r.category);
      const item = categories.get(key) ?? { key, type: r.type, name: r.category, rows: 0 };
      item.rows++;
      categories.set(key, item);
    }
  }
  return { accounts: [...accounts.values()], categories: [...categories.values()] };
}

// Names from a file, kept in Maps so that a name such as "__proto__" is only a name.
export interface Links {
  accounts: Map<string, string>; // name → account id or "new"
  categories: Map<string, string>; // categoryKey → category id or "new"
}

export function guessLinks(data: LedgerData, refs: References): Links {
  const accounts = new Map<string, string>();
  for (const ref of refs.accounts) {
    const named = data.accounts.filter((a) => !a.archived && same(a.name, ref.name));
    const currencies = [...ref.currencies];
    const match = currencies.length === 1 ? named.find((a) => a.currency === currencies[0]) : currencies.length === 0 && named.length === 1 ? named[0] : null;
    accounts.set(ref.name, match?.id ?? "new");
  }
  const categories = new Map<string, string>();
  for (const ref of refs.categories) {
    const match = data.categories.find((c) => c.type === ref.type && same(categoryPath(c, data.categories), ref.name) && !c.archived);
    categories.set(ref.key, match?.id ?? "new");
  }
  return { accounts, categories };
}

// ---- Working out what an import adds ----

const duplicateKey = (o: Operation) => [o.type, o.date, o.amount, o.from, o.to, o.category, o.comment].join("|");

export interface ImportPlan {
  total: number;
  ops: Operation[];
  lines: number[];
  invalid: { line: number; reason: Reason; cells: string[] }[];
  duplicates: number;
  repeated: number;
  ignoredSigns: number;
  future: number;
  created: { accounts: Account[]; categories: Category[] };
  newTags: string[];
}

// The plan of an import: what it would add and what it leaves out and why. Nothing is changed.
export function planImport(data: LedgerData, records: readonly CsvRecord[], links: Links, env: Env): ImportPlan {
  const main = data.settings.currency;
  const today = env.clock.today();
  const created: ImportPlan["created"] = { accounts: [], categories: [] };
  const accountsById = new Map(data.accounts.map((a) => [a.id, a]));
  const categoriesById = new Map(data.categories.map((c) => [c.id, c]));
  const madeAccounts = new Map<string, Account>();
  const treeKey = (c: { type: string; parent?: string | null; name: string }) => `${c.type}\u0000${c.parent || ""}\u0000${c.name}`;
  const tree = new Map<string, Category>();
  for (const c of data.categories) if (!tree.has(treeKey(c))) tree.set(treeKey(c), c);
  const known = new Map<string, number>();
  for (const o of [...data.ops, ...data.scheduled]) known.set(duplicateKey(o), (known.get(duplicateKey(o)) ?? 0) + 1);
  const knownTags = new Set(data.tags);
  const plan: ImportPlan = { total: records.length, ops: [], lines: [], invalid: [], duplicates: 0, repeated: 0, ignoredSigns: 0, future: 0, created, newTags: [] };
  const seen = new Set<string>();
  type Stage = { accounts: Account[]; categories: Category[] };

  const accountFor = (name: string, currency: string, stage: Stage): Account => {
    const link = links.accounts.get(name);
    if (link && link !== "new") {
      const account = accountsById.get(link);
      if (!account) throw new CsvProblem("the linked account no longer exists");
      if (currency && account.currency !== currency) throw new CsvProblem("the currency {code} is not the currency of the account {name}", { code: currency, name: account.name });
      return account;
    }
    const code = currency || main;
    if (!((data.rates[code] ?? 0) > 0)) throw new CsvProblem("unknown currency {code}", { code });
    const made = madeAccounts.get(`${name}\u0000${code}`) ?? stage.accounts.find((a) => a.name === name && a.currency === code);
    if (made) return made;
    const account = blankAccount({ id: env.newId(), name, currency: code, color: PALETTE[(accountsById.size + stage.accounts.length) % PALETTE.length]! });
    stage.accounts.push(account);
    return account;
  };
  const categoryFor = (type: "income" | "expense", name: string, stage: Stage): Category => {
    const link = links.categories.get(categoryKey(type, name));
    if (link && link !== "new") {
      const category = categoriesById.get(link);
      if (!category) throw new CsvProblem("the linked category no longer exists");
      return category;
    }
    const [top = "", sub] = name.split(SEPARATOR).map((x) => x.trim());
    const find = (n: string, parent: string | null) => tree.get(treeKey({ type, parent, name: n })) ?? stage.categories.find((c) => c.type === type && c.name === n && (c.parent || null) === parent);
    const make = (n: string, parent: string | null) => {
      const category = blankCategory({ id: env.newId(), name: n, type, parent, currency: main, color: PALETTE[(categoriesById.size + stage.categories.length) % PALETTE.length]! });
      stage.categories.push(category);
      return category;
    };
    const parent = find(top, null) || make(top, null);
    return sub ? find(sub, parent.id) || make(sub, parent.id) : parent;
  };

  for (const r of records) {
    if (r.problem || !r.type || !r.date || r.minor === undefined) {
      plan.invalid.push({ line: r.line, reason: r.problem ?? { text: "invalid row" }, cells: r.cells });
      continue;
    }
    const stage: Stage = { accounts: [], categories: [] };
    try {
      let op: Operation = { id: env.newId(), type: r.type, date: r.date, amount: r.minor, comment: r.comment, tags: r.tags };
      if (r.from) op.from = accountFor(r.from, r.currency, stage).id;
      if (r.to) op.to = accountFor(r.to, r.type === "transfer" && r.toCurrency ? r.toCurrency : r.currency, stage).id;
      if (r.category && (r.type === "income" || r.type === "expense")) op.category = categoryFor(r.type, r.category, stage).id;
      if (r.received) {
        op.receive = r.received;
        op.receiveManual = true;
      }
      const lookup: Lookup = {
        account: (id) => (id ? (accountsById.get(id) ?? stage.accounts.find((x) => x.id === id)) : undefined),
        category: (id) => (id ? (categoriesById.get(id) ?? stage.categories.find((x) => x.id === id)) : undefined),
        main,
        rates: data.rates,
      };
      if (op.type === "adjustment" && Boolean(op.from) === Boolean(op.to)) throw new CsvProblem("an adjustment needs one account");
      op = validateOp(op, lookup);
      const key = duplicateKey(op);
      const before = known.get(key) ?? 0;
      if (before > 0) {
        known.set(key, before - 1);
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
      if (isPlanned(op, today)) plan.future++;
      plan.lines.push(r.line);
      if (r.ignoredSign) plan.ignoredSigns++;
      for (const tag of op.tags ?? [])
        if (!knownTags.has(tag)) {
          knownTags.add(tag);
          plan.newTags.push(tag);
        }
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      plan.invalid.push({ line: r.line, reason: { text: error.message, params: error.params }, cells: r.cells });
    }
  }
  return plan;
}

// ---- Adding and taking away ----

export interface Added {
  ops: string[];
  accounts: string[];
  categories: string[];
  tags: string[];
}

// Adds what the plan holds; what is dated ahead becomes a one-time scheduled payment, like one entered
// by hand. Returns what was added, which `undoImport` takes away again.
export function applyImport(tx: LedgerTx, plan: ImportPlan, env: Env): Added {
  if (!plan.ops.length) throw new DomainError("There is nothing to import.");
  const today = env.clock.today();
  tx.put("accounts", ...plan.created.accounts);
  tx.put("categories", ...plan.created.categories);
  tx.put("ops", ...plan.ops.filter((o) => !isPlanned(o, today)));
  tx.put("scheduled", ...plan.ops.filter((o) => isPlanned(o, today)).map((o) => scheduledForm(o, env.clock.time())));
  if (plan.newTags.length) tx.setTags([...tx.data.tags, ...plan.newTags]);
  return { ops: plan.ops.map((o) => o.id), accounts: plan.created.accounts.map((a) => a.id), categories: plan.created.categories.map((c) => c.id), tags: [...plan.newTags] };
}

// Takes away what an import added: its operations, and the accounts, categories and tags it made that
// nothing else uses by now.
export function undoImport(tx: LedgerTx, added: Added): void {
  const gone = new Set(added.ops);
  tx.remove("ops", ...tx.data.ops.filter((o) => gone.has(o.id)).map((o) => o.id));
  tx.remove("scheduled", ...tx.data.scheduled.filter((o) => gone.has(o.id)).map((o) => o.id));
  const records = () => [...tx.data.ops, ...tx.data.scheduled];
  const accountUsed = (id: string) => records().some((o) => o.from === id || o.to === id);
  tx.remove("accounts", ...added.accounts.filter((id) => tx.get("accounts", id) && !accountUsed(id)));
  for (let again = true; again; ) {
    const parents = new Set(tx.data.categories.map((c) => c.parent).filter(Boolean));
    const removable = added.categories.filter(
      (id) => tx.get("categories", id) && !records().some((o) => o.category === id) && !parents.has(id) && !tx.data.budgets.some((b) => b.categories?.includes(id)),
    );
    tx.remove("categories", ...removable);
    again = removable.length > 0;
  }
  const tags = tx.data.tags.filter((t) => !added.tags.includes(t) || tx.data.ops.some((o) => (o.tags ?? []).includes(t)));
  if (tags.length !== tx.data.tags.length) tx.setTags(tags);
}
