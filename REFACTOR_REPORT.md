# Refactoring report

Branch `refactor/architecture-cleanup`, based on `main` at `ab9f965`. Nothing in `main` was touched.

## What was wrong

- **ESLint did nothing.** There was no config, so earlier "lint is clean" reports were empty.
  A real config was added; it found 22 problems (`prefer-const`), now fixed.
- **Test code lived inside the application** (an in-app self-check of 867 lines, a test mode,
  a debug API and exports that only the debug API used).
- **Monolithic modules:** the operation editor (873 lines, one function of 478 lines), the
  operations screen (858), accounts (762), More (444), `ui/kit.js` (a grab-bag), `startup()`
  (133 lines), `domain/operations.js` (every kind of command in one file).
- **Rules inside screens:** bulk edit, the whole of saving an account (validation, currency
  change, opening balance, debt transfer), saving a category with its subcategory changes,
  restoring a backup.
- **Domain reached into the UI:** deleting an operation, account or category changed
  `uiState.selected` and `uiState.filters`.
- **Duplication and hacks:** "merge a subcategory" re-implemented merging a category (and left
  budgets pointing at the vanished category); an inline `onclick` that forwarded a tap to
  another button; initial editor state created inside the render function; recurrence labels
  lived in the operations list but were used by the recurrence dialogs.

## What was done

| Area                  | Result                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| Checks                | Moved to `tests/`; 55 in-page checks, 13 browser scenarios, ESLint, Prettier, visual regression |
| `ui/kit.js`           | Split into `primitives`, `dialogs`, `navigation`, `handlers`, pickers…    |
| Operation editor      | `screens/operation-editor/`: start, view, parties, amount, keypad, extras, actions, editor |
| Operations screen     | `screens/operations/`: list, add-menu, filters, bulk-edit                 |
| Accounts screen       | `screens/accounts/`: list, actions, progress, edit, type, currency-change |
| More tab              | `screens/more/`: menu, settings-pages, lock, info-pages, support          |
| `startup()`           | One function per kind of global event                                      |
| Domain                | `operations`, `scheduled`, `accounts`, `categories`, `currency-change`, `ordering`, `backups` |
| Domain ↔ UI           | Delete commands return what disappeared; the screen calls `forgetDeleted` |
| CSV import            | `prepareCSV` split into resolvers and a row → operation function           |
| Documents             | README, ARCHITECTURE, MODULES, DEVELOPMENT, this report; `package.json` for the checks |

Functions of 45 lines or more: 53 → 45; the longest went from 867 to 175 lines. Source: 12 324 →
11 609 lines in 26 → 85 modules (the in-app self-check and the debug API are gone).

### Renamed

`opTitle` → `operationTitle` (own module); `operationsMenu` → `toggleOperationSearch`;
`simplePage` → `infoPage`; `kit.js` helpers → `primitives.js`; editor state `scratchMode`,
`scratchExpr`, `scratchReady`, `currencySide`, `receiveExpr` → `calculatorOn`,
`calculatorExpression`, `resultReady`, `activeSide`, `typedReceive`; one-letter parameters
(`d`, `p`, `c`, `o`) in the editor modules → `draft`, `editor`, `category`, `operation`.
Nothing is left as a wrapper for the old names. Storage key and data format are unchanged.

### Bugs found

Fixed, each with a check where it can be reproduced:

1. Merging a category left a filter on the category that no longer exists (empty list).
2. Merging a subcategory left budgets pointing at the missing category.

Not fixed (no clear expected behaviour yet, or outside this clean-up):

- `storeCategory` is not atomic: if the relocation at its end throws "Select a valid category",
  the category and earlier subcategory changes are already stored.
- `storeAccount` converts the currency of an existing account before it checks a debt
  operation. It is unreachable today (the debt operation exists only for new accounts) but it
  is a trap for the next change.
- A new adjustment without an account asks for a category after the account; the original
  behaviour was kept.
- HEIC/AVIF photos: the browser cannot decode them; a decision is waiting (library or message).

## Verified

At the end: `node tests/run.mjs` 55/55; `node tests/scenarios.mjs` 13/13 (subcategories, photos,
calculator, cross-currency amount, bulk edit, account creation and refusal, scroll, export →
import); ESLint and Prettier clean; visual regression 133 screen states, 0 differences from
the version before the clean-up (screenshot, text and number of controls). Money rules that
moved are covered by new checks: account storing with opening balance and debt transfer,
validation messages, bulk edit, category merge, backups, CSV import.

## Not checked / limits

- Only Chromium (Playwright, 360 px). Not run on real iOS Safari or Android Chrome.
- 45 functions are still 45–175 lines: mostly markup builders (`iconPicker`, `timePicker`,
  `createSampleData`, `settingsPage` bodies), `initDragReorder`, `initSwipeGestures`,
  `findDataProblem`, `amountModel` (a set of closures over one editor), `categoryEditView`,
  `budgetView`. They are not mixed with rules, so they were left for a later pass.
- `css/components.css` (1 749 lines) is not split by component yet.
- The GitHub Pages build was not opened from here; the phone may need a full reload after the
  deploy because of cached modules.

## Ready to merge?

The branch is complete as far as listed above and the checks pass. The remaining items are
improvements, not regressions. Merge only after your confirmation.
