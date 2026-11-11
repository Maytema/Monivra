// The two sides of an operation: money comes from the left one and goes to the right one. A category
// can only be a source (income) or a target (expense), never both, so a category on one side always
// means an account on the other. Only what is chosen changes; the rest of the operation stays as the
// person set it (js/domain/sides.js).
import { defaultAccountId } from "./ledger.ts";
import type { LedgerData, Operation } from "./types.ts";

type Sides = Pick<Operation, "type" | "category" | "from" | "to">;

// Whether the left (incoming) or right side of the operation holds an account.
const holdsAccount = (d: Sides, incoming: boolean): boolean => d.type !== (incoming ? "income" : "expense");

// Put a category on the left (incoming) or right side. The account of the operation moves to the other
// side; a new one is taken only when the operation had none.
export function putCategoryOnSide<T extends Sides>(data: LedgerData, d: T, incoming: boolean, categoryId: string): T {
  const account = incoming ? d.to || d.from : d.from || d.to;
  return {
    ...d,
    category: categoryId,
    type: incoming ? "income" : "expense",
    from: incoming ? null : account || defaultAccountId(data),
    to: incoming ? account || defaultAccountId(data) : null,
  };
}

// Put an account on the left or right side. Replacing an account leaves the rest alone; putting one
// where a category stood makes the operation a transfer, so the other side must be an account.
export function putAccountOnSide<T extends Sides>(data: LedgerData, d: T, incoming: boolean, accountId: string): T {
  if (holdsAccount(d, incoming)) return { ...d, [incoming ? "from" : "to"]: accountId };
  const other = incoming ? d.to : d.from;
  const otherAccount = other && other !== accountId ? other : defaultAccountId(data, accountId);
  return { ...d, type: "transfer", category: undefined, from: incoming ? accountId : otherAccount, to: incoming ? otherAccount : accountId };
}
