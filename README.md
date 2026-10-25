# Monivra

Offline-first personal finance tracker (accounts, categories, operations, statistics,
budgets, scheduled payments). Pure HTML + CSS + JavaScript — no build step, no dependencies.
All data is stored on the device (`localStorage`).

Приложение для учёта личных финансов, работает офлайн, без сборки и зависимостей.
Данные хранятся на устройстве.

## Run

ES modules need a web server (opening `index.html` from the file system will not work).

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
  The app is then available at `https://<user>.github.io/monivra/`.
- **Locally:** `python3 -m http.server 8000` and open <http://localhost:8000>.

## Project structure

```
index.html            page shell, loads CSS files and js/app/main.js
css/                  styles, one file per feature (see below)
js/
  core/               constants, translations, application state
  data/               seed data, validation + storage, import/export
  domain/             finance model (balances, periods, reports) and mutations
  ui/                 UI primitives and reusable kit (sheets, dialogs, pickers)
  screens/            one file per feature screen
  app/                shell/rendering, gestures + startup, self checks, entry point
```

### Where to change what

| I want to change…                          | Look at                                   |
| ------------------------------------------ | ----------------------------------------- |
| Colors, fonts, theme variables             | `css/base.css`                            |
| Navigation bar, header, swipe, FAB         | `css/layout.css`, `js/app/shell.js`       |
| Buttons, fields, sheets, dialogs, pickers  | `css/components.css`, `js/ui/`            |
| Accounts list and account editor           | `js/screens/accounts.js`, `css/accounts.css` |
| Categories and sub-categories              | `js/screens/categories.js`, `css/categories.css` |
| Add/edit operation, calculator             | `js/screens/operation-editor.js`, `css/editor.css` |
| Operations list, filters, bulk actions     | `js/screens/operations.js`, `css/operations.css` |
| Recurrence, reminders, budgets             | `js/screens/scheduled-budgets.js`, `css/scheduled.css` |
| Statistics and charts                      | `js/screens/statistics.js`, `css/statistics.css` |
| More tab, settings, info pages             | `js/screens/more.js`, `css/more.css`      |
| Balance / currency / period calculations   | `js/domain/finance.js`                    |
| Rules for creating/deleting operations     | `js/domain/operations.js`                 |
| Data format, validation, saving            | `js/data/storage.js`                      |
| Demo data                                  | `js/data/seed.js`                         |
| Import / export (JSON, CSV)                | `js/data/import-export.js`                |

### Architecture notes

- **State:** `D` (persistent data) and `U` (UI state) live in `js/core/state.js`.
  Changing data → `save()` → `render()`.
- **Rendering:** screens return HTML strings; `render()` in `js/app/shell.js` puts them in the DOM.
  Click and input handlers are registered with `act()` / `inp()` and referenced from markup via
  `data-action` / `data-input`.
- **Modules:** variables that are re-assigned from other modules have setters
  (`setD`, `setU`, …) exported by their owner module.

## Self checks

Open the app and run `Monivra.runSelfChecks()` in the browser console; every entry should have
`pass: true`.
