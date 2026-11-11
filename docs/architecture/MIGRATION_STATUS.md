# Migration status (checkpoint log)

The owner approved the migration on 2026-11-11 (React Native + Expo, export/import for existing data,
F-1 fixed, account deletion kept as is, free exchange-rate sources with replaceable providers).
Work branch: `rn-migration` (from `docs/react-native-architecture`). `main`, `android-first-apk` and
the first application are untouched; the first application stays the reference.

## How to resume

1. `git checkout rn-migration`; the new application is in `mobile/`.
2. Local checks need no install: `cd mobile && node --test test/*.test.ts` (Node 22, `node:sqlite`) and
   `tsc -p tsconfig.core.json` (domain, data, services, application).
3. Everything with React Native (types, APK) is checked by `.github/workflows/mobile.yml` on GitHub.
4. To refresh the parity reference after a change of the first application:
   `node mobile/test/parity/run-old.mjs` (Playwright runs the old code on the shared fixtures).

## Checkpoints

| # | State | What |
| - | ----- | ---- |
| 1 | done  | Domain core in TypeScript (money, ledger, periods, operations, scheduled, accounts, categories, budgets, data file v1), pure, with explicit recalculation rules |
| 2 | done  | SQLite schema v1 (constraints: unique occurrence, deferred foreign keys, type checks), one transaction per change, verified import |
| 3 | done  | Exchange-rate sources behind one interface, fallback chain, time limits, merge per currency, never blocking |
| 4 | done  | Parity harness: the old code's results on 3 fixtures recorded; the new domain matches them |
| 5 | done  | Store (application layer) over SQLite; tests with a real database |
| 6 | in progress | Expo application: screens for accounts, operations, editor, categories, statistics, scheduled, budgets, rates, data, settings; CI typecheck and APK |

## Decisions taken while implementing (routine, reversible)

- **Store = SQLite + in-memory ledger.** The database is the source of truth; commands run on a working
  copy (`LedgerTx`), are written in one transaction, then become the state. Reports read the in-memory
  ledger with the same pure functions as the parity tests. Hot queries can move to SQL later
  (`account_balance` view already exists and is cross-checked in tests).
- **Schema simplifications vs DATA_MIGRATION_PLAN §2:** fees, tags, photos, repeat and reminder are JSON
  columns of the record (they are always read with it); tags stay names (Q-F5 not decided). Unknown
  fields go to `extra_json`, so a data file loses nothing.
- **Occurrence ids are deterministic** (`<payment id>~<occurrence day>`), plus a unique index.
- **Translation** is a 60-line module with the old semantics (English keys, `ru.json` copied by a script,
  Russian plural forms) instead of i18next — no new dependency, same table.
- **Application id of the new app:** `app.monivra.finance.next` — side by side with the first
  application's `app.monivra.finance(.dev)`, which are not used or changed.
- **INTERNET permission** in the new app, used only for exchange rates (the owner asked for online
  rates). Nothing about the person is sent.

## Fixed defects of the first application (approved difference from parity)

| ID | Defect | Fix | Test |
| -- | ------ | --- | ---- |
| F-1 | Saving an unrelated change (tag, comment, date) re-priced a cross-currency amount at today's rate | Second amounts are facts; re-priced only when the amount, fees or a side's currency changes and the person did not type it | `finance-rules.test.ts` (3 tests) |
| F-14 | Changing one account's currency with "convert everything" converted **every adjustment of every account** and counted scheduled payments in the balance correction — another account lost money, and the changed account ended at the wrong balance (probe: 2,200.00 → 1,211.43 KGS on the other account; 705.33 instead of 211.05 USD) | Only the account's own records are converted; the correction counts operations only | `finance-rules.test.ts` "F-14" |

## Not yet in the new application (next priorities)

1. Reminders (local notifications) and background posting of scheduled payments (BACKGROUND_EXECUTION).
2. PIN / biometric lock, privacy screen.
3. Fees (tax, commission) editing in the editor (stored fees are kept and computed already).
4. Filters page, bulk selection/edit screen (domain is ready), CSV import/export, PDF reports.
5. Currency change preview screen, category subcategory management page, ordering by drag.
6. Swipe between tabs, the dial time picker, the exact visual match with `catalog/`.
7. Device checks on a phone (Maestro flows in CI later).
