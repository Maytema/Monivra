/* The two sides of an operation: money comes from the left one and goes to the right one.
   A category can only be a source (income) or a target (expense), never both, so a category
   on one side always means an account on the other. Only what is chosen changes; the rest of
   the operation stays as the person set it. */
import { defaultAccountId } from "./finance.js";

// Whether the left (incoming) or right side of the operation holds an account.
const holdsAccount = (d, incoming) => d.type !== (incoming ? "income" : "expense");

// Put a category on the left (incoming) or right side. The account of the operation moves to
// the other side; a new one is taken only when the operation had none.
export function putCategoryOnSide(d, incoming, categoryId) {
  const account = incoming ? d.to || d.from : d.from || d.to;
  d.category = categoryId;
  d.type = incoming ? "income" : "expense";
  d.from = incoming ? null : account || defaultAccountId();
  d.to = incoming ? account || defaultAccountId() : null;
}

// Put an account on the left or right side. Replacing an account leaves the rest alone; putting
// one where a category stood makes the operation a transfer, so the other side must be an account.
export function putAccountOnSide(d, incoming, accountId) {
  if (holdsAccount(d, incoming)) {
    d[incoming ? "from" : "to"] = accountId;
    return;
  }
  const other = incoming ? d.to : d.from;
  const otherAccount = other && other !== accountId ? other : defaultAccountId(accountId);
  d.type = "transfer";
  d.category = null;
  d.from = incoming ? accountId : otherAccount;
  d.to = incoming ? otherAccount : accountId;
}
