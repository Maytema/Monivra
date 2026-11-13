// The ledger database on the phone: one SQLite file in the application's private storage. When it cannot
// be read, the recovery screen can save a copy of the file and put it aside (renamed, never deleted).
import { openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase } from "expo-sqlite";
import { File, Paths } from "expo-file-system";
import type { SqlDriver, SqlValue } from "../data/schema.ts";

const NAME = "monivra.db";
let handle: SQLiteDatabase | null = null;

function driverOf(db: SQLiteDatabase): SqlDriver {
  const bind = (params: readonly SqlValue[]) => params as SQLiteBindValue[];
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, bind(params));
    },
    all: <T,>(sql: string, params: readonly SqlValue[] = []) => db.getAllSync<T>(sql, bind(params)),
  };
}

// A driver whose every call fails with the reason the file could not be opened: the store then shows
// the recovery screen instead of an empty ledger.
const unopened = (error: unknown): SqlDriver => {
  const fail = (): never => {
    throw error instanceof Error ? error : new Error(String(error));
  };
  return { exec: fail, run: fail, all: fail };
};

export function openAppDatabase(): SqlDriver {
  try {
    handle = openDatabaseSync(NAME);
    handle.execSync("PRAGMA journal_mode = WAL");
    handle.execSync("PRAGMA busy_timeout = 5000");
    return driverOf(handle);
  } catch (error) {
    handle = null;
    return unopened(error);
  }
}

// The database file and the files SQLite keeps beside it.
const sqliteFile = (suffix = "") => new File(Paths.document, "SQLite", NAME + suffix);

// The bytes of the database file as it is (for "Save a copy of the data").
export async function databaseBytes(): Promise<Uint8Array> {
  try {
    handle?.execSync("PRAGMA wal_checkpoint(FULL)");
  } catch {
    // A damaged file may refuse; the copy is then the file as it lies.
  }
  return sqliteFile().bytes();
}

// Puts the unreadable file aside under a dated name and opens a fresh, empty database.
export function setAsideDatabase(): SqlDriver {
  try {
    handle?.closeSync();
  } catch {
    // Closing a damaged file may fail; it is renamed all the same.
  }
  handle = null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = sqliteFile(suffix);
    if (file.exists) file.move(new File(Paths.document, "SQLite", `monivra-unreadable-${stamp}.db${suffix}`));
  }
  return openAppDatabase();
}
