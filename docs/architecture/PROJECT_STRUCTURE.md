# Project structure of the React Native application

> **Proposal (2026-11-11), not the built structure.** The actual layout is in [../PROJECT_MAP.md](../PROJECT_MAP.md)
> and [../ARCHITECTURE.md](../ARCHITECTURE.md).

**[R]** throughout. The new application lives in its own directory of this repository (`mobile/`) so the
current app stays runnable as the reference until it is retired (decision Q-P2 offers a separate
repository instead). Names are illustrative; the boundaries are the point.

## 1. Tree

```
mobile/
├─ app.config.ts                 Expo config: applicationId per environment, plugins, permissions
├─ eas.json | android/ (CNG)     Build profiles; native folders are generated, never edited by hand
├─ package.json, tsconfig.json   strict TypeScript, path aliases (@domain, @app-layer, @data, …)
├─ .dependency-cruiser.cjs       the import rules of PROPOSED_ARCHITECTURE §2, run in CI
├─ AGENTS.md                     agent rules (from AI_AGENT_GUIDELINES.md)
├─ docs/                         ADRs (decision records), schema notes, parity status
├─ modules/                      local Expo modules (Kotlin/Swift) only when no library fits:
│  └─ monivra-background/        e.g. WorkManager job without a network constraint (if PoC P3 needs it)
├─ src/
│  ├─ app/                       Expo Router routes ONLY: layouts, tabs, stacks, modal routes
│  │  ├─ (tabs)/accounts.tsx … more.tsx
│  │  ├─ operation/[id].tsx, scheduled/[id].tsx, budget/[id].tsx, settings/…
│  │  └─ _layout.tsx             providers: theme, i18n, database, lock gate, error boundary
│  ├─ features/                  one folder per product area; UI + hooks, no money rules, no SQL
│  │  ├─ accounts/               screens/, components/ (AccountRow, AccountCard), hooks/
│  │  ├─ operations/             list, filters, bulk edit, editor/ (draft reducer, keypad wiring)
│  │  ├─ categories/
│  │  ├─ budgets/
│  │  ├─ scheduled/
│  │  ├─ statistics/
│  │  ├─ reports/                export screens; renderers/ (PDF via HTML, CSV)
│  │  ├─ data/                   import wizard, backups, restore, deletion
│  │  ├─ security/               lock screen, PIN setup, biometrics
│  │  ├─ settings/
│  │  ├─ onboarding/             welcome, starter set, migration-from-old-app screen
│  │  ├─ premium/                (later) paywall, entitlement gates
│  │  └─ shared/                 small cross-feature UI (pickers built from ui/)
│  ├─ application/               use cases (commands/queries) and ports
│  │  ├─ operations/createOperation.ts, editOperation.ts, deleteOperations.ts, applyBulkChanges.ts
│  │  ├─ schedule/postDueOccurrences.ts, settleMissedPayment.ts, rebuildReminders.ts
│  │  ├─ accounts/…, categories/…, budgets/…, data/importCsv.ts, restoreDataFile.ts, …
│  │  ├─ ports.ts                Clock, Notifier, BackgroundScheduler, SecureStore, FileStore, …
│  │  └─ context.ts              createAppContext(): wires real implementations (no DI framework)
│  ├─ domain/                    pure TS (see PROPOSED_ARCHITECTURE §3)
│  │  ├─ money/ ledger/ operations/ accounts/ categories/ schedule/ budgets/
│  │  ├─ periods/ filters/ reports/ transfer-formats/ (data file v1, CSV)
│  │  └─ errors.ts               DomainError codes
│  ├─ data/
│  │  ├─ db.ts                   open, pragmas (WAL, foreign_keys, busy_timeout), integrity check
│  │  ├─ writer.ts               single write queue + transaction runner
│  │  ├─ migrations/0001_init.sql, 0002_….sql + index.ts (ordered, checksummed)
│  │  ├─ schema.ts               table/column types (Drizzle or hand-written types)
│  │  ├─ repositories/           accounts.ts, operations.ts, schedules.ts, … (SQL per aggregate)
│  │  ├─ queries/                balances.ts, operationsPage.ts, reportRows.ts, budgetSpent.ts
│  │  ├─ files/                  attachments store, export/import of files
│  │  └─ legacy/                 reader of the Capacitor app's data (mirror file, data file v1)
│  ├─ platform/                  adapters implementing ports: notifications.ts, background.ts,
│  │                             secureStore.ts, biometrics.ts, files.ts, share.ts, print.ts, locale.ts
│  │                             (`*.android.ts` / `*.ios.ts` only where behaviour differs)
│  ├─ services/                  later, each behind a port: auth/, sync/, billing/
│  ├─ ui/
│  │  ├─ theme/                  tokens, buildPalette(accent, scheme), typography, ThemeProvider
│  │  ├─ components/             Button, Field, Sheet, Dialog, Notice, Keypad, Money, Donut, …
│  │  └─ icons/                  path table ported from core/constants.js ICONS
│  ├─ i18n/                      i18next setup; locales/en.json (keys), ru.json (from js/i18n/ru.js)
│  └─ shared/                    ids (UUIDv7/v5), LocalDate/LocalTime types, Result; kept tiny
├─ test/
│  ├─ fixtures/                  sample-data, report-fixture (copied from tests/), migration inputs
│  ├─ parity/                    runs the OLD js/domain on fixtures and the NEW domain; diffs outputs
│  ├─ db/                        migrations and repositories against real SQLite
│  └─ e2e/                       Maestro flows (Android emulator in CI; iOS later)
└─ (unit tests co-located: src/domain/money/fees.test.ts)
```

## 2. Why each top-level directory exists

| Directory      | Owns                                                          | Must not contain                                   |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `app/`         | Route files and layouts (navigation structure)                | Logic, queries, styles beyond layout               |
| `features/`    | What the person sees per area; hooks that call use cases      | SQL, money arithmetic, imports from other features |
| `application/` | Use cases: the only place that writes; ports                  | React, styling                                     |
| `domain/`      | Money and record rules, pure and deterministic                | I/O, React, `Date.now()`, SQLite, i18n strings     |
| `data/`        | SQLite schema, migrations, repositories, read queries, files  | Business decisions (it executes plans)             |
| `platform/`    | OS capabilities behind ports                                  | Business rules                                     |
| `services/`    | External systems (auth, sync, billing) behind ports           | UI                                                 |
| `ui/`          | Design system                                                 | Knowledge of features or data                      |
| `i18n/`        | Strings and locale setup                                      | Logic                                              |
| `shared/`      | Tiny, dependency-free helpers                                 | Anything that belongs to one of the above          |
| `modules/`     | Native code we own (Kotlin/Swift), only with a written reason | Copies of libraries                                |

## 3. Where future changes go (and what stays untouched)

| Change                                                     | Touches                                                                                                                                                                                                                                       | Stays untouched                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **New account type** (e.g. "Investment")                   | `domain/accounts` (type, progress rule, validation) + tests; `domain/ledger` only if it moves money differently; migration adding the type to the `CHECK`; `features/accounts` (form fields, row); i18n strings; parity: none (new behaviour) | operations, schedule, reports engine, sync, platform |
| **New financial calculation** (e.g. "average daily spend") | `domain/<area>/` pure function + unit tests + invariant test; `data/queries` if it needs a new aggregate; one hook and component in the feature showing it                                                                                    | other features, data schema (usually)                |
| **New sign-in method** (e.g. phone OTP)                    | `services/auth/<provider>.ts` implementing the `AuthSession` port; `features/onboarding` (button); config/secrets                                                                                                                             | ledger, sync engine, domain                          |
| **Payment provider**                                       | `services/billing/<provider>.ts` implementing `Entitlements`; `features/premium`; server-side receipt validation (outside the app)                                                                                                            | domain, data, other features                         |
| **Transaction form change**                                | `features/operations/editor/*` (draft reducer, layout); `domain/operations` only if a rule changes (then tests first)                                                                                                                         | data, other features                                 |
| **New analytics chart**                                    | `data/queries` (aggregate) or `domain/reports`; `ui/components/charts/<Chart>.tsx`; `features/statistics` card; settings list of cards                                                                                                        | ledger, operations, schedule                         |
| **New language**                                           | `i18n/locales/<code>.json`, register code; plural forms checked by the i18n test                                                                                                                                                              | everything else                                      |
| **iOS-specific behaviour**                                 | `platform/<capability>.ios.ts` or a Swift part of a local module; `app.config.ts` (Info.plist entries)                                                                                                                                        | domain, application, features (unless UI differs)    |
| **Change of a money rule**                                 | ADR in `docs/`, failing test in `domain`, implementation, parity fixture update with the owner's approval, migration if stored data changes                                                                                                   | —                                                    |
