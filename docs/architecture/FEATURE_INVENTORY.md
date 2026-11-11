# Feature inventory

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). Nothing here is invented: a
feature is listed only if code for it exists; "placeholder" means the screen exists and says the feature
is not available.

**Reuse** column: **Port** = rules move to TypeScript almost one-to-one, and the old module stays as the
test oracle; **Data** = the content (tables, strings) is reused as is; **Rewrite** = UI built again in
React Native from the same behaviour; **Redesign** = the current approach cannot carry over (storage,
platform, background) and a new design is needed.
**Complexity**: S (days), M (1–2 weeks), L (2–4 weeks), XL (more, or blocked by a PoC) of focused work
for one developer with agents; rough, for ordering only.

## 1. Matrix

| #   | Feature                                                                              | Main files (`js/`)                                                                                                                                          | Tests (examples)                                                                       | Reuse                                | Cx  |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ | --- |
| 1   | Accounts (list, edit, archive, favorite, order)                                      | `domain/accounts.js`, `domain/ordering.js`, `screens/accounts/*`                                                                                            | `accounts.test.js` (26 checks), scenarios                                              | Port + Rewrite                       | M   |
| 2   | Account types (Regular, Savings, Debt; card = Regular + limit)                       | `data/defaults.js blankAccount`, `domain/finance.js progressForBalance, cardState`                                                                          | `stress.test.js` card/debt, `premerge.test.js`                                         | Port                                 | M   |
| 3   | Balances, totals                                                                     | `domain/finance.js accountBalance, overallBalance`, `report-model.js balanceOn`                                                                             | many (edit/delete reconcile, 24-order card test)                                       | Port (to SQL)                        | M   |
| 4   | Income / expense                                                                     | `domain/operations.js validateOp, putOperation`, `screens/operation-editor/*`                                                                               | `operations.test.js`, `calculation.test.js`                                            | Port + Rewrite                       | L   |
| 5   | Transfers (incl. cross-currency)                                                     | same + `domain/dual-amount.js`, `domain/sides.js`                                                                                                           | "Cross-currency amounts convert both ways within one minor unit"                       | Port                                 | M   |
| 6   | Balance adjustment                                                                   | `domain/accounts.js storeAccount`, `validateOp` (`adjustment`)                                                                                              | "Adjustment edit and delete reconcile balances"                                        | Port                                 | S   |
| 7   | Tax / commission (fees)                                                              | `domain/fees.js`, `screens/fees.js`                                                                                                                         | "Fees apply one after another…", "the account pays in full…"                           | Port (pure)                          | S   |
| 8   | Calculator keypad                                                                    | `domain/keypad.js`, `finance.js evaluateExpression`, `screens/operation-editor/keypad.js`                                                                   | "Arithmetic precedence", "Decimal accuracy", "Keypad editing"                          | Port + Rewrite                       | M   |
| 9   | Categories, subcategories (1 level), archive, merge, move                            | `domain/categories.js`, `screens/categories.js`, `screens/category-select.js`                                                                               | "Storing a category applies the planned changes…", "Deleting a category removes…"      | Port + Rewrite                       | M   |
| 10  | Tags                                                                                 | strings in `op.tags` + `appData.tags`; `screens/operation-editor/extras.js`                                                                                 | "Filters combine…", bulk-edit tags scenarios                                           | Redesign (ids)                       | S   |
| 11  | Comments                                                                             | `op.comment`; editor one-line field                                                                                                                         | filter by comment                                                                      | Rewrite                              | S   |
| 12  | Attachments (photos, ≤5/operation)                                                   | `platform/photo.js` (JPEG data URL), `op.photos`                                                                                                            | "The single photo of older data becomes a list of photos"                              | Redesign (files)                     | M   |
| 13  | Savings goals                                                                        | `type: "Savings"`, `goal`; `progressForBalance`; `screens/accounts/progress.js`                                                                             | "Progress of a goal and of a debt repayment"                                           | Port                                 | S   |
| 14  | Debts                                                                                | `type: "Debt"`, `debt`, `totalDebt`, 4 switches; `transferRoles`                                                                                            | debt matrix in `premerge`/`stress`                                                     | Port                                 | M   |
| 15  | Credit cards (limit)                                                                 | `cardState`; `docs/CREDIT_MODEL.md`                                                                                                                         | card checks in `stress.test.js` (24 orders, boundaries)                                | Port                                 | S   |
| 16  | Budgets (day/week/month/year, categories or all)                                     | `domain/budgets.js`; CRUD in `screens/budgets.js`                                                                                                           | 2 domain checks + scenarios                                                            | Port + move CRUD to domain           | M   |
| 17  | Statistics / analytics (flow, scheduled, bar, average, donut, categories, tags)      | `screens/statistics.js`, `domain/chart.js`, `finance.js reportRows`                                                                                         | `statistics.mjs`, donut checks                                                         | Port + Rewrite (charts)              | L   |
| 18  | Reports: PDF (summary, detailed), CSV export, print, share                           | `domain/report-model.js`, `data/report-layout.js` (1,052 lines), `data/report-job.js`, `platform/pdf.js`, `platform/report-render.js`, `screens/export*.js` | `report.test.js`, `pdf-cancel.mjs`, `dataux`                                           | Port model; Redesign rendering       | XL  |
| 19  | Search and filters (account, category, type, tags, comment, origin; period)          | `finance.js operationMatchesFilters, periodBounds, shiftPeriod`, `screens/operations/filters.js`                                                            | "Filters combine…", "Each step lands on the neighbouring period…"                      | Port (to SQL + TS)                   | M   |
| 20  | Bulk operations (select, bulk edit, bulk delete)                                     | `domain/operations.js applyBulkChanges, bulkAccountProblem`, `screens/operations/bulk-edit.js`, `app/long-press.js`                                         | `selection.mjs`, bulk checks                                                           | Port + Rewrite                       | M   |
| 21  | Scheduled transactions (repeat rules, catch-up, Add now / Skip, far-behind question) | `domain/scheduled.js`, `screens/scheduled-budgets.js`, `screens/recurrence.js`, `screens/due-payments.js`                                                   | ~30 checks, `scheduled-ui.mjs`, emulator                                               | Port rules; Redesign execution       | L   |
| 22  | Notifications (payment reminders, periodic reminder)                                 | `domain/reminders.js`, `domain/reminder-plan.js`, `app/reminders.js`, `platform/notify.js`, `sw.js`                                                         | `android.test.js`, `android-mock.mjs`, emulator alarm check                            | Port plan; Redesign delivery         | M   |
| 23  | Import: data file (merge/replace), CSV import wizard with undo                       | `data/backup-file.js`, `domain/restore.js`, `data/csv-import.js`, `screens/import-wizard.js`                                                                | `restore.test.js`, `import.test.js`, `dataux`                                          | Port (pure parts) + Rewrite          | L   |
| 24  | Backup and restore (inner backups ×10, auto daily, safety backups, data file)        | `domain/backups.js`, `screens/more/backup-pages.js`                                                                                                         | `data.test.js`, `restore.test.js`, `deletion.test.js`                                  | Redesign (storage)                   | L   |
| 25  | Deletion (operations / partial / backups / everything)                               | `domain/deletion.js`, `screens/more/deletion-page.js`                                                                                                       | `deletion.test.js`                                                                     | Port                                 | S   |
| 26  | PIN and biometrics, relock, hide preview                                             | `platform/pin.js`, `secure-pin.js`, `biometric.js`, `screens/more/lock.js`, `app/native-pin.js`                                                             | `pin.mjs`, "SHA-256 and PBKDF2…"                                                       | Redesign (native)                    | M   |
| 27  | Settings (34 stored keys plus a few added later, e.g. `hidden`, `totalCurrency`)     | `data/defaults.js`, `screens/settings.js`, `screens/more/settings-pages.js`                                                                                 | "Numeric settings of old data…"                                                        | Port + Rewrite                       | M   |
| 28  | Localization (en, ru)                                                                | `i18n/index.js`, `i18n/ru.js` (1,302 strings)                                                                                                               | none dedicated                                                                         | Data + Redesign mechanism            | M   |
| 29  | Themes, accent colour, dark mode, system bars                                        | `css/base.css`, `core/color.js`, `app/shell.js`, `platform/system-bars.js`                                                                                  | emulator theme step                                                                    | Port (colour math) + Rewrite         | M   |
| 30  | Currencies and exchange rates (fixed, editable; account and main currency change)    | `data/currencies.js`, `screens/rates.js`, `domain/currency-change.js`                                                                                       | "Converting everything keeps the balance…", "Every currency has a positive fixed rate" | Port + Data                          | M   |
| 31  | First launch (empty or starter set), welcome, guides, About                          | `screens/welcome.js`, `data/defaults.js createStarterData`, `screens/guides.js`, `screens/about-art.js`                                                     | scenarios                                                                              | Rewrite                              | S   |
| 32  | Data recovery screen (unreadable stored data)                                        | `core/state.js loadProblem`, `screens/recovery.js`                                                                                                          | emulator "damaged stored dataset…"                                                     | Redesign (DB integrity)              | S   |
| 33  | Premium / subscription, profile, sync                                                | `screens/more/info-pages.js`, `screens/more/menu.js`                                                                                                        | —                                                                                      | **Placeholder only** ("Coming soon") | new |

## 2. Per-feature notes (data, rules, risks)

Only what the matrix cannot say. Data shapes are the stored JSON fields.

### Accounts, types, balances (1–3, 13–15)

- **Data** [V]: `{id, name, type: Regular|Savings|Debt, opening, icon, color, currency, goal, limit, include,
archived, favorite, description, debt: "Owe me"|"I owe", totalDebt?, considerExpense, considerIncome,
showExpense, showIncome}`; order = array order (`domain/ordering.js`).
- **Rules** [V/T]: balance = `opening + Σ incoming(receive ?? amount) − Σ outgoing(amount)`; new non-debt
  account with a balance starts with an `adjustment` operation, a debt keeps it as `opening`; editing the
  balance adds an `adjustment`; one favorite; archived accounts are excluded from totals and pickers;
  `include` affects only summed balances. Card/goal/debt progress derived (`progressForBalance`).
- **Risks**: deleting an account deletes **all its operations including transfers**, which changes the
  other account's balance [T "Deleting an account reverses linked transfer on remaining account"] — the
  dialog says "all linked operations" but not that other balances move [Q-F3]. Debt direction flips with
  the sign of the balance.

### Operations (4–8)

- **Data** [V]: `{id, type: income|expense|transfer|adjustment, amount, date, time?, from?, to?, receive?,
receiveManual?, category?, categoryAmount? {currency, amount}, fees? [{kind, percent|value, add}],
comment, tags[], photos[]?, fromSchedule? {id, date, postedAt, byHand?}, recalculated? {amount, currency}}`.
- **Rules** [V]: amount > 0 integer; date valid; expense uses `from`, income `to`; transfer needs two
  different accounts and computes `receive` at the current rate unless typed; category must match type;
  a category in another currency stores `categoryAmount`; income with fees credits `receive = net`; an
  expense with fees debits the full amount while the category records the net; a future date turns the
  operation into a one-time scheduled payment; `time` kept only on posted scheduled operations.
- **Risks**: no undo/trash for a single deleted operation (only inner backups) [V `deleteOperation`];
  the fee part of an expense is in no expense total (see FINANCIAL_RULES_AUDIT F-6).

### Categories and tags (9–10)

- One level of subcategories; parent and child share a type [V `findDataProblem`]. Deleting a category
  deletes its operations and scheduled payments and removes it from budgets; budgets left empty are deleted
  [T]. Merge and move rewrite references.
- Tags are free strings; `appData.tags` is the palette; operations hold names, so renaming a tag is not a
  single change [V]. **Redesign**: tag table with ids (decision Q-F5).

### Attachments (12)

- Photos are shrunk JPEG data URLs inside operations [V `platform/photo.js`], counted in the 5 M-char quota.
  **Redesign**: files in the app sandbox + `attachment` rows; data file export must embed or bundle them.

### Budgets (16)

- `{id, name, amount, currency, period: day|week|month|year, categories: string[] | null}`; spent = expense
  report rows of the period around the date shown in the period bar, converted main → budget currency [V].
- CRUD and validation sit in the screen [V `screens/budgets.js`]; no rollover, no history.

### Statistics and reports (17–18)

- All aggregates go through `reportRows` (fees, debt switches) [V], at **current** rates [V].
  `report-model.js` has its own `balanceOn(a, date)` [V] (same formula as `accountBalance`, dated).
- PDF is produced by drawing pages to canvas and a hand-written PDF writer (`platform/pdf.js`), with a
  cancellable job [V/T]. Canvas does not exist in React Native: **rendering must be redesigned**
  (see TECHNOLOGY_DECISIONS "Reports/PDF"); the report **model** can be ported.

### Scheduled transactions and notifications (21–22)

- Fully described in `docs/SCHEDULED_AND_NOTIFICATIONS.md` (this branch's parent commit) [V/T].
- Data: operation fields + `recur {every, unit: Days|Weeks|Months|Years, days[], remaining|null}`,
  `reminder {before, unit, time}`, `time`, `anchorDay`.
- **Risk**: nothing is posted while the app is closed [V]; reminders are inexact and not verified after
  reboot on a real phone [D].

### Import, backup, restore, deletion (23–25)

- Data file = the stored document minus inner backups, plus `meta` [V `backup-file.js`]; untrusted input
  checks (size 20 MB, depth, prototype keys) [T].
- Merge identity = record `id`; a category id clash of different type gets id `<id>~<type>` [V
  `restore.js separateCategories`]. Merge keeps the local version by default [D FINANCIAL_RULES.md].
- **This file format is the most valuable compatibility contract for the migration**: the new app must read
  it (DATA_MIGRATION_PLAN §4).

### Security (26)

- PIN: PBKDF2 (20,000 iterations) in JS; verifier in Android Keystore-encrypted file; lockout 30 s doubling
  to 8 min [D FINANCIAL_RULES.md]; biometric via `androidx.biometric` [V]. Screen lock only — data
  unencrypted at rest [V].

### Settings, localization, themes (27–29)

- Settings include ones with no effect: `autoRates` toggle says rates service is not connected [V
  `screens/rates.js`]; `autoBackup` day is UTC, not local [V `startup.js backUpOncePerDay`].
- Localization mechanism (regex over HTML) cannot carry over; the **string table can** (English keys).

### Premium (33)

- Placeholder pages only: Profile ("Not signed in"), Subscription ("Coming soon", indicative prices, every
  button says billing is not connected) [V `info-pages.js`]. No entitlement logic exists anywhere.

## 3. Not found in the code (do not assume they exist)

Interest/statement cycles for cards, budget rollover, multi-user/shared access (a hint "Shared access"
opens a page), live exchange rates, cloud backup, account registration, purchase flow, iOS build, web push.
