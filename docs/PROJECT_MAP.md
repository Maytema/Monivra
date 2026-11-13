# Project map — where things are (new application, `mobile/`)

All paths below are under `mobile/src/` unless they start with another folder. Most modules begin with a
comment naming the first application's file they reproduce (for example `js/screens/accounts/list.js`);
open that file for the reference behaviour. The first application has its own map:
[legacy/WHERE_TO_LOOK.md](legacy/WHERE_TO_LOOK.md).

## Layers in one line each

| Folder | What it is |
| ------ | ---------- |
| `app/` | Routes (expo-router): `_layout.tsx` (root: opens the ledger, lock, keyboard, sheets), `(tabs)/` (five tabs) and one file per pushed page |
| `features/` | Screens and flows; read the ledger through hooks, change it only through commands |
| `ui/` | Reusable pieces: theme, sheets/dialogs, form fields, pickers, calendar, pager, icons |
| `application/store.ts` | The store: the only way to change the ledger (`run(command)`), posting of due payments, import/export |
| `domain/` | Pure money rules and commands (no React, no SQL) |
| `data/` | SQLite schema, migrations, reading and writing the ledger |
| `services/rates/` | Exchange-rate sources and their refresh |
| `platform/` | Phone capabilities: database file, files/sharing, notifications, background task, keystore/biometrics, network, timing log |
| `i18n/` | Translation (English keys → Russian), built-in currency/country names and signs |
| `shared/ids.ts` | New identifiers (UUID v7) |

## Feature → files

| Feature | Screen / UI | Commands and rules | Data | Tests |
| ------- | ----------- | ------------------ | ---- | ----- |
| **Accounts tab** (Accounts / Debts / Total, groups, archive, completed, drag to reorder) | `features/accounts.tsx`, route `app/(tabs)/index.tsx`; header `features/root-hero.tsx`; pages side by side `ui/pager.tsx`; reorder `ui/sortable.tsx` | `domain/accounts.ts` (`moveInOrder`, `toggleFavoriteAccount`, `setArchived`), `domain/ledger.ts` (`accountBalance`, `overallBalance`, `cardState`, `progressForBalance`) | `data/repository.ts` | `test/finance-rules.test.ts` ("reordering one group…"), `test/database.test.ts` (SQL view = app balances) |
| **Account sheet** (tap an account: Edit, Archive, Operations, Top up, Transfer, Debit) | `features/account-sheet.tsx` | Top up / Debit / Transfer ask the other side first: `features/editor/party-picker.tsx` (`openPartyPicker`, `openTransferPicker`, `AccountCards`) then `features/editor/editor-sheet.tsx` (`openEditor({ ask })`) | | |
| **Account form** (new / change, type, currency, debt switches, delete) | `features/account-editor.tsx`, route `app/account.tsx`; fields `ui/form.tsx`; "Select type" `ui/choice-sheet.tsx`; icon & colour `ui/customize-sheet.tsx` + `ui/color-wheel.tsx` + `ui/color-tools.ts` | `domain/accounts.ts` (`accountDraft`, `checkedAccountDraft`, `storeAccount`, `planCurrencyChange`, `changeAccountCurrency`, `accountDeletionImpact`, `deleteAccount`) | | `test/finance-rules.test.ts` (F-14, deleting an account, balance corrections), `test/color.test.ts` |
| **Categories tab** and **Change categories** | `features/categories.tsx`, `features/categories-manage.tsx`, `features/category-sheet.tsx`, `features/category-editor.tsx`; routes `app/(tabs)/categories.tsx`, `app/categories-manage.tsx`, `app/category.tsx` | `domain/categories.ts` (`storeCategory`, `moveCategory`, `deleteCategory`), `domain/ledger.ts` (`categoryTotalIn`, `categoryFamily`, `reportRows`) | | `test/filters.test.ts` (subcategories) |
| **Operations tab** (list by day, search, selection, bulk edit) | `features/operations.tsx` (`OperationsPage` = one period's list), `features/operation-row.tsx`, `features/bulk-edit.tsx`, `features/filters-panel.tsx` | `domain/operations.ts` (`deleteOperations`, `applyBulkChanges`, `renameTag`, `deleteTag`), `domain/periods.ts` (`operationsIn`, `operationMatchesFilters`), `domain/ledger.ts` (`newestFirst`, `balanceOn`) | | `test/filters.test.ts`, `test/store.test.ts` (tags), `test/format.test.ts` (order) |
| **Operation editor** (calculator, sides, date, comment, tags, fees, repeat, reminder, currency of entry) | `features/editor/editor-sheet.tsx`, `features/editor/session.ts` (state of one open editor), `features/editor/party-picker.tsx`, `features/editor/options.tsx`; date `ui/calendar-sheet.tsx`, time `ui/time-dialog.tsx` | `domain/operations.ts` (`validateOp`, `putOperation`, `scheduledForm`), `domain/sides.ts`, `domain/dual-amount.ts`, `domain/money.ts` (calculator, fees, conversion), `domain/keypad.ts` | | `test/keypad.test.ts`, `test/finance-rules.test.ts` (F-1, recalculation, future date → scheduled) |
| **Add sheet** (FAB "Add": Incomes / Expenses / Accounts tiles) | `features/add-menu.tsx` | as the editor | | |
| **Filtered page** (operations of an account or categories) | `features/filtered.tsx`, route `app/filtered.tsx` | `domain/periods.ts` | | |
| **Period bar, Time interval, month start, range** | `features/period-bar.tsx` (`PeriodBar`, `PeriodPager`), `ui/period-dialog.tsx`, `ui/period-title.ts`, `features/ui-state.ts` (period, filters, tab of categories) | `domain/periods.ts` (`periodBounds`, `shiftPeriod`, `canShiftPeriod`, `periodAround`) | | |
| **Statistics** (cash flow, donut, bars, averages, blocks and their order) | `features/statistics.tsx` (`StatisticsPage` per period); block settings `features/settings.tsx` (`StatsSettings`) | `domain/chart.ts`, `domain/ledger.ts` (`reportRows`, `totalByType`, `categoryRows`) | | `test/chart.test.ts` |
| **Budgets** | `features/budgets.tsx`; routes `app/budgets.tsx`, `app/budget.tsx`, `app/budget-details.tsx` | `domain/categories.ts` (`saveBudget`, `deleteBudget`, `budgetState`, `budgetOperations`) | | |
| **Scheduled payments** (list, posting, missed payments, reminders) | `features/scheduled.tsx` (route `app/scheduled.tsx`), `features/due-payments.tsx` (`askAboutMissed`) | `domain/scheduled.ts` (`postDue`, `nextDate`, `missedPayments`, `settleMissed`), `domain/reminders.ts`; store `postDueNow` | `platform/background.ts`, `platform/notifications.ts` | `test/parity.test.ts`, `test/finance-rules.test.ts` ("Add now…") |
| **Exchange rates** | `features/rates.tsx` (route `app/rates.tsx`) | `services/rates/providers.ts`, `services/rates/refresh.ts`; conversion `domain/money.ts` | `platform/network.ts` | `test/rates.test.ts` |
| **More, settings, information pages** | `features/more.tsx`, `features/settings.tsx` (routes `app/settings.tsx`, `app/settings-page.tsx`), `features/info.tsx` (route `app/info.tsx`: instructions, support, profile, subscription, shared access), `features/guides.ts`; rows `ui/rows.tsx`; hints `ui/hint-banner.tsx` | settings are a key/value table (`tx.setSettings`) | | |
| **Data** — menu, saved backups, restore (merge / replace), data file, deletion | `features/data.tsx` (route `app/data.tsx?page=…`), `features/welcome.tsx` (first start) | `domain/restore.ts` (`planRestore`, `contentsOf`, `DELETIONS`), `domain/datafile.ts`; store `createBackup`, `dailyBackup`, `restore`, `deleteData`, `importDataFile`, `exportDataFile` | `data/backups.ts` (table `backup`, migration 2), `data/repository.ts` (`replaceLedger`), `platform/files.ts` | `test/backups.test.ts` (parity with `old-restore.json`), `test/database.test.ts`, `test/store.test.ts` |
| **Import data** (CSV wizard: columns, encodings, links, preview, undo, example) | `features/import-wizard.tsx`, `ui/full-page.tsx` | `domain/csv-import.ts` (`readTable` … `planImport`, `applyImport`, `undoImport`), `domain/text-decode.ts` | `platform/files.ts pickFileBytes` | `test/csv-import.test.ts` (parity with `old-import.json`) |
| **Export data** (financial summary PDF, detailed transactions PDF, CSV; preview; share / save) | `features/export-page.tsx` | `application/report/` (`model.ts`, `layout.ts`, `pdf.ts`, `font.ts`, `job.ts`), `domain/csv.ts` (`csvTable`, `csvText`) | `platform/files.ts` (`shareTextFile`, `saveTextFile`) | `test/report.test.ts` (parity with `old-reports.json`, PDF structure), `test/parity.test.ts` (CSV) |
| **Lock** (PIN, fingerprint) | `features/lock.tsx` (`LockGate`, `PinPad`, PIN settings) | `domain/pin.ts` | `platform/lock.ts` (keystore, biometric prompt) | `test/pin.test.ts` |
| **Currency choice** | `ui/currency-sheet.tsx` (page), `ui/currency-names.ts` | `domain/currencies.ts` | `i18n/names.ts`, `i18n/signs.ts` (generated tables) | `test/currency-names.test.ts` |
| **Theme, navigation bar, sheets** | `ui/theme.ts` (tokens, palettes), `ui/tab-bar.tsx`, `ui/sheets.tsx` (sheet / dialog / full page layers), `ui/kit.tsx`, `ui/parts.tsx` | | | |
| **Translation** | `i18n/index.ts` (week days and months built in), `i18n/ru.json` (first application's strings), `i18n/ru-mobile.json` (new strings) | | | |

## Example: "editing a transfer does not update both balances correctly"

1. UI: `features/editor/editor-sheet.tsx` → the draft lives in `features/editor/session.ts`
   (`EditorSession`, `update`, `makeTransferTo`, `putAccount`).
2. Save: `session` builds the operation and calls the command through `useCommand()`
   (`ui/app-context.tsx`) → `appStore().run` (`application/store.ts`).
3. Rule: `domain/operations.ts` (`validateOp`, `putOperation`) — the received amount `receive` of a
   transfer between currencies is computed there (`domain/dual-amount.ts`, `domain/money.ts convert`).
4. Balances are never stored: `domain/ledger.ts accountBalance` replays opening + operations.
5. Storage: `domain/change.ts` (`LedgerTx`, the change) → `data/repository.ts persistChange` (one
   transaction).
6. Tests to extend: `test/finance-rules.test.ts` (F-1 cases), `test/database.test.ts` (SQL balances).
7. Side effects: budgets and statistics read `reportRows`; scheduled payments use the same `validateOp`.

## Checks and tools

| What | Where |
| ---- | ----- |
| Unit and integration tests | `mobile/test/*.test.ts` (fixtures in `mobile/test/fixtures/`, helpers in `mobile/test/support/`, parity runner `mobile/test/parity/`) |
| Layers and cycles | `mobile/scripts/check-boundaries.mjs` |
| Emulator tour (screenshots, timings) | `mobile/scripts/emulator-smoke.sh`, run by `.github/workflows/mobile.yml` |
| Inventory of the first application's windows | `tools/tour/crawl-old.mjs` with `tools/tour/seed.json` |
| String conversion from the first application | `mobile/scripts/convert-strings.mjs` |
| Builds of the first application | `.github/workflows/android.yml`, `.github/workflows/pages.yml` |

## Not implemented yet (planned)

Recovery screen, printing a report (needs `expo-print`), photo attachments of operations (needs
`expo-image-picker`); packages cannot be installed while the network of the work environment is off. The list with details is kept in
[architecture/MIGRATION_STATUS.md](architecture/MIGRATION_STATUS.md).
