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
| 6 | done  | Expo application: screens for accounts, operations (period, search, filters), editor (calculator, two currencies, fees, repeat, reminder, tags), categories, statistics, scheduled (Add now / Skip / far behind), budgets, rates, data (data file in/out, CSV), settings |
| 7 | done  | Reminders as local notifications (plan identical to the old one — parity test), background task for posting (WorkManager/BGTaskScheduler via expo-background-task), PIN lock with keystore and fingerprint |
| 8 | done  | CI: types, tests, release APK; emulator smoke test; results published to branch `mobile-builds` (new commits only) |

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

## Found on the emulator (CI smoke test)

- Build 5: the release APK stopped at start — WorkManager's Room database constructor was removed by
  code shrinking (`WorkDatabase_Impl.<init>`). Fixed with keep rules (expo-build-properties); build 6 starts.
- Build 6: first start, the basic set, the accounts screen and the calculator work; saving an expense
  without a category is refused with "Select a category" (correct). The smoke test now picks a category.
- **Build 7 (commit `990d22b`): all green** — types, 37 tests, release APK, emulator smoke test passed
  (first start → basic set → expense 125 by the calculator with a category → shown on the account and in
  the history → still there after the app is stopped and started again → no crash). Re-signed with the
  owner's test key (certificate SHA-256 `7e041ae5…bc9784`): `Monivra-RN-0.2.0-build.7.apk`, SHA-256
  `2925960c34ac3d8f1669b8fb8d85344bc84807b6459cf772ead4500347cf2463`.
- Not checked by any automated test yet: import of a real data file on the phone, notifications delivered
  by the system, the background task actually running, PIN/fingerprint, rates from the network on the phone.

## Fixed defects of the first application (approved difference from parity)

| ID | Defect | Fix | Test |
| -- | ------ | --- | ---- |
| F-1 | Saving an unrelated change (tag, comment, date) re-priced a cross-currency amount at today's rate | Second amounts are facts; re-priced only when the amount, fees or a side's currency changes and the person did not type it | `finance-rules.test.ts` (3 tests) |
| F-14 | Changing one account's currency with "convert everything" converted **every adjustment of every account** and counted scheduled payments in the balance correction — another account lost money, and the changed account ended at the wrong balance (probe: 2,200.00 → 1,211.43 KGS on the other account; 705.33 instead of 211.05 USD) | Only the account's own records are converted; the correction counts operations only | `finance-rules.test.ts` "F-14" |

## Not yet in the new application (next priorities)

1. Bulk selection and bulk edit screen (domain `applyBulkChanges` is ready and tested).
2. PDF reports (model exists in the old app; render as HTML → `expo-print`), CSV import wizard.
3. Merge-restore of a data file (today: replace with verification), inner backups as files, deletion modes.
4. Currency change preview, subcategory management page, ordering by drag, account/category icons and colour wheel as in the old app.
5. Privacy screen (hide in recents), reminder lead times other than "on the day", periodic reminder days.
6. Swipe between tabs, the dial time picker, date picker, exact visual match with `catalog/`.
7. Device checks on the owner's phone; background posting delays measured on two vendors (PoC P3).
