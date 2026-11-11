# Test strategy

Labels: see [README.md](README.md#evidence-labels-used-in-every-document).

## Current suites

Run on 2026-11-11 on branch `android-first-apk` @ `298406b` (this audit, Chromium via Playwright) [T]:

| Suite                      | What                                                | Result                                                  |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| `tests/run.mjs`            | In-page unit checks from 12 `*.test.js` files       | **223/223**                                             |
| `tests/scenarios.mjs`      | Phone-sized user scenarios                          | **80/80**                                               |
| `tests/android-mock.mjs`   | Android bridge mocked (notifications, PIN, mirror…) | **29/29**                                               |
| `tests/storage-limits.mjs` | Full storage behaviour                              | 5/5                                                     |
| `tests/selection.mjs`      | Selection, bulk edit                                | 6/6                                                     |
| `tests/pin.mjs`            | PIN entry and storage                               | 4/4                                                     |
| `tests/pdf-cancel.mjs`     | Cancel a PDF job                                    | 2/2                                                     |
| `tests/statistics.mjs`     | Statistics with zero categories                     | 1/1                                                     |
| `tests/scheduled-ui.mjs`   | Scheduled payments UI                               | 5/5                                                     |
| Emulator test (CI only)    | `android-app/e2e/emulator.mjs`, Android 14          | not run here (last CI run green per earlier builds [D]) |

Strengths: rules are tested at domain level with exact integers; adversarial checks (24 orders of card
operations, untrusted files, prototype keys, 100k-row CSV planning). Gaps: budgets CRUD (in screen) has
no domain check; no test for re-pricing on save (F-1); no multi-tab browser test; reminders never verified
after a real reboot; no performance budget test on large data.

## 1. Principles

1. **A screen looking right is not evidence.** Every money rule is proven by a test on numbers.
2. **Parity first, then change.** The new domain must produce the same outputs as the old one on the same
   inputs (differential testing), except for decisions recorded with the owner (e.g. F-1 fix).
3. **Tests travel with the rule**: a rule change is a test change in the same commit, reviewed.
4. Tests use fixtures, never real personal data.

## 2. Layers

### 2.1 Domain unit tests (Jest, Node, fast)

Every function in `src/domain`. Ported from today's checks: the 223 in-page checks are re-expressed as Jest
tests (names kept so the mapping is traceable; a table `test/parity/CHECK_MAP.md` lists old check → new
test).

### 2.2 Financial invariant tests (property-based, `fast-check`)

Generate random ledgers and command sequences; assert after every step:

- balance(account) = opening + Σ in − Σ out (SQL view = TS oracle = old JS oracle);
- editing then reverting an operation restores every balance exactly;
- deleting an operation equals never having created it (order independence, generalising today's 24-order
  test);
- `own − creditUsed = balance` for cards; percent never 100 for an unreached target;
- conversion of a sum vs sum of conversions differ by at most n/2 minor units (documented bound);
- posting due occurrences twice = once; occurrences are a function of (rule, from, to) only.

### 2.3 Database tests (real SQLite)

- Every migration from every previous version, with fixtures; `integrity_check` and `foreign_key_check`
  after; checksum of applied migrations.
- Constraints reject invalid rows (negative amounts, transfer to self, category of the wrong type, duplicate
  occurrence).
- Writer: concurrent commands from two connections; rollback on thrown error leaves no row; crash
  simulation (kill between statements) leaves the previous state.
- Query parity: `account_balance` view vs TS oracle on 100k generated operations.

### 2.4 Migration tests (legacy → SQLite)

All checks of DATA_MIGRATION_PLAN §5 on: `tests/fixtures/sample-data.js`, `tests/report-fixture.js`,
every legacy shape handled by `completeData`, damaged files, maximum sizes, real-size anonymised data
(Q-M2). Round trip v1 export ↔ import.

### 2.5 Integration tests (use cases with fake ports)

Commands end to end against real SQLite with a fake clock, notifier and background scheduler: create/edit/
delete, bulk edit, currency change, restore merge/replace, CSV import + undo, deletion modes, posting from
every source.

### 2.6 UI component tests (React Native Testing Library)

Keypad and amount display, sheets (footer visible, keyboard), notices (quiet/important rules), money
masking, period bar, filters. Accessibility labels present.

### 2.7 End-to-end on Android (Maestro, CI emulator) and devices

The 80 browser scenarios are the specification: each becomes a Maestro flow (or is merged with another)
and the mapping is tracked. Plus device-only flows: install/upgrade, kill/restart persistence, rotation,
theme/language, notification permission granted/refused, reminder delivered, background posting (forced
WorkManager run), reboot, time-zone change, low storage. Visual comparison against screenshots of the
current app for the main screens (tolerance, reviewed by the owner).

### 2.8 Future iOS

Same Maestro flows on the iOS simulator (except background tasks: physical device only).

### 2.9 Offline, sync and backup scenarios

Airplane mode for every flow (v1 has no network anyway); later sync: two simulated devices with
conflicting edits/deletes/duplicate postings converge (property-based on the sync applier); backup/restore:
make → change → restore → equals; merge twice = once (today's rule).

## 3. Parity harness (old app as oracle)

```
test/parity/
  run-old.mjs   Playwright opens the CURRENT app's modules in Chromium (as tests/run.mjs does), loads a
                fixture, runs a scenario script (list of commands), dumps a JSON "observation":
                balances, totals, report rows, budget states, scheduled state, CSV text, report model
  run-new.ts    runs the same scenario against the NEW use cases + SQLite, dumps the same observation
  compare.ts    deep diff with an allow-list of approved differences (each linked to an owner decision)
```

Scenarios: everything in `premerge.test.js`, `stress.test.js`, `operations.test.js`, `accounts.test.js`,
`report.test.js`, `import.test.js`, plus random command sequences (seeded) from §2.2.

## 4. Acceptance criteria for the migration (measurable)

| #   | Criterion                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 100 % of the 223 legacy checks mapped to new tests and passing (or listed as an approved difference)                                                                                                                         |
| A2  | Parity harness: 0 unexplained differences over all fixtures and ≥ 10,000 random command sequences                                                                                                                            |
| A3  | Invariant property tests pass with ≥ 1,000 runs each in CI                                                                                                                                                                   |
| A4  | Migration of every fixture: all DATA_MIGRATION_PLAN §5 checks pass; round trip v1 equal                                                                                                                                      |
| A5  | All 80 scenario behaviours covered by Maestro flows passing on the CI emulator                                                                                                                                               |
| A6  | Scheduled posting: exactly once under every source and concurrency test; device checklist (BACKGROUND_EXECUTION §6) done on 2 phones                                                                                         |
| A7  | Performance on a low-end Android phone with 50k operations: cold start < 2.5 s, add operation < 150 ms, month list scroll without dropped frames visible to the owner, report of a year < 10 s [R targets, owner may change] |
| A8  | Owner acceptance on own phone with own migrated data, with the old app kept installed (path A) for at least two weeks of parallel use                                                                                        |
