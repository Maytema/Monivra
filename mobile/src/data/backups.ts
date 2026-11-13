// Saved backups: copies of the whole ledger kept in the database, newest first, at most ten
// (js/domain/backups.js kept them inside the stored data). A backup is the ledger as a data file
// holds it, so restoring one goes through the same checks as a file.
import type { LedgerData } from "../domain/types.ts";
import type { SqlDriver } from "./schema.ts";

export const MAX_BACKUPS = 10;
export type BackupReason = "manual" | "auto" | "safety";

export interface BackupInfo {
  id: string;
  at: string; // ISO moment it was made
  day: string; // local day it was made (the daily backup is one per day)
  reason: BackupReason;
  build: string;
  schema: number;
  accounts: number;
  categories: number;
  ops: number;
}

interface Row {
  id: string;
  at: string;
  day: string;
  reason: BackupReason;
  build: string;
  schema: number;
  summary_json: string;
}

export function listBackups(db: SqlDriver): BackupInfo[] {
  return db.all<Row>("SELECT id, at, day, reason, build, schema, summary_json FROM backup ORDER BY at DESC, rowid DESC").map((r) => ({
    id: r.id,
    at: r.at,
    day: r.day,
    reason: r.reason,
    build: r.build,
    schema: Number(r.schema),
    ...(JSON.parse(r.summary_json) as { accounts: number; categories: number; ops: number }),
  }));
}

export function readBackup(db: SqlDriver, id: string): LedgerData | null {
  const row = db.all<{ data_json: string }>("SELECT data_json FROM backup WHERE id = ?", [id])[0];
  return row ? ({ ...(JSON.parse(row.data_json) as LedgerData), backups: [] } as LedgerData) : null;
}

// Adds a backup and lets the oldest go beyond ten. Runs inside the caller's transaction, if any.
export function addBackup(db: SqlDriver, info: Omit<BackupInfo, "accounts" | "categories" | "ops">, data: LedgerData): BackupInfo {
  const summary = { accounts: data.accounts.length, categories: data.categories.length, ops: data.ops.length };
  db.run("INSERT INTO backup (id, at, day, reason, build, schema, summary_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    info.id,
    info.at,
    info.day,
    info.reason,
    info.build,
    info.schema,
    JSON.stringify(summary),
    JSON.stringify({ ...data, backups: [] }),
  ]);
  db.run(`DELETE FROM backup WHERE id NOT IN (SELECT id FROM backup ORDER BY at DESC, rowid DESC LIMIT ${MAX_BACKUPS})`);
  return { ...info, ...summary };
}

export function deleteAllBackups(db: SqlDriver): void {
  db.run("DELETE FROM backup");
}
