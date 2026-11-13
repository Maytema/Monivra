// Operations as CSV, in the columns of the first application (js/data/csv.js), so its import and a
// spreadsheet read them the same way. Cells that a spreadsheet would run as a formula are protected.
import { accountById, categoryById, transferRoles } from "./ledger.ts";
import type { LedgerData, Operation } from "./types.ts";

export const CSV_COLUMNS = ["type", "date", "amount", "currency", "from", "to", "category", "comment", "tags", "to_amount", "to_currency", "counted_as"] as const;

const FORMULA_START = /^[=+\-@\t\r]/;
export const protectCell = (s: string): string => (FORMULA_START.test(s) ? `'${s}` : s);
const quote = (s: string): string => '"' + protectCell(s).replace(/"/g, '""') + '"';
const money = (n: number | undefined): string => ((n ?? 0) / 100).toFixed(2);

function cellsOf(data: LedgerData, o: Operation): Record<(typeof CSV_COLUMNS)[number], string> {
  const from = accountById(data, o.from),
    to = accountById(data, o.to);
  const category = categoryById(data, o.category);
  const crossCurrency = o.type === "transfer" && from?.currency !== to?.currency;
  const roles = transferRoles(data, o);
  return {
    type: o.type,
    date: o.date,
    amount: money(o.type === "income" ? (o.receive ?? o.amount) : o.amount),
    currency: (from ?? to)?.currency ?? "",
    from: from?.name ?? "",
    to: to?.name ?? "",
    category: category ? (category.parent ? `${categoryById(data, category.parent)?.name ?? ""} / ${category.name}` : category.name) : "",
    comment: o.comment ?? "",
    tags: (o.tags ?? []).join("|"),
    to_amount: crossCurrency ? money(o.receive) : "",
    to_currency: crossCurrency ? (to?.currency ?? "") : "",
    counted_as: roles.expense ? "expense" : roles.income ? "income" : "",
  };
}

// What a column is called for the person; the names in the file stay in English for other programs.
export const COLUMN_LABELS: Record<(typeof CSV_COLUMNS)[number], string> = {
  type: "Type",
  date: "Date",
  amount: "Amount",
  currency: "Currency",
  from: "From account",
  to: "To account",
  category: "Category",
  comment: "Comment",
  tags: "Tags",
  to_amount: "Amount received",
  to_currency: "Received in currency",
  counted_as: "Counted in reports as",
};

// The parts of an operation a file can leave out (the date is always written).
export type CsvPart = "type" | "accounts" | "amount" | "comment" | "tags";
const COLUMN_PART: Partial<Record<(typeof CSV_COLUMNS)[number], CsvPart>> = {
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

// The columns and rows of the file for the parts chosen (all by default), as plain text cells.
export function csvTable(data: LedgerData, ops: readonly Operation[], parts: Partial<Record<CsvPart, boolean>> = {}): { columns: (typeof CSV_COLUMNS)[number][]; rows: string[][] } {
  const columns = CSV_COLUMNS.filter((c) => c === "date" || parts[COLUMN_PART[c]!] !== false);
  return {
    columns,
    rows: ops.map((o) => {
      const cells = cellsOf(data, o);
      return columns.map((c) => cells[c]);
    }),
  };
}

// CSV text of the operations; with all parts it reads back through the import.
export function csvText(data: LedgerData, ops: readonly Operation[], parts: Partial<Record<CsvPart, boolean>> = {}): string {
  const { columns, rows } = csvTable(data, ops, parts);
  return [columns.join(","), ...rows.map((row) => row.map(quote).join(","))].join("\r\n");
}

// The example file of the import: a few rows of every kind of operation (js/data/csv.js csvExample).
export const CSV_EXAMPLE = [
  CSV_COLUMNS.join(","),
  "expense,2026-03-01,12.50,USD,Wallet,,Food / Lunch,Lunch with a friend,work|lunch,,,",
  "expense,2026-03-02,45.00,USD,Wallet,,Transport,Taxi,,,,",
  "income,2026-03-05,2500.00,USD,,Wallet,Salary,March salary,,,,",
  "transfer,2026-03-06,300.00,USD,Wallet,Savings,,Monthly saving,,,,",
  "transfer,2026-03-07,100.00,USD,Wallet,Euro wallet,,Exchange,,92.00,EUR,",
  "adjustment,2026-03-08,5.00,USD,,Wallet,,Found in a coat,,,,",
].join("\r\n");
