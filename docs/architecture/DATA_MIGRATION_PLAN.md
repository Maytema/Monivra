# Data architecture and migration plan

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). Design is **[R]** unless marked.
Rule zero: **the migration never deletes, overwrites or "fixes" the old data**; it reads, imports into a new
database in one transaction, verifies, and keeps the source until the person decides.

## 1. What exists today [V]

| Store                                            | Content                                                                                        | Who can read it                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| WebView `localStorage` `monivra.offline.2026.v1` | The whole dataset as JSON (`schema: 1`), incl. ≤10 inner backups and photos as data URLs       | Only JS running in the WebView at origin `https://localhost` of this app |
| `localStorage …saves`                            | Save counter                                                                                   | same                                                                     |
| `files/mirror/data.json` (+ `data.prev.json`)    | `{v:1, savedAt, seq, sha256, text}` where `text` is the same JSON; written ≤0.8 s after a save | Any code of the same app id (same Linux uid)                             |
| `files/secure/*`                                 | PIN verifier, AES-GCM with Keystore key `monivra_secure_v1`                                    | Same app id, via Keystore                                                |
| Data files exported by the person                | Same JSON without inner backups, plus `meta`                                                   | Anyone the person gives them to                                          |
| Android auto-backup                              | Disabled (`allowBackup="false"`)                                                               | —                                                                        |

**React Native cannot read the WebView's `localStorage`** (Chromium stores it in an internal LevelDB
format; there is no supported API from outside that WebView). This plan does not rely on it.

## 2. Target schema (SQLite)

Conventions: `TEXT` primary keys (old ids kept verbatim; new ids UUIDv7); money columns `*_minor INTEGER`
in **hundredths for every currency** (parity with today, `meta.amount_scale = 100`; see Q-F2); dates `TEXT
'YYYY-MM-DD'`, times `TEXT 'HH:MM'`, instants `TEXT` ISO-8601 UTC; booleans `INTEGER 0/1`; every syncable
table has `created_at`, `updated_at`; deletes are hard deletes that write a row into `tombstone` (keeps
queries simple and is enough for sync later); `extra_json TEXT` keeps fields of the old JSON that have no
column, so nothing is silently dropped.

```sql
PRAGMA foreign_keys = ON;  PRAGMA journal_mode = WAL;  PRAGMA busy_timeout = 5000;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);           -- install_id, amount_scale, legacy_import …
CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE setting (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE currency_rate (code TEXT PRIMARY KEY CHECK (length(code) = 3),
  kgs_per_unit REAL NOT NULL CHECK (kgs_per_unit > 0), fixed INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);

CREATE TABLE account (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 64),
  type TEXT NOT NULL CHECK (type IN ('regular','savings','debt')),
  currency TEXT NOT NULL REFERENCES currency_rate(code),
  opening_minor INTEGER NOT NULL, goal_minor INTEGER NOT NULL DEFAULT 0 CHECK (goal_minor >= 0),
  limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (limit_minor >= 0), total_debt_minor INTEGER CHECK (total_debt_minor >= 0),
  debt_direction TEXT NOT NULL DEFAULT 'owe_me' CHECK (debt_direction IN ('owe_me','i_owe')),
  include_in_total INTEGER NOT NULL, archived INTEGER NOT NULL, favorite INTEGER NOT NULL,
  consider_expense INTEGER NOT NULL, consider_income INTEGER NOT NULL, show_expense INTEGER NOT NULL, show_income INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL, color TEXT NOT NULL, sort_index INTEGER NOT NULL,
  extra_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX account_one_favorite ON account(favorite) WHERE favorite = 1;

CREATE TABLE category (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income','expense')),
  parent_id TEXT REFERENCES category(id), currency TEXT NOT NULL REFERENCES currency_rate(code),
  icon TEXT NOT NULL, color TEXT NOT NULL, archived INTEGER NOT NULL, sort_index INTEGER NOT NULL,
  extra_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
-- trigger: parent is top-level and of the same type (today's findDataProblem rule)

CREATE TABLE tag (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_index INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE operation (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer','adjustment')),
  date TEXT NOT NULL, time TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  from_account_id TEXT REFERENCES account(id), to_account_id TEXT REFERENCES account(id),
  receive_minor INTEGER CHECK (receive_minor > 0), receive_manual INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES category(id),
  category_amount_minor INTEGER, category_currency TEXT,
  comment TEXT NOT NULL DEFAULT '',
  schedule_id TEXT, occurrence_date TEXT, posted_at TEXT, posted_by_hand INTEGER NOT NULL DEFAULT 0,
  recalculated_amount_minor INTEGER, recalculated_currency TEXT,
  extra_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK ((schedule_id IS NULL) = (occurrence_date IS NULL)),
  CHECK (
    (type = 'expense'    AND from_account_id IS NOT NULL AND to_account_id IS NULL AND category_id IS NOT NULL) OR
    (type = 'income'     AND to_account_id IS NOT NULL AND from_account_id IS NULL AND category_id IS NOT NULL) OR
    (type = 'transfer'   AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL
                         AND from_account_id <> to_account_id AND category_id IS NULL AND receive_minor IS NOT NULL) OR
    (type = 'adjustment' AND (from_account_id IS NULL) <> (to_account_id IS NULL) AND category_id IS NULL)));
CREATE UNIQUE INDEX operation_occurrence ON operation(schedule_id, occurrence_date) WHERE schedule_id IS NOT NULL;
CREATE INDEX operation_date ON operation(date);
CREATE INDEX operation_from ON operation(from_account_id, date);
CREATE INDEX operation_to ON operation(to_account_id, date);
CREATE INDEX operation_category ON operation(category_id, date);

CREATE TABLE operation_fee (operation_id TEXT NOT NULL REFERENCES operation(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('tax','commission')),
  percent REAL, fixed_minor INTEGER, is_addition INTEGER NOT NULL,
  CHECK ((percent IS NULL) <> (fixed_minor IS NULL)), PRIMARY KEY (operation_id, position));
CREATE TABLE operation_tag (operation_id TEXT NOT NULL REFERENCES operation(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id), PRIMARY KEY (operation_id, tag_id));

CREATE TABLE scheduled_payment (            -- same template columns and CHECK as operation, plus the rule
  id TEXT PRIMARY KEY, type TEXT NOT NULL, next_date TEXT NOT NULL, time TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0), from_account_id TEXT REFERENCES account(id),
  to_account_id TEXT REFERENCES account(id), receive_minor INTEGER, receive_manual INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES category(id), category_amount_minor INTEGER, category_currency TEXT,
  comment TEXT NOT NULL DEFAULT '',
  recur_every INTEGER CHECK (recur_every BETWEEN 1 AND 365),
  recur_unit TEXT CHECK (recur_unit IN ('days','weeks','months','years')),
  recur_weekdays TEXT NOT NULL DEFAULT '', recur_remaining INTEGER CHECK (recur_remaining >= 1),
  anchor_day INTEGER CHECK (anchor_day BETWEEN 1 AND 31),
  reminder_before INTEGER, reminder_unit TEXT, reminder_time TEXT,
  extra_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE scheduled_fee (…same as operation_fee, scheduled_payment_id…);
CREATE TABLE scheduled_tag (…same as operation_tag, scheduled_payment_id…);

CREATE TABLE attachment (id TEXT PRIMARY KEY, operation_id TEXT REFERENCES operation(id) ON DELETE CASCADE,
  scheduled_payment_id TEXT REFERENCES scheduled_payment(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL, CHECK ((operation_id IS NULL) <> (scheduled_payment_id IS NULL)));

CREATE TABLE budget (id TEXT PRIMARY KEY, name TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL REFERENCES currency_rate(code),
  period TEXT NOT NULL CHECK (period IN ('day','week','month','year')), all_categories INTEGER NOT NULL,
  sort_index INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE budget_category (budget_id TEXT NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES category(id) ON DELETE CASCADE, PRIMARY KEY (budget_id, category_id));

CREATE TABLE tombstone (table_name TEXT NOT NULL, row_id TEXT NOT NULL, deleted_at TEXT NOT NULL,
  PRIMARY KEY (table_name, row_id));

CREATE VIEW account_balance AS                 -- the ONE definition of a balance (F-2)
SELECT a.id AS account_id,
       a.opening_minor
     + COALESCE((SELECT SUM(COALESCE(o.receive_minor, o.amount_minor)) FROM operation o WHERE o.to_account_id = a.id), 0)
     - COALESCE((SELECT SUM(o.amount_minor) FROM operation o WHERE o.from_account_id = a.id), 0) AS balance_minor
FROM account a;
```

Notes:

- Deleting an account or category keeps today's cascade **in the use case** (explicit plan shown to the
  person), not with `ON DELETE CASCADE` on operations, so a stray delete cannot silently remove history.
- `operation_occurrence` makes exactly-once a database guarantee (F-13). Today a deleted posted operation
  frees its occurrence; a hard delete keeps that behaviour (parity), see Q-F6.
- Fixed fees today are stored in major units as floats (`value`); conversion to `fixed_minor =
round(value × 100)` is lossless only if no stored value has more than two decimals — the import checks
  and reports any such value (`extra_json` keeps the original).
- Inner backups (`appData.backups`) are not tables: they become backup **files** (§4).

## 3. Schema versioning and migrations

- Version = highest applied migration (`schema_migration` + `PRAGMA user_version`). Migrations are ordered
  SQL files with a checksum; an edited applied migration fails CI.
- Each migration runs in one transaction. Before it runs the database file is copied to
  `backups/pre-v<N>.db` (kept until the next successful start). After it: `PRAGMA integrity_check`,
  `PRAGMA foreign_key_check`; failure → rollback, restore the copy, show the recovery screen.
- An app that finds a **newer** schema than it knows refuses to write (downgrade protection) and offers the
  data-file export.
- Every migration has a test: build the previous schema with fixture rows, migrate, assert row-level
  expectations and the financial invariants (TEST_STRATEGY §2.3).

## 4. Backups, data files, compatibility

| Need                           | Design                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read today's data files        | `domain/transfer-formats/v1` reader = port of `backup-file.js` checks + `findDataProblem` + `completeData`; kept forever                                      |
| Write a file the old app reads | Export **v1-compatible JSON** (photos inline as today) while the data model has nothing v1 cannot hold — this is also the rollback path to the Capacitor app  |
| New format                     | v2 (normalised, attachments) only when a feature needs it; v2 reader + v1 reader both kept                                                                    |
| Inner backups                  | Files in app storage: `VACUUM INTO` copies of the database (or v1 JSON), newest 10, auto daily (local day), safety copy before restore/merge/delete/migration |
| Restore / merge                | Port of `planRestore` (merge identity = record id, local version by default), applied in one transaction                                                      |
| CSV                            | Port of `csv.js`/`csv-import.js` (same columns, `counted_as`, formula protection, duplicates rule)                                                            |

## 5. Validation of an import (old data → new database)

All in one transaction; commit only if every check passes:

1. `sha256` of the mirror text matches (mirror path) / file passes v1 untrusted-input checks.
2. `findDataProblem` port returns no problem (if it does: nothing imported, the person sees the sentence, as
   today's recovery screen).
3. Row counts per list equal the JSON counts (ops, scheduled, accounts, categories, tags, budgets, photos).
4. For every account: balance from the SQL view = balance by the **old JS algorithm** on the JSON (run in
   the parity harness in tests; in the app, by the ported TS function).
5. Sums of `amount` by type, by month; every `fromSchedule` link present as `(schedule_id,
occurrence_date)`; every scheduled payment's next date and rule.
6. Round trip: export v1 from the new DB and compare with the input JSON (deep equality modulo a written
   list of normalisations, e.g. key order, default fields added by `completeData`).
7. Record `meta.legacy_import = {source, sha256, seq, counts, imported_at}`.

## 6. Moving existing Android installs

Facts [V/D]: current test builds use applicationId `app.monivra.finance.dev` signed with the owner's test
key (certificate SHA-256 `7E:04:1A:…:97:84`); the code package and intended production id is
`app.monivra.finance`, never published. Android treats an APK with the same id and key and a higher
`versionCode` as an update and keeps the app's private storage; a different id is a separate app with its
own storage; a different key for the same id is refused (the CI emulator test checks the refusal; not re-run in this audit [D]).

| Path                                   | How                                                                                                                                                                                                       | +                                                                                                              | −                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Data file (recommended default)** | Old app: More → Data → save data file. New app (any id, any platform): onboarding "Bring data from the old app" → pick the file → §5 import                                                               | No native tricks; works for iOS and for any id; old app stays installed as fallback; same code path as restore | Person has to do two steps; photos travel inside the file (size)                                                                                                                                                  |
| **B. In-place upgrade (optional)**     | New app built as `app.monivra.finance.dev`, same key, higher `versionCode`; first start reads `files/mirror/data.json` via `expo-file-system` [A: `documentDirectory` = `filesDir`], verifies and imports | Zero steps for the person                                                                                      | Mirror may miss the last ≤0.8 s (T-17); the old app is gone after the update (rollback = re-install old APK + data file); PIN verifier needs a small native read or a PIN re-setup; leftover Capacitor alarms [A] |
| C. Read WebView storage                | Hidden WebView or LevelDB parsing                                                                                                                                                                         | —                                                                                                              | Rejected: unsupported, fragile                                                                                                                                                                                    |

Recommendation: **A for everyone; B only if the owner wants the `.dev` installs upgraded in place and PoC
P4 passes.** With B, ship a last Capacitor "bridge" build first that flushes the mirror on every save
before returning and writes `files/migration-ready.json {seq, sha256}`, so the new app can prove the mirror
is complete. The production id `app.monivra.finance` starts clean (Q-M1).

PIN after migration: recommend asking the person to set the PIN again (it is a screen lock; the data file
does not carry the verifier on Android) — Q-M3.

## 7. Recovery and rollback

| Failure                                   | Outcome                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Import check fails                        | Transaction rolled back; new DB stays empty; old data untouched; person sees why and can send the file to support |
| Crash during import                       | Same (uncommitted transaction); next start retries                                                                |
| Bug found after migration                 | Path A: old app still installed with its data. Path B: v1 export from new app → install old APK → import          |
| Migration of a later schema version fails | Pre-migration DB copy restored; app shows recovery screen with export                                             |
| Database corrupt                          | `integrity_check` at start; offer newest backup file; export what can be read                                     |

## 8. Proof of concept P4 (migration), before C2

1. Fixtures: the sample data, the report fixture, an anonymised real-size dataset (owner's export with
   amounts and names scrambled, if the owner agrees — Q-M2), a dataset with every legacy shape
   (`completeData` migrations), a damaged file, a 20 MB file with photos.
2. Run the import in Node (TS domain + `node:sqlite`) and on an Android emulator (expo-sqlite).
3. Assert §5 checks; measure time and peak memory for 10k / 50k / 100k operations.
4. Path B only: install the current signed `.dev` APK, enter data, update with the RN build signed with the
   same key; check mirror read, counts, balances, reminders rescheduled, no crash when a stale Capacitor
   alarm fires (wait past one), `versionCode` ordering.
5. Exit: all checks green, owner reviews the report → checkpoint C2.
