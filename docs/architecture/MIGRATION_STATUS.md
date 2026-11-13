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

### Interface fidelity phase (second pass)

Written from the first application's code and `catalog/`; **checked locally only** (types with stubbed
platform modules, 45 domain/database tests, boundary check). Nothing below is claimed to look right on a
device until the emulator screenshots of the CI run have been compared with `catalog/`.

| # | State | What |
| - | ----- | ---- |
| 9  | coded | Bottom bar and screens follow the system insets (no fixed heights); sheet/dialog layer inside the app (`ui/sheets.tsx`), notice line, dialogs (`ui/dialogs.tsx`) |
| 10 | coded | Operation editor as a bottom sheet: date row, tiles, dual amounts, calculator keypad (double tap = calculator), Additionally, tax/commission, repeat, reminder, tags, party picker |
| 11 | coded | Categories (tiles, sum tabs, manage page, sheet, form with subcategory plans), statistics (blocks), More menu, info pages |
| 12 | coded | Scheduled payments page (sort, day groups, details, "Select date" dialog, missed-payments question) |
| 13 | coded | Account form (type step, customize icon/colour, calculator sheet, currency-change preview sheet), budgets (list, page, form, category selection), settings tree, rates page, currency sheet with search, bulk edit sheet, time dialog with a dial |

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

## Parity pass after the owner's film (2026-11-12, task `docs/agent/PARITY_TASK.md`)

Verified on the CI emulator (screenshots in `mobile-builds/builds/<n>/emulator/`): swipe over periods
(build 27), long press → selection mode, calendar from the operation editor, the operations list after a
change (build 28). Coded after the film and the catalog, to be compared on the next emulator run:

- **Speed — cause found:** on Hermes every `toLocaleString`, `localeCompare` and `Intl.*` call crosses a slow
  bridge to the system; money formatting (every amount on every row), sorting of operations, day headers and
  the currency list ran them hundreds of times per screen; the currency sheet also sat inside a ScrollView,
  which drew all ~160 rows. Replaced by plain arithmetic and built-in tables (checked against the platform on
  960k cases), hooks subscribe to their part of the ledger, lists are virtualized. `[perf]` timings go to the
  system log and the emulator test keeps them in `perf.txt`.
- Swipe: the next period/tab slides in only once drawn; no old content flashing back.
- Account form, switches, "Select type" sheet, "Customize icon", icon page (5×64 dp grid, virtualized), colour
  page (owner's choice: our wheel kept; one row of shades that fits the width; HEX with a fixed "#").
- Lock screen: fingerprint key bottom left (prompt once per lock, then on the key).
- Navigation filled icons and 3×3 "More"; FAB "+ Add"; selection icons; category tiles; donut; editor date
  "Today/Yesterday"; "Click on the value to edit"; Additionally cards; Change categories segmented tabs.

## Functional pass (2026-11-13, brief "complete, responsive, functionally faithful migration")

Built from the first application's code, each checked against its own results (parity fixtures written
by `test/parity/run-old.mjs`): Data section (menu, saved backups in the database with the daily copy,
restore page with merge/replace and the three ways for scheduled payments, data file page with Share and
Save to a folder, deletion page with its four ways and safeguards), CSV import wizard (columns, date order,
decimal point, UTF-8 / Windows-1251 / UTF-16, links, preview, list of left-out rows, undo, example and
template), export page (financial summary PDF, detailed transactions PDF, CSV; preview drawn from the
same commands as the PDF), recovery screen (unreadable data: copy, newest whole backup, data file, start
empty with the file put aside), first-start screen, Settings › Backups and Test notification.

Not possible here and why: printing a report (`expo-print`) and photo attachments (`expo-image-picker`)
need packages, and the work environment cannot install packages (network off) — the owner can allow
package installs in the network settings of the environment.

## Not yet in the new application (next priorities)

1. Emulator comparison of every screen of the brief with the old crawl (`tools/tour/crawl-old.mjs`) — the
   tour of `scripts/emulator-smoke.sh` now covers the Data section and every Settings page.
2. Printing and photo attachments (packages above).
3. Ordering of statistics blocks by drag (accounts, categories and subcategories done).
4. Privacy screen (hide in recents), reminder lead times other than "on the day", periodic reminder days.
5. Device checks on the owner's phone; background posting delays measured on two vendors (PoC P3).
