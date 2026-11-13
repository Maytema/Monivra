// The application's state and the only way to change the ledger. The database is the source of truth;
// the store keeps the ledger in memory for the screens. Every command runs on a working copy
// (LedgerTx), is written to the database in one transaction, and only then becomes the new state —
// so the screens never show something that was not stored.
import { LedgerTx, applyChange, isEmptyChange } from "../domain/change.ts";
import { completeData, createEmptyData, createStarterData, findDataProblem, readDataFile, writeDataFile } from "../domain/datafile.ts";
import type { Env } from "../domain/env.ts";
import { DomainError } from "../domain/errors.ts";
import { afterDeletion, DELETIONS, planRestore, type ConflictWay, type DeletionWay, type RestoreMode, type RestoreSummary, type ScheduledWay } from "../domain/restore.ts";
import { postDue, settleMissed } from "../domain/scheduled.ts";
import type { LedgerData } from "../domain/types.ts";
import { addBackup, deleteAllBackups, listBackups, readBackup, type BackupInfo, type BackupReason } from "../data/backups.ts";
export type { BackupInfo } from "../data/backups.ts";
import { loadLedger, persistChange, replaceLedger } from "../data/repository.ts";
import { DatabaseTooNew, inTransaction, migrate, type SqlDriver } from "../data/schema.ts";
import { RATE_PROVIDERS, type Fetcher } from "../services/rates/providers.ts";
import { refreshRates, shouldRefresh, type RateUpdateState } from "../services/rates/refresh.ts";

export const APP_VERSION = "0.2.0";

export type AppState =
  | { status: "loading" }
  // The stored data could not be opened (`tooNew`: written by a newer version of the application).
  | { status: "failed"; error: string; tooNew: boolean }
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
  // Saved backups (newest first), one backup's data, making one, restoring, deleting.
  backups(): BackupInfo[];
  backupData(id: string): LedgerData | null;
  createBackup(reason?: BackupReason): BackupInfo;
  dailyBackup(): BackupInfo | null;
  restore(incoming: LedgerData, options: { mode: RestoreMode; scheduled: ScheduledWay; conflicts: ConflictWay; safety?: boolean }): RestoreSummary;
  deleteData(way: DeletionWay, options?: { backup?: boolean }): void;
  // Recovery when the stored data cannot be opened: the newest saved backup that is whole, bringing data
  // back (in place, or in a fresh database when the old one cannot be written), starting empty.
  newestWholeBackup(): { at: string; data: LedgerData } | null;
  recoverWith(data: LedgerData): void;
  startEmpty(): void;
  updateRates(fetcher: Fetcher, force?: boolean): Promise<RateUpdateState | null>;
  env: Env;
}

// `setAside` puts an unreadable database file aside (kept, not deleted) and opens a fresh one.
export function createStore(firstDb: SqlDriver, env: Env, language: () => string, setAside?: () => SqlDriver): Store {
  let db = firstDb;
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

  const backupsChanged = () => {
    // The list of backups is not part of the ledger; screens that show it listen for a new revision.
    if (state.status === "ready") set({ ...state, revision: state.revision + 1 });
  };
  // Settings of this phone that a restore never takes from elsewhere: the PIN lives in the phone's
  // keystore, so the switch that says it is on must keep saying what the keystore holds.
  const keepDeviceSettings = (next: LedgerData, now: LedgerData): LedgerData => ({
    ...next,
    settings: { ...next.settings, pin: now.settings.pin, biometric: now.settings.biometric, lockDelay: now.settings.lockDelay },
  });
  const replaceAll = (next: LedgerData) => {
    replaceLedger(db, next, env.clock.nowIso());
    ready(loadLedger(db) ?? next);
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
        set({ status: "failed", error: error instanceof Error ? error.message : String(error), tooNew: error instanceof DatabaseTooNew });
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

    backups: () => listBackups(db),
    backupData: (id) => readBackup(db, id),

    createBackup(reason = "manual") {
      const info = addBackup(db, { id: env.newId(), at: env.clock.nowIso(), day: env.clock.today(), reason, build: APP_VERSION, schema: 1 }, current());
      backupsChanged();
      return info;
    },

    // The daily backup, when "Save locally" is on and none was made today.
    dailyBackup() {
      if (state.status !== "ready" || !state.data.settings.autoBackup) return null;
      const day = env.clock.today();
      if (listBackups(db).some((b) => b.day === day)) return null;
      return store.createBackup("auto");
    },

    // Brings data back from a backup or a data file (`incoming` checked beforehand). The plan is
    // checked as a whole before anything changes; `safety` makes a backup of the data first.
    restore(incoming, { mode, scheduled, conflicts, safety = true }) {
      const before = current();
      const plan = planRestore(before, incoming, { mode, scheduled, conflicts });
      if (plan.problem) throw new DomainError("This file has a record that does not pass the checks, so it cannot be restored.");
      if (safety) store.createBackup("safety");
      replaceAll(keepDeviceSettings(plan.next, before));
      if (scheduled === "skip") {
        const day = env.clock.today();
        const due = current().scheduled.filter((x) => x.date <= day).map((x) => x.id);
        if (due.length) store.run((tx) => due.forEach((id) => settleMissed(tx, id, false, env)));
      }
      store.postDueNow();
      return plan.summary;
    },

    deleteData(way, { backup = false } = {}) {
      const rule = DELETIONS[way];
      const before = current();
      if (backup && rule.backup) store.createBackup("safety");
      if (way === "backups" || way === "everything") deleteAllBackups(db);
      if (way !== "backups") {
        const empty = createEmptyData(language());
        replaceAll(way === "everything" ? empty : keepDeviceSettings(afterDeletion(way, before, empty), before));
      } else backupsChanged();
    },

    newestWholeBackup() {
      try {
        for (const b of listBackups(db)) {
          const data = readBackup(db, b.id);
          if (data && !findDataProblem(data)) return { at: b.at, data: completeData(data as unknown as Record<string, unknown>, language()) };
        }
      } catch {
        // The backups are as unreadable as the rest: there is none to offer.
      }
      return null;
    },

    recoverWith(data) {
      if (state.status === "ready") throw new Error("the ledger is open");
      if (state.status === "failed" && state.tooNew) throw new DomainError("The data was saved by a newer version of the application. Update the application.");
      const write = () => {
        migrate(db);
        replaceLedger(db, data, env.clock.nowIso());
      };
      try {
        write();
      } catch (error) {
        if (!setAside) throw error;
        db = setAside();
        write();
      }
      ready(loadLedger(db) ?? data);
      store.postDueNow();
    },

    startEmpty() {
      if (state.status === "failed" && state.tooNew) throw new DomainError("The data was saved by a newer version of the application. Update the application.");
      if (setAside) db = setAside();
      else
        inTransaction(db, () => {
          for (const table of ["operation", "scheduled_payment", "budget", "category", "account", "tag", "setting", "rate", "tombstone"]) db.run(`DELETE FROM ${table}`);
        });
      migrate(db);
      set({ status: "welcome", data: createEmptyData(language()) });
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
