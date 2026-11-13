# How to work on Monivra

The central rules for every person or agent who changes this repository. They are engineering
principles, not limits on how to solve a problem: a better technical solution is welcome when you can
say why it is better.

## 1. What the repository holds

| Part | Where | State |
| ---- | ----- | ----- |
| **New application** — React Native + Expo SDK 58 + TypeScript | `mobile/` | Active development on branch `rn-migration`; application id `app.monivra.finance.next` (installs beside the first one) |
| **First application** — plain ES modules, no build, Capacitor shell for Android | `index.html`, `js/`, `css/`, `android-app/`, `tests/` | **Reference** for behaviour; not changed by the migration (`main`, `android-first-apk`) |
| Reference images of the original product | `catalog/screens/` (45 screens), films and screenshots the owner sends | Reference for the look |
| Tools | `tools/tour/` (inventory of every window of the first application), `tools/visual-regression/` (screenshot comparison of the first application) | |
| Documents | `docs/` (this folder) | |

**Which reference wins.** Behaviour, data, rules and the set of windows come from the first application
(its code and its running windows). The look comes from the owner's references: `catalog/screens/`, films
and screenshots the owner sends; where they differ from the first application, the owner's reference
wins. A decision the owner made explicitly is recorded in [decisions/](decisions/README.md) and wins
over both.

## 2. Rules

- **Understand before changing.** Find the code through [PROJECT_MAP.md](PROJECT_MAP.md), read it and the
  first application's counterpart, and know what a change touches.
- **Fix the cause where it arises.** No workaround that hides a symptom, no swallowed error, no disabled
  test, no `@ts-ignore`, no hard-coded demo data.
- **Respect the layers** of `mobile/src` (section 3 of [ARCHITECTURE.md](ARCHITECTURE.md));
  `node mobile/scripts/check-boundaries.mjs` enforces them.
- **Keep what works.** Change only what the task needs; no drive-by renames or reformatting.
- **Money and data are sacred.** Amounts are integer minor units; money rules live only in
  `mobile/src/domain`; every change of the ledger is one database transaction; stored data and data files
  keep loading (a schema change is a new migration plus its test, never an edited one). See
  [FINANCIAL_RULES.md](FINANCIAL_RULES.md).
- **Readable, small, testable code.** Reuse the existing components (`mobile/src/ui`) and commands
  (`mobile/src/domain`) before writing new ones. No new dependency without a reason written in the commit
  and a line in [decisions/](decisions/README.md) when it is a runtime dependency.
- **Layouts adapt.** Flex layouts, safe-area insets, keyboard (the whole window ends above it), font
  scaling, three-button and gesture navigation, light and dark themes, Russian and English. No device
  coordinates.
- **Speed and smoothness are requirements.** Animations on the native driver (`transform`, `opacity`),
  long lists virtualized, no platform `Intl`/`toLocaleString`/`localeCompare` in code that runs per row
  ([decisions/0003](decisions/0003-no-platform-formatting-in-hot-paths.md)). Measure before and after
  (`[perf]` lines in the emulator log).
- **A bug fix brings a regression test** when the bug is in logic (domain, data, store, keypad, filters…);
  a visual fix brings a screenshot step in the emulator tour.
- **Verify, then report honestly**: what was changed, how it was checked (command and result, screenshot),
  what was not checked (for example "not seen on a real phone").
- **Keep documents true** (section 5).
- **Git**: work on `rn-migration` (or a branch made from it); meaningful commits; never force-push, never
  delete branches, never change `main` or `android-first-apk`; push only when the previous CI run has
  finished if its screenshots are needed (a push cancels the running one).
- **Never destroy data silently** and never touch other projects. Signing keys and passwords are never
  printed, committed or logged.
- **Visible text** is English in the code; Russian goes to `mobile/src/i18n/ru-mobile.json` (strings of
  the new application) or is already in `mobile/src/i18n/ru.json` (strings of the first application).

## 3. Workflow (in proportion to the task)

1. Read this file; find the area in [PROJECT_MAP.md](PROJECT_MAP.md).
2. Read the code and its dependencies, and the first application's counterpart (file named in the
   header comment of most modules).
3. Reproduce or understand the problem (for a window: open it in the first application, see
   [TESTING.md](TESTING.md#the-first-application-as-the-reference)).
4. State the root cause.
5. Implement it.
6. Add or update tests where justified.
7. Run the checks of [TESTING.md](TESTING.md); for screens, look at the emulator screenshots of the CI run.
8. Update documents if behaviour, structure or procedures changed.
9. Report.

A spacing tweak needs steps 2, 5 and 7; a change of balances, migrations or import needs all of them and
tests that would have failed before.

## 4. Where information lives (one source per subject)

| Subject | Document |
| ------- | -------- |
| Rules of work (this) | `docs/AGENTS.md` |
| Feature → files (new app) | [PROJECT_MAP.md](PROJECT_MAP.md) |
| Architecture of the new app | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Money rules, invariants, known defects | [FINANCIAL_RULES.md](FINANCIAL_RULES.md) (+ [CREDIT_MODEL.md](CREDIT_MODEL.md), [SCHEDULED_AND_NOTIFICATIONS.md](SCHEDULED_AND_NOTIFICATIONS.md), [EXPORT_RULES.md](EXPORT_RULES.md), [DATA_SECTION.md](DATA_SECTION.md) for the first application's behaviour) |
| Tests, checks, debugging, performance | [TESTING.md](TESTING.md) |
| Setup, builds, releases, conventions | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Decisions and their reasons | [decisions/](decisions/README.md) |
| Progress of the migration, what is missing | [architecture/MIGRATION_STATUS.md](architecture/MIGRATION_STATUS.md) |
| Parity task (how to compare with the original) | [agent/PARITY_TASK.md](agent/PARITY_TASK.md) |
| The audit before the migration (historical, 2026-11-11) | [architecture/README.md](architecture/README.md) |
| The first application: map, architecture, layout rules | [legacy/](legacy/README.md) |
| Android shell of the first application | [ANDROID.md](ANDROID.md) |

## 5. Keeping documents in step with code

When a change alters architecture, which module owns a feature, money behaviour, a public interface,
the database, or a procedure, update the document above that owns the subject **in the same commit**.
Do not describe one thing in two places; link instead. A document that is no longer true is corrected or
marked historical, not left to mislead.
