// A change to the ledger: what a command puts, removes and sets. Commands never mutate the data they
// are given; they work on a LedgerTx and hand its `change` to the persistence layer, which writes it
// in one database transaction, and to the store, which applies the same change in memory.
import type { Account, Budget, Category, LedgerData, Operation, Rates, ScheduledPayment, Settings } from "./types.ts";

export interface Lists {
  accounts: Account;
  categories: Category;
  ops: Operation;
  scheduled: ScheduledPayment;
  budgets: Budget;
}
export type ListKey = keyof Lists;
export const LIST_KEYS: readonly ListKey[] = ["accounts", "categories", "ops", "scheduled", "budgets"];

export interface Change {
  put: { [K in ListKey]?: Lists[K][] };
  remove: { [K in ListKey]?: string[] };
  // The new order of a list (ids), when the person reordered it.
  order: { accounts?: string[]; categories?: string[] };
  tags?: string[];
  settings?: Partial<Settings>;
  rates?: Rates;
}

export const emptyChange = (): Change => ({ put: {}, remove: {}, order: {} });

export const isEmptyChange = (c: Change): boolean =>
  LIST_KEYS.every((k) => !c.put[k]?.length && !c.remove[k]?.length) &&
  !c.order.accounts &&
  !c.order.categories &&
  !c.tags &&
  !c.settings &&
  !c.rates;

const upsert = <T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] => {
  if (!items.length) return list as T[];
  const next = [...list];
  const index = new Map(next.map((x, i) => [x.id, i]));
  for (const item of items) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, next.length);
      next.push(item);
    } else next[i] = item;
  }
  return next;
};

const reorder = <T extends { id: string }>(list: readonly T[], ids: readonly string[]): T[] => {
  const position = new Map(ids.map((id, i) => [id, i]));
  return [...list].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));
};

// The data after a change (new arrays only for what changed).
export function applyChange(data: LedgerData, c: Change): LedgerData {
  const next: LedgerData = { ...data };
  for (const key of LIST_KEYS) {
    const removed = c.remove[key];
    const put = c.put[key];
    if (!removed?.length && !put?.length) continue;
    let list = data[key] as { id: string }[];
    if (removed?.length) {
      const gone = new Set(removed);
      list = list.filter((x) => !gone.has(x.id));
    }
    if (put?.length) list = upsert(list, put as { id: string }[]);
    (next as unknown as Record<ListKey, unknown>)[key] = list;
  }
  if (c.order.accounts) next.accounts = reorder(next.accounts, c.order.accounts);
  if (c.order.categories) next.categories = reorder(next.categories, c.order.categories);
  if (c.tags) next.tags = c.tags;
  if (c.settings) next.settings = { ...next.settings, ...c.settings };
  if (c.rates) next.rates = c.rates;
  return next;
}

// A working copy that records what a command does.
export class LedgerTx {
  data: LedgerData;
  change: Change;
  constructor(data: LedgerData) {
    this.data = data;
    this.change = emptyChange();
  }

  get<K extends ListKey>(key: K, id: string | null | undefined): Lists[K] | undefined {
    if (!id) return undefined;
    return (this.data[key] as Lists[K][]).find((x) => x.id === id);
  }

  put<K extends ListKey>(key: K, ...items: Lists[K][]): void {
    if (!items.length) return;
    const one: Change = emptyChange();
    (one.put as Record<ListKey, unknown[]>)[key] = items;
    this.data = applyChange(this.data, one);
    const ids = new Set(items.map((x) => x.id));
    const removed = this.change.remove[key];
    if (removed) this.change.remove[key] = removed.filter((id) => !ids.has(id));
    const put = (this.change.put[key] ?? []).filter((x) => !ids.has(x.id));
    (this.change.put as Record<ListKey, unknown[]>)[key] = [...put, ...items];
  }

  remove<K extends ListKey>(key: K, ...ids: string[]): void {
    const existing = ids.filter((id) => this.get(key, id) !== undefined || this.change.put[key]?.some((x) => x.id === id));
    if (!existing.length) return;
    const one: Change = emptyChange();
    one.remove[key] = existing;
    this.data = applyChange(this.data, one);
    const gone = new Set(existing);
    const put = this.change.put[key];
    if (put) this.change.put[key] = put.filter((x) => !gone.has(x.id)) as Change["put"][K];
    this.change.remove[key] = [...new Set([...(this.change.remove[key] ?? []), ...existing])];
  }

  order(key: "accounts" | "categories", ids: string[]): void {
    const one: Change = emptyChange();
    one.order[key] = ids;
    this.data = applyChange(this.data, one);
    this.change.order[key] = ids;
  }

  setTags(tags: string[]): void {
    this.data = { ...this.data, tags };
    this.change.tags = tags;
  }

  setSettings(settings: Partial<Settings>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...settings } };
    this.change.settings = { ...this.change.settings, ...settings };
  }

  setRates(rates: Rates): void {
    this.data = { ...this.data, rates };
    this.change.rates = rates;
  }

  // A point to come back to when one part of a command fails and the rest goes on.
  mark(): { data: LedgerData; change: Change } {
    return { data: this.data, change: JSON.parse(JSON.stringify(this.change)) as Change };
  }

  restore(mark: { data: LedgerData; change: Change }): void {
    this.data = mark.data;
    this.change = mark.change;
  }
}
