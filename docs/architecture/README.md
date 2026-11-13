# Monivra architecture audit and React Native migration design

> **Historical (2026-11-11).** The React Native application now exists in `mobile/`; its real architecture is
> [../ARCHITECTURE.md](../ARCHITECTURE.md), the rules of work [../AGENTS.md](../AGENTS.md), progress
> [MIGRATION_STATUS.md](MIGRATION_STATUS.md). These documents remain the record of the audit and the design;
> parts of the design were not built (see ARCHITECTURE.md §12).

Status: **design only**. No React Native project exists, no application code was changed, no APK was
built. Written on branch `docs/react-native-architecture` (from `android-first-apk` at `298406b`),
2026-11-11.

The owner's instruction: stop after the audit and the plan; implementation starts only after the owner
approves checkpoint **C0** in [MIGRATION_ROADMAP.md](MIGRATION_ROADMAP.md).

## Reading order

| #   | Document                                               | Question it answers                                                         |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md) (Russian)         | The short report for the owner: findings, risks, recommendations, decisions |
| 2   | [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)     | How the application actually works today                                    |
| 3   | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md)           | Every feature: files, data, rules, tests, risks, reuse, complexity          |
| 4   | [FINANCIAL_RULES_AUDIT.md](FINANCIAL_RULES_AUDIT.md)   | Money rules, source of truth for balances, inconsistencies, guarantees      |
| 5   | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)                 | Debt, dead code, doc drift, with evidence and what the migration does to it |
| 6   | [PROPOSED_ARCHITECTURE.md](PROPOSED_ARCHITECTURE.md)   | Target architecture: layers, boundaries, data flow, design system           |
| 7   | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)           | Directory tree, purpose of every directory, where future changes go         |
| 8   | [TECHNOLOGY_DECISIONS.md](TECHNOLOGY_DECISIONS.md)     | Each library choice with alternatives, risks and what needs a proof         |
| 9   | [DATA_MIGRATION_PLAN.md](DATA_MIGRATION_PLAN.md)       | SQLite schema, constraints, migrations, backups, moving existing installs   |
| 10  | [AUTH_SYNC_ARCHITECTURE.md](AUTH_SYNC_ARCHITECTURE.md) | Identity, sync, subscriptions: kept apart, added later without restructure  |
| 11  | [BACKGROUND_EXECUTION.md](BACKGROUND_EXECUTION.md)     | Notifications vs background work vs posting vs catch-up vs server           |
| 12  | [TEST_STRATEGY.md](TEST_STRATEGY.md)                   | Tests, parity with the old app, acceptance criteria                         |
| 13  | [AI_AGENT_GUIDELINES.md](AI_AGENT_GUIDELINES.md)       | Rules for agents in the new repository (draft of its `AGENTS.md`)           |
| 14  | [MIGRATION_ROADMAP.md](MIGRATION_ROADMAP.md)           | Phases, deliverables, acceptance, rollback, owner checkpoints               |
| 15  | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)                 | Decisions only the owner can make, and facts a proof of concept must settle |

## Evidence labels used in every document

| Label   | Meaning                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------- |
| **[V]** | Verified in this audit by reading the code (file and function named)                            |
| **[T]** | Verified by an automated test that passed on 2026-11-11 in this audit                           |
| **[D]** | Documented (repository docs, vendor docs) but not verified here, e.g. never run on a real phone |
| **[R]** | Recommendation of this audit                                                                    |
| **[A]** | Assumption that a proof of concept (PoC) must confirm before it is relied on                    |
| **[Q]** | Open question; see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)                                       |

A function existing is not counted as verified behaviour; [V] says what the code does, [T] that a test
exercises it, and neither says that it was seen on a real device.

## Progress checkpoints of this audit

- [x] Git state checked; working tree was clean; nothing outside `docs/architecture/` changed.
- [x] Repository investigated: 133 JS modules (19.5k lines), 15 CSS files (7.3k lines), 5 Java classes
      (0.8k lines), 2 CI workflows, 27 test files.
- [x] Unit checks (223/223) and the browser suites re-run on 2026-11-11 (results in
      [TEST_STRATEGY.md](TEST_STRATEGY.md#current-suites)).
- [x] Current-state documents.
- [x] Target design documents.
- [ ] Owner decisions ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)) — **waiting for the owner**.
- [ ] Phase 0 proofs of concept — **not started; needs approval C0**.
