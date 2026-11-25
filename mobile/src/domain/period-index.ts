// An index over the operations for reading a period without going through all of them: the operations by date, and the running
// balance of every account at the end of each day that has operations. A period is then a slice (found by binary search) and the
// opening and closing balance two lookups per account, whatever the number of operations. Money is only read, in whole minor units, with
// the same rules as `operationsIn` (periods.ts) and `balancesAround` (ledger.ts), which stay as the reference these functions are tested
// against. The index is made once for a list of operations (lists are replaced, never changed in place) and kept by its identity.
import { convert } from "./money.ts";
import { operationMatchesFilters, periodBounds, type Filters, type Period } from "./periods.ts";
import type { LedgerData, Minor, Operation } from "./types.ts";

export interface PeriodIndex {
  // The operations by date ascending, and the place each had in the list it came from.
  readonly sorted: readonly Operation[];
  readonly origin: readonly number[];
  // The days that have operations, ascending, and for each day the end of its run in `sorted`: day k holds sorted[end[k-1] .. end[k]).
  readonly days: readonly string[];
  readonly end: readonly number[];
  // Per account: the running sum of what the operations did to it, `running[k]` = before day k (length days + 1).
  readonly running: ReadonlyMap<string, Float64Array>;
}

const indexes = new WeakMap<readonly Operation[], PeriodIndex>();

export function periodIndex(ops: readonly Operation[]): PeriodIndex {
  let index = indexes.get(ops);
  if (!index) indexes.set(ops, (index = build(ops)));
  return index;
}

function build(ops: readonly Operation[]): PeriodIndex {
  const n = ops.length;
  // Lists come in date order or its reverse as a rule: then no sort is needed (the place in the list is kept, and a slice is put back in
  // that order, so within one day the order does not matter here).
  let up = true;
  let down = true;
  for (let i = 1; i < n && (up || down); i++) {
    if (ops[i]!.date < ops[i - 1]!.date) up = false;
    if (ops[i]!.date > ops[i - 1]!.date) down = false;
  }
  let order: number[];
  if (up) order = Array.from({ length: n }, (_, i) => i);
  else if (down) order = Array.from({ length: n }, (_, i) => n - 1 - i);
  else {
    order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => (ops[a]!.date < ops[b]!.date ? -1 : ops[a]!.date > ops[b]!.date ? 1 : a - b));
  }
  const sorted = order.map((i) => ops[i]!);
  const days: string[] = [];
  const end: number[] = [];
  for (let i = 0; i < n; i++) {
    const date = sorted[i]!.date;
    if (days.length === 0 || days[days.length - 1] !== date) {
      days.push(date);
      end.push(i + 1);
    } else end[end.length - 1] = i + 1;
  }
  // Running sums: first the change per day and account, then the sums over the days.
  const perDay = new Map<string, Float64Array>();
  const slot = (id: string): Float64Array => {
    let a = perDay.get(id);
    if (!a) perDay.set(id, (a = new Float64Array(days.length + 1)));
    return a;
  };
  let day = 0;
  for (let i = 0; i < n; i++) {
    while (end[day]! <= i) day++;
    const o = sorted[i]!;
    // The same effect as `effectOn` in ledger.ts: a transfer received `receive`, the other side gave `amount`.
    if (o.to) slot(o.to)[day + 1]! += o.receive ?? o.amount;
    if (o.from) slot(o.from)[day + 1]! -= o.amount;
  }
  for (const a of perDay.values()) for (let k = 1; k < a.length; k++) a[k]! += a[k - 1]!;
  return { sorted, origin: order, days, end, running: perDay };
}

// The number of days that are before `date` (the first day not before it), and that are not after it.
const dayCountBefore = (index: PeriodIndex, date: string): number => {
  let lo = 0;
  let hi = index.days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.days[mid]! < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const dayCountThrough = (index: PeriodIndex, date: string): number => {
  let lo = 0;
  let hi = index.days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.days[mid]! <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const placeOfDay = (index: PeriodIndex, k: number): number => (k === 0 ? 0 : index.end[k - 1]!);

// The first day that has an operation, or null.
export function firstDay(index: PeriodIndex): string | null {
  return index.days[0] ?? null;
}

// The same operations as `operationsIn`, in the same order (the order of the list the index was made from).
export function operationsInIndexed(data: LedgerData, period: Period, filters: Filters): Operation[] {
  const index = periodIndex(data.ops);
  const [a, b] = periodBounds(period, data.settings);
  const from = placeOfDay(index, dayCountBefore(index, a));
  const to = placeOfDay(index, dayCountThrough(index, b));
  if (to <= from) return [];
  const picked: number[] = [];
  const open = !filters.accounts && !filters.categories && !filters.types && !filters.tags && !filters.comment && !filters.origin;
  for (let i = from; i < to; i++) if (open || operationMatchesFilters(data, index.sorted[i]!, filters)) picked.push(i);
  picked.sort((x, y) => index.origin[x]! - index.origin[y]!);
  return picked.map((i) => index.sorted[i]!);
}

// The same figures as `balancesAround`: the total of the counted accounts in the main currency before the first day and at the end of the last day.
export function balancesAroundIndexed(
  data: Pick<LedgerData, "accounts" | "ops" | "rates" | "settings">,
  accountIds: readonly string[] | null,
  from: string,
  to: string,
): { opening: Minor; closing: Minor } {
  const index = periodIndex(data.ops);
  const counted = data.accounts.filter((a) => a.include && !a.archived && (!accountIds || accountIds.includes(a.id)));
  const through = dayCountThrough(index, to);
  // `balancesAround` leaves out what is after `to` and counts as early what is before `from`: an empty period (from after to) has no early ones past `to`.
  const before = Math.min(dayCountBefore(index, from), through);
  const at = (a: { id: string }, k: number): number => index.running.get(a.id)?.[k] ?? 0;
  const sum = (k: number) => counted.reduce((s, a) => s + convert(a.opening + at(a, k), a.currency, data.settings.currency, data.rates), 0);
  return { opening: sum(before), closing: sum(through) };
}
