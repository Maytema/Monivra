// Shared test helpers: an in-memory SQLite database (node:sqlite), fixtures, a fixed environment.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fixedClock } from "../../src/domain/dates.ts";
import type { Env } from "../../src/domain/env.ts";
import { readDataFile } from "../../src/domain/datafile.ts";
import type { LedgerData } from "../../src/domain/types.ts";
import type { SqlDriver, SqlValue } from "../../src/data/schema.ts";

export function memoryDb(): SqlDriver {
  const db = new DatabaseSync(":memory:");
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...(params as SqlValue[]));
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.prepare(sql).all(...(params as SqlValue[])) as T[],
  };
}

const fixturesDir = new URL("../fixtures/", import.meta.url);
export const fixtureText = (name: string): string => readFileSync(new URL(`${name}.json`, fixturesDir), "utf8");
export const fixture = (name: "sample" | "report" | "withSchedules"): LedgerData => readDataFile(fixtureText(name), "en").data;
export const oldObservations = () => JSON.parse(fixtureText("old-observations")) as Record<string, any>;

export function testEnv(day = "2026-11-11", time = "12:00"): Env {
  let n = 0;
  return { clock: fixedClock(day, time), newId: () => `id-${++n}` };
}
