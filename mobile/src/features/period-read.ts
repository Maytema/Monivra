// How a screen reads a period of the ledger: through the index (domain/period-index.ts). In the speed-check build the switch "plain scans" reads
// it the old way (every operation, every time) to compare the two on one build.
import { balancesAround } from "../domain/ledger.ts";
import { balancesAroundIndexed, operationsInIndexed } from "../domain/period-index.ts";
import { operationsIn, type Filters, type Period } from "../domain/periods.ts";
import type { LedgerData, Minor, Operation } from "../domain/types.ts";
import { perfFlags, PERF_BUILD } from "../platform/perf.ts";

export function periodOps(data: LedgerData, period: Period, filters: Filters): Operation[] {
  return PERF_BUILD && perfFlags.noIndex ? operationsIn(data, period, filters) : operationsInIndexed(data, period, filters);
}

export function periodBalances(
  data: Pick<LedgerData, "accounts" | "ops" | "rates" | "settings">,
  accountIds: readonly string[] | null,
  from: string,
  to: string,
): { opening: Minor; closing: Minor } {
  return PERF_BUILD && perfFlags.noIndex ? balancesAround(data, accountIds, from, to) : balancesAroundIndexed(data, accountIds, from, to);
}
