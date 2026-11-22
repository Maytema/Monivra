// Whether saving an operation takes a budget over its limit (the owner, 2026-11-22: not forbidden, but asked first).
// The operation is stored in a copy of the ledger that is thrown away, and every budget is compared before and after
// in the period that contains the operation's date: a budget counts when it ends up over its amount and this
// operation added to what it had spent (an edit that lowers an expense, or one already over that does not grow, asks
// nothing).
import { LedgerTx } from "./change.ts";
import { budgetState } from "./categories.ts";
import type { Env } from "./env.ts";
import { putOperation } from "./operations.ts";
import type { Budget, LedgerData, Minor, Operation, ScheduledPayment } from "./types.ts";

export interface CrossedBudget {
  budget: Budget;
  // How far over its amount it would be, in the budget's currency.
  over: Minor;
}

export function budgetsCrossed(before: LedgerData, after: LedgerData, date: string): CrossedBudget[] {
  const crossed: CrossedBudget[] = [];
  for (const b of after.budgets) {
    const was = budgetState(before, b, date).used;
    const now = budgetState(after, b, date).used;
    if (now > b.amount && now > was) crossed.push({ budget: b, over: now - b.amount });
  }
  return crossed;
}

// The budgets that saving this operation would take over their limit; none when it cannot be saved (the real save
// says why) or when it becomes a scheduled payment (nothing is spent yet).
export function budgetsCrossedBy(data: LedgerData, op: Operation | ScheduledPayment, env: Env, schedule: boolean): CrossedBudget[] {
  if (!data.budgets.length || schedule) return [];
  try {
    const tx = new LedgerTx(data);
    putOperation(tx, op, env, false);
    return budgetsCrossed(data, tx.data, op.date);
  } catch {
    return [];
  }
}
