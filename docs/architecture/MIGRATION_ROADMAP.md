# Migration roadmap

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). **[R]** throughout. Estimates are
rough calendar ranges for one developer working with agents and the owner reviewing; they exist to order
the work, not to promise dates.

Principles: incremental, never a big-bang rewrite; the current app stays installed, buildable and the
behavioural reference until the new one passes acceptance (TEST_STRATEGY §4); every phase can be stopped
without harming user data; **checkpoints marked ◆ need the owner's explicit approval**.

```
◆C0 → P0 PoCs → ◆C1 stack → P1 foundation → P2 domain parity → ◆C2 schema+migration → P3 data+use cases
     → ◆C3 parity accepted → P4 UI slices → P5 platform → ◆C4 beta → P6 parallel use → ◆C5 release/retire
later: ◆C6 iOS · ◆C7 auth+sync backend · ◆C8 subscriptions
```

## ◆ C0 — approve this plan (now)

Owner answers the questions marked "before C0" in OPEN_QUESTIONS.md (Q-P2, Q-P5, Q-F7, Q-G1; the others
are due at the checkpoint named next to them) and authorises creating throw-away PoC projects.

## Phase 0a — prepare the reference (in the current app; optional but recommended)

- **Objective**: freeze a correct reference before parity fixtures are recorded.
- **Deliverables**: regression test + fix for F-1 (re-pricing on save), only if the owner approves (it
  changes behaviour); anonymised real-size dataset (Q-M2); `CHECK_MAP` of the 223 checks.
- **Tests**: existing suites green; new F-1 test.
- **Risks**: touching the live app — small, covered by tests. **Rollback**: revert the commit.
- **Complexity**: S (2–4 days).

## Phase 0 — proofs of concept (throw-away code, branch `poc/*`)

| PoC            | Question                                                                                                                                      | Exit criterion                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1 UI shell    | Expo Router + swipeable root tabs with preview, FAB, bottom sheets with fixed footer and keyboard, Android Back order                         | Owner compares with the current app on a phone; no blocking gap                     |
| P2 SQLite      | Writer queue + transactions (sync/async), FK, WAL, Drizzle inside the writer, 100k operations performance, Node SQLite parity                 | Atomicity and rollback tests pass; balance query < 50 ms at 100k on a low-end phone |
| P3 Background  | `expo-background-task` constraints (network?), own WorkManager module if needed, posting from a headless run, reboot, force stop, two vendors | Measured delays recorded; exactly-once proven; decision on module                   |
| P4 Migration   | Legacy import path A (file) and B (mirror, in-place upgrade)                                                                                  | DATA_MIGRATION_PLAN §8                                                              |
| P5 i18n / Intl | Hermes coverage, ru plurals, currency names, `formatRange`                                                                                    | All current formats reproduced or polyfilled                                        |
| P6 Security    | Secure store, biometrics, PIN KDF speed, SQLCipher cost                                                                                       | Unlock < 300 ms; decision on SQLCipher                                              |
| P7 Reports     | HTML → PDF with `expo-print`, 50 pages, Cyrillic, cancel                                                                                      | Time and quality accepted by owner                                                  |

- **Dependencies**: C0. **Deliverables**: PoC report, ADRs, final stack list. **Risks**: a PoC fails →
  alternative from TECHNOLOGY_DECISIONS. **Rollback**: PoCs are discarded; nothing ships.
- **Complexity**: M–L (2–4 weeks).

## ◆ C1 — confirm the stack (from PoC results)

## Phase 1 — foundation

- **Objective**: an empty but production-shaped app.
- **Deliverables**: `mobile/` project; strict TS; CI (typecheck, lint, format, boundaries, Jest, Android
  build, Maestro smoke); theme tokens and 10 base components; i18n with converted `ru.json`; SQLite open,
  writer, migration runner with `0001_init.sql`; parity harness skeleton; `AGENTS.md`, `MAP.md`.
- **Acceptance**: CI green; app starts offline on emulator; boundary rule violations fail CI.
- **Risks**: tooling churn (Expo SDK cadence). **Rollback**: delete `mobile/`; nothing else touched.
- **Complexity**: M (1–2 weeks).

## Phase 2 — domain port with parity (no UI)

- **Objective**: all money rules in TypeScript, proven equal to the old app.
- **Deliverables**: `src/domain/*` (money, ledger, operations, accounts, categories, schedule, budgets,
  periods, filters, reports model, transfer formats v1/CSV); Jest ports of the 223 checks; invariant
  property tests; parity runs.
- **Acceptance**: A1–A3 (TEST_STRATEGY §4) for the domain.
- **Risks**: hidden rules in screens (T-03) — found through parity and the scenario list; ambiguous rules
  → OPEN_QUESTIONS, never guessed. **Rollback**: none needed (no users affected).
- **Complexity**: L (3–5 weeks).

## ◆ C2 — approve the schema, the migration path (A/B) and any rule decisions (Q-F\*)

## Phase 3 — data layer, use cases, legacy import

- **Deliverables**: migrations, repositories, queries (`account_balance`, report rows, budget spent),
  ~25 use cases with fake ports, legacy v1 reader and import with all checks, v1 export, backup files.
- **Acceptance**: A4; DB tests; integration tests; P4 re-run on final code.
- **Risks**: performance of derived balances at scale (mitigation: indexed aggregates; cached balance table
  only if measured necessary, with invariant test). **Rollback**: schema is pre-release; can be reset.
- **Complexity**: L (2–4 weeks).

## ◆ C3 — parity accepted (owner sees the parity report)

## Phase 4 — UI vertical slices

Order (each slice = screens + hooks + Maestro flows + owner review on a phone):

1. Accounts (list, card, edit, archive, favourite, order, totals)
2. Operations list + period bar + filters + search
3. Operation editor (calculator, two amounts, fees, tags, comment, photos, date/time)
4. Categories (tiles, subcategories, edit/merge/move)
5. Statistics (cards, donut, bars) and Budgets
6. Scheduled payments (list, create, repeat/reminder, Add now/Skip, far-behind question)
7. More: settings, rates, appearance, language, lock, data (import/export/backups/deletion), guides, about

- **Acceptance**: A5 for each slice; visual comparison with the current app accepted by owner.
- **Risks**: layout rules (LAYOUT_RULES.md) and gestures take longer than expected. **Rollback**: slice
  stays unreleased; the old app remains the product.
- **Complexity**: XL (6–10 weeks).

## Phase 5 — platform integration

- Notifications (rebuild plan from `reminder-plan` port), background posting (per P3), files/share/print,
  PDF reports (per P7), biometrics, privacy screen, system bars.
- **Acceptance**: A6; device checklist on two phones. **Complexity**: M–L (2–4 weeks).

## ◆ C4 — start beta

## Phase 6 — beta and parallel use

- New app installed **next to** the old one (path A; production id), owner imports a data file, uses both
  for ≥ 2 weeks, compares balances weekly with the parity harness on exported files.
- **Acceptance**: A7, A8; zero data-loss incidents; open issues triaged. **Rollback**: keep using the old
  app; export v1 from the new one if needed. **Complexity**: M (2–4 weeks, mostly waiting/fixing).

## ◆ C5 — release; decide the future of the old app and the web version (Q-P1)

Old Android shell frozen (security fixes only) until the owner retires it; repository code kept for the
parity harness.

## Later phases (each starts with its own checkpoint and PoC)

- **◆ C6 iOS**: Apple developer account, macOS builds (EAS or runners), iOS adapters, BGTaskScheduler
  testing on a device, App Store review items. Complexity M–L.
- **◆ C7 Identity + sync**: backend comparison PoC P8 (AUTH_SYNC §4), privacy policy, `INTERNET`
  permission, outbox, conflict tests. Complexity XL.
- **◆ C8 Subscriptions**: billing provider, entitlement rules (Q-B1), store setup. Complexity M.

## Overall estimate

Phases 0–6: roughly **4–7 months** to a verified Android replacement, dominated by Phase 4 (UI) and the
proofs in Phase 0. The range is wide on purpose; it narrows at C1.
