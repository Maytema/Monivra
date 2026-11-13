// The database: one SQLite file, the only place the ledger is kept. Balances are not stored (they
// follow from the operations); `account_balance` is the single SQL definition of a balance, used to
// cross-check the application's own computation. The occurrence of a scheduled payment is unique, so
// it cannot be recorded twice whoever records it.

export type SqlValue = string | number | null;

// The few calls the application needs; implemented over expo-sqlite on the phone and node:sqlite in
// tests. Synchronous: commands are short, and nothing else can run in between their statements.
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): void;
  all<T = Record<string, SqlValue>>(sql: string, params?: readonly SqlValue[]): T[];
}

export interface Migration {
  version: number;
  sql: string;
}

const RECORD_COLUMNS = `
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer','adjustment')),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  time TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  from_account TEXT REFERENCES account(id) DEFERRABLE INITIALLY DEFERRED,
  to_account TEXT REFERENCES account(id) DEFERRABLE INITIALLY DEFERRED,
  receive INTEGER CHECK (receive > 0),
  category_id TEXT REFERENCES category(id) DEFERRABLE INITIALLY DEFERRED,
  category_amount INTEGER,
  category_currency TEXT,
  fees_json TEXT,
  comment TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  photos_json TEXT,
  recalculated_json TEXT,
  extra_json TEXT,
  updated_at TEXT NOT NULL`;

const RECORD_CHECK = `
  CHECK (
    (type = 'expense' AND from_account IS NOT NULL AND to_account IS NULL AND category_id IS NOT NULL) OR
    (type = 'income' AND to_account IS NOT NULL AND from_account IS NULL AND category_id IS NOT NULL) OR
    (type = 'transfer' AND from_account IS NOT NULL AND to_account IS NOT NULL AND from_account <> to_account
       AND category_id IS NULL AND receive IS NOT NULL) OR
    (type = 'adjustment' AND (from_account IS NULL) <> (to_account IS NULL) AND category_id IS NULL))`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE setting (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE rate (code TEXT PRIMARY KEY CHECK (length(code) = 3), kgs_per_unit REAL NOT NULL CHECK (kgs_per_unit > 0));
CREATE TABLE tag (name TEXT PRIMARY KEY, sort_index INTEGER NOT NULL);
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('Regular','Savings','Debt')),
  currency TEXT NOT NULL,
  opening INTEGER NOT NULL,
  goal INTEGER NOT NULL DEFAULT 0,
  limit_amount INTEGER NOT NULL DEFAULT 0,
  total_debt INTEGER,
  debt TEXT NOT NULL CHECK (debt IN ('Owe me','I owe')),
  include_total INTEGER NOT NULL,
  archived INTEGER NOT NULL,
  favorite INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  consider_expense INTEGER NOT NULL,
  consider_income INTEGER NOT NULL,
  show_expense INTEGER NOT NULL,
  show_income INTEGER NOT NULL,
  sort_index INTEGER NOT NULL,
  extra_json TEXT,
  updated_at TEXT NOT NULL);
CREATE TABLE category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  parent_id TEXT REFERENCES category(id) DEFERRABLE INITIALLY DEFERRED,
  currency TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  archived INTEGER NOT NULL,
  sort_index INTEGER NOT NULL,
  extra_json TEXT,
  updated_at TEXT NOT NULL);
CREATE TABLE operation (
  id TEXT PRIMARY KEY,${RECORD_COLUMNS},
  schedule_id TEXT,
  occurrence_date TEXT,
  posted_at TEXT,
  posted_by_hand INTEGER NOT NULL DEFAULT 0,${RECORD_CHECK},
  CHECK ((schedule_id IS NULL) = (occurrence_date IS NULL)));
CREATE UNIQUE INDEX operation_occurrence ON operation(schedule_id, occurrence_date) WHERE schedule_id IS NOT NULL;
CREATE INDEX operation_date ON operation(date);
CREATE INDEX operation_from ON operation(from_account);
CREATE INDEX operation_to ON operation(to_account);
CREATE INDEX operation_category ON operation(category_id);
CREATE TABLE scheduled_payment (
  id TEXT PRIMARY KEY,${RECORD_COLUMNS},
  receive_manual INTEGER NOT NULL DEFAULT 0,
  recur_json TEXT,
  reminder_json TEXT,
  anchor_day INTEGER CHECK (anchor_day BETWEEN 1 AND 31),${RECORD_CHECK});
CREATE TABLE budget (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('day','week','month','year')),
  categories_json TEXT,
  sort_index INTEGER NOT NULL,
  updated_at TEXT NOT NULL);
CREATE TABLE tombstone (table_name TEXT NOT NULL, row_id TEXT NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY (table_name, row_id));
CREATE VIEW account_balance AS
SELECT a.id AS account_id,
  a.opening
  + COALESCE((SELECT SUM(COALESCE(o.receive, o.amount)) FROM operation o WHERE o.to_account = a.id), 0)
  - COALESCE((SELECT SUM(o.amount) FROM operation o WHERE o.from_account = a.id), 0) AS balance
FROM account a;
`,
  },
  {
    // Saved backups: copies of the whole ledger kept on the phone (the first application kept them
    // inside its data). The ten newest are kept; see data/backups.ts.
    version: 2,
    sql: `
CREATE TABLE backup (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('manual','auto','safety')),
  build TEXT NOT NULL,
  schema INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  data_json TEXT NOT NULL);
CREATE INDEX backup_at ON backup(at);
`,
  },
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export class DatabaseTooNew extends Error {}

// Brings the database to the newest schema, one migration per transaction. A database written by a
// newer version of the application is not touched.
export function migrate(db: SqlDriver): number {
  db.exec("PRAGMA foreign_keys = ON");
  const version = Number(db.all<{ user_version: number }>("PRAGMA user_version")[0]?.user_version ?? 0);
  if (version > SCHEMA_VERSION) throw new DatabaseTooNew(`database version ${version} is newer than ${SCHEMA_VERSION}`);
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    inTransaction(db, () => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
  return SCHEMA_VERSION;
}

// Runs `fn` in one transaction: all of it is written, or none of it.
export function inTransaction<T>(db: SqlDriver, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
