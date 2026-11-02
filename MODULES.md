# Modules

Every module starts with a one-line comment saying what it is for; this file groups them.
Paths are under `js/`.

## app — drawing, startup, gestures

| Module                                    | Purpose                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `app/main.js`                             | Entry point: calls `startup()`                                                                           |
| `app/startup.js`                          | Global listeners (click, input, keys, long press, privacy, back button, hash route) and the first render |
| `app/shell.js`                            | `render()`, the root views per tab, the page table, scroll restoration                                   |
| `app/chrome.js`                           | Fixed parts around the sliding page: tab underline, period arrows, floating button                       |
| `app/swipe.js`                            | Swipe between the root tabs with a live preview of the next page                                         |
| `app/long-press.js`                       | Long press on an operation (selection) or on `data-hold` elements                                        |
| `app/drag-reorder.js`                     | Long press lifts an item, dragging reorders rows and grids                                               |
| `app/color-wheel.js`, `app/clock-dial.js` | Pointer handling of the colour wheel and the time dial                                                   |

## core, data, i18n, platform

| Module                   | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `core/constants.js`      | Storage key, limits, dates, icons, palette, small helpers                        |
| `core/state.js`          | `appData`, `uiState`, lock state, `forgetDeleted`                                |
| `core/color.js`          | Text colour that reads on a background                                           |
| `data/defaults.js`       | Empty data, blank records, `completeData` (fills in and migrates)                |
| `data/storage.js`        | Validation of a data document, `save()`                                          |
| `data/import-export.js`  | The data page: JSON and CSV export and import                                    |
| `data/csv.js`            | Operations as CSV: writing, reading, rows → operations                           |
| `data/report.js`         | Printable report of a period                                                     |
| `data/sample.js`         | Sample dataset                                                                   |
| `data/currencies.js`     | Currencies, default fixed rates                                                  |
| `i18n/index.js`, `ru.js` | `translate`, `translateWith`, `translateCount`, `translateMarkup`; Russian table |
| `platform/files.js`      | Save a text file, pick a file, print                                             |
| `platform/photo.js`      | Shrink a picked image to a small JPEG data URL                                   |

## domain — rules and commands (no DOM)

| Module                      | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `domain/finance.js`         | Balances, conversion, formatting of money, periods, reports, expression evaluation |
| `domain/fees.js`            | Tax and commission applied one after another                                       |
| `domain/sides.js`           | Which side of an operation a chosen account or category lands on                   |
| `domain/dual-amount.js`     | Which of the two amounts of a cross-currency operation leads                       |
| `domain/keypad.js`          | Editing of the typed expression, digit order                                       |
| `domain/operations.js`      | Check, store, delete, bulk-change operations                                       |
| `domain/scheduled.js`       | Next date of a recurring payment, "Add now", "Skip", posting what came due         |
| `domain/budgets.js`         | Spent and left of a budget in its period, the operations it counts                 |
| `domain/accounts.js`        | Account form state, checks, storing, favorite, deletion                            |
| `domain/categories.js`      | Storing with subcategory changes, deleting, moving, merging                        |
| `domain/currency-change.js` | Plan and apply a currency change of an account or of the application               |
| `domain/ordering.js`        | Manual order of accounts and categories                                            |
| `domain/backups.js`         | Snapshot, create, restore, delete backups                                          |
| `domain/currency-search.js` | Find a currency while typing                                                       |

## ui — reusable pieces

`ui/primitives.js` (buttons, fields, rows, tabs, page header, toast, banner), `ui/handlers.js`
(action/input registry), `ui/navigation.js` (pages and layers), `ui/dialogs.js` (messages,
confirmations, prompts, option lists, menus), and pickers: `calendar`, `currency-picker`,
`icon-picker`, `number-picker`, `period-picker`, `time-picker`. Also `empty-state`, `hint`,
`rate-line`, and `spotlight` (scrolls to operation rows and flashes them once).

## screens — one module per screen or flow

| Path                                              | Purpose                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `screens/accounts/`                               | `list` (tab), `actions` (account sheet), `edit`, `type`, `progress`, `currency-change`                         |
| `screens/categories.js`                           | Categories tab, editor, subcategory menus, manage page                                                         |
| `screens/operations/`                             | `list` (tab and filtered list), `add-menu`, `filters`, `bulk-edit`                                             |
| `screens/operation-editor/`                       | `start` (open), `view` (compose), `parties`, `amount`, `keypad`, `extras`, `actions`, `editor` (state, saving) |
| `screens/operation-title.js`                      | Title of an operation row                                                                                      |
| `screens/pickers.js`                              | Account and category pickers used everywhere                                                                   |
| `screens/fees.js`, `recurrence.js`                | Tax/commission dialog; repeat and reminder dialogs and labels                                                  |
| `screens/scheduled-budgets.js`                    | Scheduled payments: list and the create dialog                                                                 |
| `screens/budgets.js`, `category-select.js`        | Budgets: list, page of one budget, editor; budget categories                                                   |
| `screens/due-payments.js`                         | Posts due payments on their own and tells the person; the notice                                               |
| `screens/statistics.js`                           | Statistics and charts                                                                                          |
| `screens/settings.js`, `rates.js`                 | Settings sections; exchange rates                                                                              |
| `screens/more/`                                   | `menu`, `settings-pages`, `lock`, `info-pages`, `support`                                                      |
| `screens/guides.js`, `welcome.js`, `about-art.js` | Written instructions, first launch, About illustration                                                         |

## css

One file per area (`base.css` holds the theme tokens). Colours, radii and spacing come from the
custom properties in `base.css`; there is no `!important`.

## tests and tools

`tests/` — see DEVELOPMENT.md. `tools/visual-regression/` — screenshot comparison.
`catalog/` — reference screens of the original application the work is compared with.
