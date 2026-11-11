// The ledger database on the phone: one SQLite file in the application's private storage.
import { openDatabaseSync, type SQLiteBindValue } from "expo-sqlite";
import type { SqlDriver, SqlValue } from "../data/schema.ts";

export function openAppDatabase(): SqlDriver {
  const db = openDatabaseSync("monivra.db");
  db.execSync("PRAGMA journal_mode = WAL");
  db.execSync("PRAGMA busy_timeout = 5000");
  const bind = (params: readonly SqlValue[]) => params as SQLiteBindValue[];
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, bind(params));
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllSync<T>(sql, bind(params)),
  };
}
