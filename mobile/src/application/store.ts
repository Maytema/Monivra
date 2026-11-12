// The application's state and the only way to change the ledger. The database is the source of truth;
// the store keeps the ledger in memory for the screens. Every command runs on a working copy
// (LedgerTx), is written to the database in one transaction, and only then becomes the new state —
// so the screens never show something that was not stored.
import { LedgerTx, applyChange, isEmptyChange } from "../domain/change.ts";
import { createEmptyData, createStarterData, readDataFile, writeDataFile } from "../domain/datafile.ts";
import type { Env } from "../domain/env.ts";
import { postDue } from "../domain/scheduled.ts";
import type { LedgerData } from "../domain/types.ts";
import { loadLedger, persistChange, replaceLedger } from "../data/repository.ts";
import { migrate, type SqlDriver } from "../data/schema.ts";
import { RATE_PROVIDERS, type Fetcher } from "../services/rates/providers.ts";
import { refreshRates, shouldRefresh, type RateUpdateState } from "../services/rates/refresh.ts";

export const APP_VERSION = "0.2.0";

export type AppState =
  | { status: "loading" }
  | { status: "failed"; error: string }
  | { status: "welcome"; data: LedgerData }
  | { status: "ready"; data: LedgerData; revision: number; posted: string[] };

export interface Store {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  open(): void;
  begin(start: "empty" | "starter", translate: (s: string) => string): void;
  run<T>(command: (tx: LedgerTx, env: Env) => T): T;
  postDueNow(): string[];
  // Remembers operations that were posted by the application, until the person has seen them.
  notePosted(ids: string[]): void;
  forgetPosted(): void;
  importDataFile(text: string): { accounts: number; ops: number; scheduled: number };
  exportDataFile(): string;
  updateRates(fetcher: Fetcher, force?: boolean): Promise<RateUpdateState | null>;
  env: Env;
}

export function createStore(db: SqlDriver, env: Env, language: () => string): Store {
  let state: AppState = { status: "loading" };
  const listeners = new Set<() => void>();
  const set = (next: AppState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const ready = (data: LedgerData, posted: string[] = []) =>
    set({ status: "ready", data, revision: state.status === "ready" ? state.revision + 1 : 1, posted });
  const current = (): LedgerData => {
    if (state.status !== "ready") throw new Error("the ledger is not open");
    return state.data;
  };

  const store: Store = {
    env,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    open() {
      try {
        migrate(db);
        const data = loadLedger(db);
        if (!data) set({ status: "welcome", data: createEmptyData(language()) });
        else {
          ready(data);
          store.postDueNow();
        }
      } catch (error) {
        set({ status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    },

    begin(start, translate) {
      const data = start === "starter" ? createStarterData(language(), translate, env.newId) : createEmptyData(language());
      replaceLedger(db, data, env.clock.nowIso());
      ready(loadLedger(db) ?? data);
    },

    run(command) {
      const before = current();
      const tx = new LedgerTx(before);
      const result = command(tx, env);
      if (isEmptyChange(tx.change)) return result;
      const next = applyChange(before, tx.change);
      persistChange(db, tx.change, next, env.clock.nowIso());
      ready(next, state.status === "ready" ? state.posted : []);
      return result;
    },

    // Posts what came due (at start, when the app comes back, every minute while open).
    postDueNow() {
      if (state.status !== "ready") return [];
      const { posted } = store.run((tx) => postDue(tx, env));
      if (posted.length && state.status === "ready") set({ ...state, posted: [...state.posted, ...posted] });
      return posted;
    },

    notePosted(ids) {
      if (ids.length && state.status === "ready") set({ ...state, posted: [...state.posted, ...ids] });
    },

    forgetPosted() {
      if (state.status === "ready" && state.posted.length) set({ ...state, posted: [] });
    },

    // Replaces everything with a data file, verified record by record before it is kept.
    importDataFile(text) {
      const { data } = readDataFile(text, language());
      const counts = replaceLedger(db, data, env.clock.nowIso());
      ready(loadLedger(db) ?? data);
      store.postDueNow();
      return counts;
    },

    exportDataFile() {
      return writeDataFile(current(), { app: "Monivra", build: APP_VERSION, exportedAt: env.clock.nowIso() });
    },

    // Asks the rate sources when it is time (or when forced). Failure changes nothing but the note
    // of the last attempt.
    async updateRates(fetcher, force = false) {
      if (state.status !== "ready") return null;
      const data = state.data;
      const previous = (data.settings.rateUpdate as RateUpdateState | undefined) ?? null;
      if (!force && (!data.settings.autoRates || !shouldRefresh(previous, Date.now()))) return null;
      const result = await refreshRates({
        providers: RATE_PROVIDERS,
        fetcher,
        current: data.rates,
        keptByHand: data.settings.fixedRates ?? [],
        previous,
        now: env.clock.nowIso,
      });
      store.run((tx) => {
        if (result.state.ok) tx.setRates(result.rates);
        tx.setSettings({ rateUpdate: result.state });
      });
      return result.state;
    },
  };
  return store;
}
