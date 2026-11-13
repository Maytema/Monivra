# Architecture of the new application (`mobile/`)

What is actually built, as of the branch `rn-migration`. The first application's architecture is in
[legacy/ARCHITECTURE.md](legacy/ARCHITECTURE.md); the design written before the migration (some of it never
built, see "Known problems") is in [architecture/](architecture/README.md).

## 1. Entry points

- `mobile/index.ts` imports `src/platform/background.ts` first (the background task must be defined even
  when no screen runs), then `expo-router/entry`.
- `src/app/_layout.tsx` is the root: opens the store (`platform/app-store.ts`), shows the first-start choice
  (`features/welcome.tsx`) or the failure text, keeps scheduled payments and rates current (`KeepCurrent`:
  at start, when the app becomes active, every 60 s), wraps everything in the lock (`features/lock.tsx`
  `LockGate`), a keyboard-avoiding view and the layer host of sheets (`ui/sheets.tsx`).
- Configuration: `mobile/app.config.ts` (id `app.monivra.finance.next`, plugins: router, SQLite, sharing,
  localization, status bar, background task, secure store, build properties with ProGuard rules for
  WorkManager).

## 2. Navigation and screens

- Expo Router stack: `(tabs)` (five tabs with the custom bar `ui/tab-bar.tsx`, `freezeOnBlur`) and pushed
  pages (`account`, `category`, `categories-manage`, `filtered`, `budgets`, `budget`, `budget-details`,
  `scheduled`, `rates`, `settings`, `settings-page`, `data`, `info`). Route files only re-export a feature.
- Sheets, dialogs and full-screen pages that belong to a flow are **layers** opened with
  `sheets.open(content, kind)` (`kind`: `sheet`, `dialog`, `full`), stacked, closed by Back
  (`useCloseLayer`). This mirrors the first application's sheet stack.
- Root screens begin with `features/root-hero.tsx` (balance and one action). Screens with a period put the
  period bar and their content in `features/period-bar.tsx PeriodPager`, which uses `ui/pager.tsx`: the
  previous, current and next period are drawn side by side so a swipe uncovers a ready page; the arrows stay
  and the title slides between them.

## 3. Layers and their boundaries

```
app ─► features ─► ui ─► platform ─► application ─► data ─► domain
                    │                    └──► services ──┘
                    └─ i18n (used by application, platform, ui, features, app)
```

Exact rules: `mobile/scripts/check-boundaries.mjs` (`ALLOWED` and `FOREIGN`): `domain` imports only itself
and no framework; `data` no React; `application` and `services` no React; nothing imports a layer above
it; no import cycles. Run by `test/boundaries.test.ts` and in CI.

## 4. State

- **Ledger**: `application/store.ts` holds `AppState` (`loading` / `failed` / `welcome` / `ready` with
  `data`, `revision`, `posted`). The database is the source of truth; the store is its in-memory copy.
- **Changing the ledger**: `store.run(command)`; a command receives a `LedgerTx` (`domain/change.ts`) — a
  working copy that records what is put, removed and set — and an `Env` (clock, ids). The change is written
  by `data/repository.ts persistChange` in one transaction and only then becomes the new state. Screens use
  `useCommand()` (`ui/app-context.tsx`), which shows a `DomainError` to the person and reports anything
  else as a bug.
- **Reading**: `useLedger()` (whole ledger) and `useLedgerPart(pick)` (one part — the component redraws only
  when that part changes; used by `useT`, `usePalette`, `useMoney`).
- **Screen state that is not data**: `features/ui-state.ts` (period, filters, tab of categories), a tiny
  external store; component state for everything local.

## 5. Money and business rules

Pure TypeScript in `src/domain/`, ported from the first application's `js/domain` and checked against it by
`test/parity.test.ts`. Amounts are integer minor units (`Minor`); dates are `YYYY-MM-DD` text, times
`HH:MM`. Balances are never stored: `ledger.ts accountBalance` replays opening balance and operations.
Details and invariants: [FINANCIAL_RULES.md](FINANCIAL_RULES.md).

## 6. Persistence (SQLite)

- `data/schema.ts`: tables `meta`, `setting` (key → JSON), `rate`, `tag`, `account`, `category`,
  `operation`, `scheduled_payment`, `budget`, `tombstone`, and the view `account_balance` (the SQL
  definition of a balance; `test/database.test.ts` checks it equals the application's). Fields without a
  column are kept in `extra_json`, so nothing of a data file is lost.
- **Migrations**: `MIGRATIONS` in `data/schema.ts`, applied in order inside a transaction each,
  `PRAGMA user_version` holds the version; a database newer than the app is not touched
  (`DatabaseTooNew`). Today there is one migration (version 1).
- The database file: `platform/database.ts` (expo-sqlite, private storage).

## 7. Import, export, backups

- Data file v1 (the first application's backup format): `domain/datafile.ts` (`readDataFile`,
  `writeDataFile`, `completeData`, `findDataProblem`); store `importDataFile` replaces the ledger in one
  transaction and then compares the stored ledger with the file (`repository.ts compareLedgers`).
- CSV of operations in the first application's columns: `domain/csv.ts`.
- Saved backups: table `backup` (migration 2), `data/backups.ts`; the ten newest are kept; the daily copy is
  made by `KeepCurrent` when "Save locally" is on. Restore and merge: `domain/restore.ts planRestore`
  (worked out whole before anything changes; a safety backup first); the lock settings of the phone are
  never taken from a backup. Deletion ways: `DELETIONS` in the same file, applied by the store.
- CSV import: `domain/csv-import.ts` (pure steps), `features/import-wizard.tsx` (pages as full layers).
- Reports: `application/report/` — the model (numbers as the first application), the A4 layout as drawing
  commands, the PDF writer (embedded Liberation Sans, uncompressed streams), the preview draws the same
  commands with react-native-svg.
- Files: `platform/files.ts` (document picker, bytes of a picked file, sharing, saving into a folder the
  person picks).

## 8. Errors

- Refusals meant for the person: `throw new DomainError("English text", params)` (`domain/errors.ts`);
  `showError` translates and shows them. Any other exception is a bug: it is logged and the person sees
  a generic message; the change is not stored (the transaction rolls back).
- A failure to open the ledger shows the failure screen (`AppState.failed`) instead of an empty ledger.

## 9. Theme and localization

- `ui/theme.ts`: palettes built from the accent colour and light/dark (`buildPalette`), spacing, radii,
  `chrome` measures of bars. Components read `usePalette()`.
- `i18n/index.ts`: English text is the key; Russian from `ru.json` (first application) and `ru-mobile.json`
  (new strings); plural forms; week day and month names built in. Currency and country names and currency
  signs are generated tables (`i18n/names.ts`, `i18n/signs.ts`) because the phone's engine lacks that data.

## 10. Native integrations

| Capability | Module | Library |
| ---------- | ------ | ------- |
| Database | `platform/database.ts` | expo-sqlite |
| Data files, sharing | `platform/files.ts` | expo-document-picker, expo-file-system, expo-sharing |
| Local notifications (reminders) | `platform/notifications.ts` | expo-notifications |
| Background posting of due payments | `platform/background.ts` | expo-background-task (WorkManager) |
| PIN in the keystore, biometric prompt | `platform/lock.ts` | expo-secure-store, expo-local-authentication |
| Network for rates | `platform/network.ts` | fetch |
| Secure random | `platform/crypto.ts` | expo-crypto |
| Timing log | `platform/perf.ts` | console → logcat (`[perf] …`) |

## 11. Performance

Measured on the CI emulator (`perf.txt` of each build): the phone's JavaScript engine (Hermes) answers
`toLocaleString`, `Intl.*` and dates through a slow bridge — 200 money formats took 290–880 ms, 200 date
formats 260–880 ms. Hence ([decision 0003](decisions/0003-no-platform-formatting-in-hot-paths.md)): money
is formatted with integer arithmetic (`domain/money.ts formatNumber`), plain numbers by `ui/number-text.ts`,
dates from built-in tables, sorting with plain comparison. Other measures: virtualized lists (`FlatList`
for operations, currencies, rates, icons), memoized rows, partial store subscriptions, animations on the
native driver, neighbouring periods drawn a moment after the first page.

## 12. Known problems

- The pre-migration design (`architecture/PROPOSED_ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`) describes use
  cases per file, ports, `dependency-cruiser`, Drizzle, Zod and `mobile/docs/MAP.md`; none of these were
  built. The real structure is the one above.
- Full type checking needs the React Native packages (`npm ci` in `mobile/`), so it runs only in CI; locally
  only the core (`tsconfig.core.json`) can be checked.
- Feature files are large (`editor-sheet.tsx`, `operations.tsx`, `statistics.tsx`, `settings.tsx`); they are
  organised by screen, not split into hooks and components.
- Not yet built: see [PROJECT_MAP.md](PROJECT_MAP.md#not-implemented-yet-planned).

## 13. Extension points

- A new exchange-rate source: `services/rates/providers.ts` (see `mobile/README.md`).
- A new table or column: a new entry in `MIGRATIONS` plus a migration test in `test/database.test.ts`.
- A new layer kind of sheet: `ui/sheets.tsx`.
- Account sign-in, sync and subscriptions were designed to come later behind their own modules
  ([architecture/AUTH_SYNC_ARCHITECTURE.md](architecture/AUTH_SYNC_ARCHITECTURE.md)); nothing of them exists.
