# Where to look

A map for finding the place to change. Read this first, then open only the files it names.
How the pieces work together is in [ARCHITECTURE.md](ARCHITECTURE.md); what every module is for is in
[MODULES.md](MODULES.md).

## Finding anything in three steps

1. **A text on the screen.** The code is written in English and `js/i18n/ru.js` maps it to
   Russian. Search the English text in `js/` (`grep -rn "Completed" js`); the match in a screen
   module is the screen. A Russian text: search `ru.js` for it, take the English key, search that.
2. **A look (colour, size, spacing).** Take the class from the markup and search `css/`
   (`grep -rn "calc-photos" css`). Classes are spread over several files and some are
   adjusted in a second file, so check every match. Theme colours are the custom properties in
   `css/base.css`; shared pieces (buttons, fields, rows, sheets, dialogs) are in
   `css/components.css`.
3. **A tap.** The markup holds `data-action="<id>"`; the function behind it is the one passed to
   `buttonHtml(label, fn, className)` or `registerAction(fn)` right there in the same string.

## What a person sees → where it is

| Screen or part                                             | Module (under `js/`)                                                                                               | Look (under `css/`)                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Accounts tab, tabs Accounts / Debts / Total                | `screens/accounts/list.js`                                                                                         | `accounts.css`                              |
| "Completed" and "Archive" folders                          | `screens/accounts/list.js` (`folder`)                                                                              | `accounts.css` (`.accounts-archive-toggle`) |
| Account sheet (tap an account)                             | `screens/accounts/actions.js`                                                                                      | `accounts.css`                              |
| Account form, type, progress of a debt or saving           | `accounts/edit.js`, `type.js`, `progress.js`                                                                       | `accounts.css`                              |
| Changing the currency of an account                        | `screens/accounts/currency-change.js`, `domain/currency-change.js`                                                 |                                             |
| Categories tab, editor, merge / nest                       | `screens/categories.js`, `domain/categories.js`                                                                    | `categories.css`                            |
| Operations list, search, selection                         | `screens/operations/list.js`                                                                                       | `operations.css`, `layout.css`              |
| Filters and their lists (type, tags, accounts, categories) | `screens/operations/filters.js`                                                                                    | `operations.css`                            |
| Editing many operations at once                            | `screens/operations/bulk-edit.js`                                                                                  | `operations.css`                            |
| The "+" menu                                               | `screens/operations/add-menu.js`                                                                                   | `operations.css`, `fab.css`                 |
| Operation editor: opening, composing                       | `screens/operation-editor/start.js`, `view.js`                                                                     | `editor.css`                                |
| Editor: accounts / categories on both sides                | `operation-editor/parties.js`, `screens/pickers.js`                                                                | `editor.css`                                |
| Editor: amount, second currency, calculator                | `operation-editor/amount.js`, `keypad.js`, `domain/keypad.js`, `domain/finance.js` (expression)                    | `editor.css`                                |
| Editor: comment, tags, **photos**                          | `operation-editor/extras.js`, `platform/photo.js`                                                                  | `editor.css` (`.calc-photos`)               |
| Editor: save / delete / copy                               | `operation-editor/actions.js`, `editor.js`, `domain/operations.js`                                                 |                                             |
| Tax and commission                                         | `screens/fees.js`, `domain/fees.js`                                                                                | `components.css`                            |
| Repeat and reminder, scheduled payments                    | `screens/recurrence.js`, `screens/scheduled-budgets.js`, `domain/scheduled.js`                                     | `scheduled.css`                             |
| Budgets, choice of their categories                        | `screens/scheduled-budgets.js`, `screens/category-select.js`                                                       | `scheduled.css`                             |
| Statistics, charts, its settings sheet                     | `screens/statistics.js`                                                                                            | `statistics.css`                            |
| Settings pages (format, styles, language)                  | `screens/settings.js`                                                                                              | `components.css`                            |
| Backups, notifications, security, privacy                  | `screens/more/settings-pages.js`, `more/lock.js`, `domain/backups.js`                                              | `more.css`                                  |
| More tab, About, Privacy, Terms, support                   | `screens/more/menu.js`, `info-pages.js`, `support.js`, `screens/guides.js`                                         | `more.css`                                  |
| Exchange rates                                             | `screens/rates.js`, `domain/finance.js`                                                                            | `more.css`                                  |
| Import, export, CSV, printable report                      | `data/import-export.js`, `csv.js`, `report.js`                                                                     | `more.css`                                  |
| First launch                                               | `screens/welcome.js`                                                                                               | `empty-state.css`                           |
| Calendar, time, number, currency, icon, period pickers     | `ui/calendar.js`, `time-picker.js`, `number-picker.js`, `currency-picker.js`, `icon-picker.js`, `period-picker.js` | `calendar.css`, `components.css`            |
| Sheets, dialogs, confirmations, toasts                     | `ui/dialogs.js`, `ui/navigation.js`, `ui/primitives.js`                                                            | `components.css` (`.overlay .panel`)        |
| Buttons pinned at the bottom of a sheet                    | `ui/primitives.js` (`sheetFooterHtml`)                                                                             | `components.css` (`.sheet-footer`)          |
| Swipe between tabs, long press, drag to reorder            | `app/swipe.js`, `long-press.js`, `drag-reorder.js`                                                                 | `layout.css`                                |
| Bottom bar, header, period arrows                          | `app/chrome.js`, `app/shell.js`                                                                                    | `navbar.css`, `components.css`              |
| Money formatting, balances, periods, conversion            | `domain/finance.js`                                                                                                |                                             |
| Saved data, loading old data                               | `data/storage.js`, `data/defaults.js` (`completeData`)                                                             |                                             |
| Russian text                                               | `i18n/ru.js`, `i18n/index.js`                                                                                      |                                             |

## Symptoms and where they start

| Symptom                                         | Start here                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A photo does not attach, or an error about it   | `platform/photo.js` (reading, decoding, `PhotoError`), `operation-editor/extras.js` (`choosePhoto`)       |
| Too many or too few photos                      | `MAX_PHOTOS` in `core/constants.js`; row width in `css/editor.css`                                        |
| A sheet looks different from the others         | Build it from the shared pieces in `ui/primitives.js`; its frame is `.overlay .panel` in `components.css` |
| Buttons scroll away with the content of a sheet | Use `sheetFooterHtml(...)` (see DEVELOPMENT.md)                                                           |
| A tapped checkbox or switch does not change     | The sheet function must build its markup **inside** the function passed to `openSheet`                    |
| Wrong amount, balance or conversion             | `domain/finance.js`; for an operation `domain/operations.js`; rates in `data/currencies.js`               |
| Amount typed wrongly / keypad order             | `domain/keypad.js`, `operation-editor/keypad.js`                                                          |
| A rule is refused with a message                | The command in `domain/` throws `Error(message)`; `app/startup.js` shows it as a toast                    |
| A deleted item is still selected or in a filter | `forgetDeleted` in `core/state.js`; the command must return the removed ids                               |
| Data lost or not loading after an update        | `data/storage.js`, `completeData` in `data/defaults.js`; never rename the storage key                     |
| Import or export fails                          | `data/import-export.js`, `data/csv.js`, `platform/files.js`                                               |
| Debt or saving shows progress / "Completed"     | `accounts/list.js` (`isFinished`, `isCompleted`), `accounts/progress.js`                                  |
| Scheduled payment fires on the wrong date       | `domain/scheduled.js`, `screens/recurrence.js`                                                            |
| Text not translated                             | Add the English text as a key in `i18n/ru.js`                                                             |
| The new version does not show on a phone        | The browser caches the modules: reload the page fully or clear the site data                              |
| Page scrolls back to the top after a change     | Scroll restoration in `app/shell.js` (`render`)                                                           |
| Swipe or long press misbehaves                  | `app/swipe.js`, `app/long-press.js`, `app/drag-reorder.js`                                                |

## Typical changes

- **Remove or add an icon, a label, a count on a row:** find the English text, change the markup
  there, adjust the class in `css/`.
- **A new field on a screen:** the draft object of the screen → the markup → the command in
  `domain/` that validates it → a check in `tests/`.
- **A new visible text:** English in the code, Russian in `i18n/ru.js`.
- **A sheet with a choice:** `openSheet(() => html, "Title")`, rows with `buttonHtml`, finish with
  `sheetFooterHtml(Cancel, Confirm)`; copy `screens/operations/filters.js` (`multiSelect`).

## Checks

`node tests/run.mjs` (rules) and `node tests/scenarios.mjs` (what a person does in a
360 px browser) are in `tests/`; `npm run lint`, `npm run format:check`; screenshots of every
state with `tools/visual-regression`. A screen change gets a scenario, a rule change gets a check.
See [DEVELOPMENT.md](DEVELOPMENT.md).

## Reference material

`catalog/` holds screenshots of the application this one is compared with; `catalog/index.html`
shows them. Behaviour that is not in the code or here is taken from those screens, not guessed.
