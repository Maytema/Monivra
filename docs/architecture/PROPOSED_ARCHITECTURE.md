# Proposed architecture (React Native + Expo + TypeScript)

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). Everything here is **[R]**
unless marked otherwise. Library choices and their alternatives are argued in
[TECHNOLOGY_DECISIONS.md](TECHNOLOGY_DECISIONS.md); the tree is in [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).

## 1. Requirements this design is traced to

| Req | Requirement (source)                                                                                 | Design element                                                                      |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| RQ1 | Financial correctness, data integrity (owner priorities 1–2)                                         | Pure domain core, one transaction per command, DB constraints (§4)                  |
| RQ2 | Scheduled operations committed without opening the app (`docs/SCHEDULED_AND_NOTIFICATIONS.md` R1–R8) | Shared SQLite + idempotent posting + background worker (§6)                         |
| RQ3 | Offline-first; sync and accounts later without restructuring                                         | Local DB is the source of truth; sync-ready columns + outbox (§7)                   |
| RQ4 | Android now, iOS later                                                                               | Expo, platform adapters behind interfaces (§5)                                      |
| RQ5 | Preserve product identity                                                                            | Design tokens + component library mirroring today's UI (§8)                         |
| RQ6 | Maintainable by AI agents                                                                            | Explicit boundaries enforced by lint, small modules, parity tests                   |
| RQ7 | Existing user data must survive                                                                      | Reader for today's data file / mirror format; verified import (DATA_MIGRATION_PLAN) |
| RQ8 | Avoid overengineering                                                                                | No DI framework, no CQRS/event sourcing, no microfrontends; one app                 |

## 2. Shape: a modular monolith with one financial core

```
            ┌──────────────────────── app (routes) ────────────────────────┐
            │  features/*  (screens, components, hooks; no money rules)     │
            └───────┬───────────────────────────────┬───────────────────────┘
                    │ calls commands / reads queries │ uses
                    ▼                               ▼
            application/  (use cases)          ui/ (design system), i18n/
                    │  validate with              │
                    ▼                             │
              domain/  (pure TS: money, ledger, schedule, budgets, reports, import/backup codecs)
                    ▲
                    │ types only
              data/  (SQLite: schema, migrations, repositories, read queries, writer queue, files)
              platform/ (notifications, background, secure storage, biometrics, files, share, print)
              services/ (later: auth, sync, billing — interfaces first, implementations when approved)
```

Allowed imports (enforced in CI by `dependency-cruiser`, see TECHNOLOGY_DECISIONS):

| From ↓ / may import → |        domain         | application | data | platform  | services  | ui  | i18n |        features        | app |
| --------------------- | :-------------------: | :---------: | :--: | :-------: | :-------: | :-: | :--: | :--------------------: | :-: |
| `domain`              |           ✓           |             |      |           |           |     |      |                        |     |
| `application`         |           ✓           |      ✓      |  ✓   | ✓ (ports) | ✓ (ports) |     |      |                        |     |
| `data`                |       ✓ (types)       |             |  ✓   |           |           |     |      |                        |     |
| `platform`            |       ✓ (types)       |             |      |     ✓     |           |     |      |                        |     |
| `services`            |       ✓ (types)       |  ✓ (ports)  |  ✓   |     ✓     |     ✓     |     |      |                        |     |
| `ui`                  |                       |             |      |           |           |  ✓  |  ✓   |                        |     |
| `features/x`          | ✓ (formatting, types) |      ✓      |      |           |           |  ✓  |  ✓   | only `features/shared` |     |
| `app`                 |                       |             |      |           |           |  ✓  |  ✓   |           ✓            |  ✓  |

Key rules: **no screen touches the database** (only `application` queries/commands); **no money
arithmetic outside `domain`** (formatting is allowed in UI through `domain/money/format`); **features do
not import each other** (shared pieces move to `ui` or `features/shared`).

## 3. Domain core (`src/domain`)

Pure TypeScript, deterministic, no React, no SQLite, no `Date.now()` (the clock is a parameter). It is
the TypeScript port of today's rules, function by function, with the old JS as the test oracle
(TEST_STRATEGY §3).

| Module                     | Ported from                                                                                   | Content                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `money/`                   | `finance.js` (format, convert), `fees.js`, `percent.js`, `keypad.js`, `evaluateExpression`    | `Minor` branded integer, conversion, rounding, fees, formatting, calculator         |
| `ledger/`                  | `finance.js accountBalance`, `transferRoles`, `reportRows`, `cardState`, `progressForBalance` | Effects of an operation on accounts; report rows; card/goal/debt progress           |
| `operations/`              | `operations.js validateOp`, `sides.js`, `dual-amount.js`                                      | Validation and normalisation of drafts (without F-1 re-pricing)                     |
| `accounts/`, `categories/` | `accounts.js`, `categories.js`, `ordering.js`, `currency-change.js`                           | Plans for create/edit/delete/merge/currency change, returning changes, not mutating |
| `schedule/`                | `scheduled.js`, `reminders.js`, `reminder-plan.js`                                            | Recurrence (`nextDate`), due occurrences, occurrence id, reminder plan              |
| `budgets/`                 | `budgets.js` + rules now in `screens/budgets.js`                                              | Validation, period, spent                                                           |
| `periods/`, `filters/`     | `finance.js periodBounds, shiftPeriod, operationMatchesFilters`                               | Period bounds; filter → SQL-free predicate (and a description used to build SQL)    |
| `reports/`                 | `report-model.js`, `report-layout.js` (layout only if kept)                                   | Report model (data), independent of how it is drawn                                 |
| `transfer-formats/`        | `backup-file.js`, `restore.js`, `csv.js`, `csv-import.js`                                     | Data file v1 reader/writer, merge plan, CSV read/plan/write                         |

Style: functions take plain data and return **plans** (`{ inserts, updates, deletes }` or a new value);
the application layer executes plans in a transaction. This replaces today's "mutate global then save".

## 4. Persistence and transactions (`src/data`)

- **SQLite** is the single source of truth for user data (schema in DATA_MIGRATION_PLAN §2). Balances stay
  **derived** (an indexed SQL view), as today; no stored balance to drift.
- **One writer**: all writes go through `data/writer.ts`, a FIFO queue that runs each command's plan inside
  one transaction (`BEGIN IMMEDIATE … COMMIT`). In-process this prevents interleaving; across a background
  task's connection SQLite locking with WAL and `busy_timeout` serialises writers [A — PoC P2].
- **Constraints do part of the checking**: foreign keys, `CHECK (amount > 0)`, `UNIQUE (schedule_id,
occurrence_date)`, type/category consistency triggers where cheap. Domain validation still runs first so
  the person gets a sentence, not an SQL error.
- **Reads** are named queries (`data/queries/*.sql.ts`): balances, operations page by filter/period,
  report rows, budget spent. Hooks re-run a query when the tables it reads change (DB change listener).
- **Files**: attachments live in the app's document directory under content-hash names, referenced by
  `attachment` rows; deleting a row deletes the file after commit (garbage-collected on start if a crash
  intervened).

## 5. Application layer (`src/application`)

One file per use case, ≈20–30 in total, e.g. `createOperation`, `editOperation`, `deleteOperations`,
`applyBulkChanges`, `postDueOccurrences`, `settleMissedPayment`, `saveAccount`, `deleteAccount`,
`changeAccountCurrency`, `saveBudget`, `importCsv`, `restoreDataFile`, `exportDataFile`,
`rebuildReminders`. Each:

1. loads what it needs through repositories,
2. calls the domain to validate and plan,
3. executes the plan through the writer in **one** transaction (including the outbox row for sync, later),
4. after commit, triggers side effects that are allowed to fail (rebuild reminders, delete files),
5. returns a result or throws `DomainError(code, params)`; the UI translates `code`.

Platform capabilities are reached through small **ports** (TypeScript interfaces) passed in, so tests run
the use case with fakes: `Clock`, `Notifier`, `BackgroundScheduler`, `SecureStore`, `FileStore`,
`Biometrics`, later `AuthSession`, `SyncTransport`, `Entitlements`. No DI container: a single
`createAppContext()` builds the real implementations; tests build fakes.

## 6. Scheduled operations and background (summary; details in BACKGROUND_EXECUTION.md)

- One function `postDueOccurrences(now)` used by: app start, app foreground, a timer while open, the
  Android background worker, and (later) the server. Idempotent by `UNIQUE(schedule_id, occurrence_date)`
  and a deterministic operation id.
- Notifications are reminders only; they never move money.
- Background posting is **best effort** on Android and **not dependable** on iOS; catch-up on open remains
  the guarantee. React Native does not lift Android/iOS background limits.

## 7. Identity, sync, subscriptions (summary; details in AUTH_SYNC_ARCHITECTURE.md)

Four separate concerns with separate modules and tables: **ledger** (local, always works), **identity**
(`services/auth`), **sync** (`services/sync`, reads the outbox, applies remote changes through use cases),
**entitlements** (`services/billing`). v1 ships none of the three services; the schema already has UUID
keys, `updated_at`, `deleted_at` tombstones and an `outbox` table so they can be added without
restructuring.

## 8. UI architecture and design system

The current app is the visual and functional reference (`catalog/`, the running app, and the CSS tokens);
its code structure is not.

### 8.1 Tokens (`src/ui/theme`)

Ported from `css/base.css` and `core/color.js` [V sources]:

| Group       | Today                                                                                                                                                           | Target                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Colour      | `--accent` (default `#a000b8`), surfaces derived with `color-mix(accent %, white/dark)`, `--positive #45bd96`, `--negative #ce3c71`, inks, `--line`, dark class | `buildPalette(accent, scheme)` pure function producing the same mixes (unit-tested against values sampled from the current CSS) |
| Readability | `textOn`, `readableOver` in `core/color.js`                                                                                                                     | Ported as is                                                                                                                    |
| Spacing     | `--edge-gap 16px`, nav 78 px, FAB 62 px, rules in `LAYOUT_RULES.md`                                                                                             | `space`, `layout` constants                                                                                                     |
| Radius      | inputs 14 px etc.                                                                                                                                               | `radius` scale                                                                                                                  |
| Type        | Roboto / Noto Sans, 16 px root (14 px under 360 px width)                                                                                                       | `typography` scale with font scaling respected                                                                                  |
| Icons       | SVG path strings in `core/constants.js ICONS`                                                                                                                   | Same paths rendered by `react-native-svg` `<Icon name>`                                                                         |
| Motion      | `css/animations.css`, rolling balance, About animation                                                                                                          | Reanimated presets; respect "reduce motion"                                                                                     |

### 8.2 Components (`src/ui/components`)

Mirrors today's primitives (`ui/primitives.js`, `ui/dialogs.js`, pickers): `Screen`, `Header`, `Button`
(primary/outline/text), `Field`, `FieldButton`, `ToggleRow`, `Row`, `Tabs`, `Sheet` (bottom sheet with
footer that stays visible), `Dialog` (message/confirm/typed-confirm), `OptionList`, `Notice`
(`quiet`/`important`, AGENTS.md rules), `Toast`, `ActionTile`, `Keypad` + `AmountDisplay`, `Calendar`,
`TimeDial` (with the dial change in `docs/NEXT_BUILD_NOTES_RU.md`), `CurrencyPicker`, `IconPicker`,
`ColorWheel`, `ProgressMeter`, `EmptyState`, `Donut`, `BarChart`. Money is always shown through
`<Money value currency kind>` so masking ("hide values"), sign colour and formatting are applied in one place.

### 8.3 Screens and navigation

Root: five tabs (Accounts, Categories, Operations, Statistics, More) with swipe between them and a
floating add button; pages on a stack; sheets and dialogs as overlays. A notification tap deep-links to the
scheduled payment or the operation. Screens are thin: they call hooks (`useAccounts`, `useOperations
(filters, period)`, `useBudgetState(id)`), keep drafts in a reducer, and call commands.

## 9. Errors, logging, crash reporting

- `DomainError(code, params)` for expected refusals (shown as toast/dialog), `StorageError` for I/O (shown
  as "not saved" with the data-file escape, like today's save alert), everything else is a bug: caught by an
  error boundary, logged locally, the screen offers to go back.
- A local ring-buffer log (no financial data; codes and ids only), exportable from Support. Remote crash
  reporting is **off** until the owner decides (it needs network and a privacy policy) — Q-P3.

## 10. Security

Screen lock (PIN 4/6 digits + biometrics) with the verifier in Keystore/Keychain via secure storage; data
at rest protected by the OS (file-based encryption) and optionally by SQLCipher (Q-S1, PoC P6);
`FLAG_SECURE`/recents hiding as today; no `INTERNET` permission until sync is approved; exports are
explicit user actions. Threat model and limits stated in the app as today ("this is a screen lock, not
encryption") unless SQLCipher is adopted.

## 11. What is deliberately **not** in this design

Redux/global stores for data (the DB is the store), event sourcing, a separate backend in v1, a generic
plugin system, per-feature databases, code generation beyond SQL migrations, a shared web build (the web
version stays the current app until a decision Q-P1).
