// What the page of one period of the operations shows, as a plain function of the ledger: the rows grouped by day, the places of the day heads
// (for the list's sticky heads) and the opening and closing balances. No React here, so it is tested on many random ledgers
// and can be asked for the neighbours of a period before a swipe reaches them. The last pages are kept (a small LRU): a swipe back
// to a page just left, or a page drawn twice, is not worked out again.
import { balancesAroundIndexed, operationsInIndexed } from "../domain/period-index.ts";
import { newestFirst } from "../domain/ledger.ts";
import { periodBounds, type Filters, type Period } from "../domain/periods.ts";
import type { LedgerData, Minor, Operation } from "../domain/types.ts";

export type PageItem = { kind: "day"; date: string; ops: Operation[] } | { kind: "op"; op: Operation };

export interface OperationsPage {
  items: PageItem[];
  // The places of the day heads in `items`.
  sticky: number[];
  // Shown over the list when the setting "opening balance" is on and nothing filters the page.
  balances: { opening: Minor; closing: Minor } | null;
}

// Whether the filters or the search narrow the page (the opening and closing balances are then not shown).
export const narrowed = (filters: Filters, query: string): boolean => !!(filters.accounts || filters.categories || filters.types || filters.tags || filters.origin || query);

function build(data: LedgerData, period: Period, filters: Filters, query: string): OperationsPage {
  const ops = operationsInIndexed(data, period, { ...filters, comment: query }).sort(newestFirst);
  // One pass: the list is newest first, so the days follow each other.
  const days = new Map<string, Operation[]>();
  for (const o of ops) {
    const day = days.get(o.date);
    if (day) day.push(o);
    else days.set(o.date, [o]);
  }
  const items: PageItem[] = [];
  const sticky: number[] = [];
  for (const [date, dayOps] of days) {
    sticky.push(items.length);
    items.push({ kind: "day", date, ops: dayOps });
    for (const op of dayOps) items.push({ kind: "op", op });
  }
  const [from, to] = periodBounds(period, data.settings);
  const balances = data.settings.opening && ops.length > 0 && !narrowed(filters, query) ? balancesAroundIndexed(data, filters.accounts, from, to) : null;
  return { items, sticky, balances };
}

const KEPT = 12;
let kept: { data: LedgerData; pages: Map<string, OperationsPage> } | null = null;

export function operationsPage(data: LedgerData, period: Period, filters: Filters, query: string): OperationsPage {
  // The pages are kept for one state of the ledger (the lists are replaced, never changed in place).
  if (!kept || kept.data !== data) kept = { data, pages: new Map() };
  const key = `${period.mode}:${periodBounds(period, data.settings).join("~")}|${JSON.stringify(filters)}|${query}`;
  const had = kept.pages.get(key);
  if (had) {
    kept.pages.delete(key);
    kept.pages.set(key, had);
    return had;
  }
  const page = build(data, period, filters, query);
  kept.pages.set(key, page);
  if (kept.pages.size > KEPT) kept.pages.delete(kept.pages.keys().next().value as string);
  return page;
}
