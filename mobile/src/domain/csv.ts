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

export function csvText(data: LedgerData, ops: readonly Operation[]): string {
  const rows = ops.map((o) => {
    const cells = cellsOf(data, o);
    return CSV_COLUMNS.map((c) => quote(cells[c])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n");
}
