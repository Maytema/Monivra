# Rules for AI agents (draft of `mobile/AGENTS.md`)

Short on purpose: an agent reads it before every task. It replaces nothing in the current app's
`AGENTS.md` until the new app exists. Owner-facing replies stay in Russian.

## 1. Find your way

1. Read `mobile/docs/MAP.md` (generated list: feature → route files → use cases → domain modules → tables →
   tests). Do not read the whole repository.
2. Money rule? Start in `src/domain/<area>` and its tests. Screen? `src/features/<area>`. Data shape?
   `src/data/migrations` (the truth) then `schema.ts`.
3. The old app (`js/`, repository root) is the **reference** for behaviour until retirement; the parity
   harness (`test/parity`) shows how it answers.

## 2. Boundaries (CI fails if broken)

- Import rules of PROPOSED_ARCHITECTURE §2 (`dependency-cruiser`).
- No SQL outside `src/data`; no money arithmetic outside `src/domain`; no `Date.now()`/`new Date()` in
  `src/domain` (take a clock); no feature imports another feature.
- Native code only in `modules/` with a short README saying why a library could not do it.
- New dependency: a line in `docs/DEPENDENCIES.md` (why, alternatives, licence, size). The owner approves
  runtime dependencies.

## 3. Code

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no `any` (use `unknown`
  - Zod at boundaries); no non-null `!` without a comment saying why it holds.
- Money is `Minor` (integer hundredths) and `CurrencyCode`; dates `LocalDate`/`LocalTime`; never floats for
  stored amounts.
- Names say what a thing is (current convention kept): components `PascalCase`, hooks `useX`, use cases
  verbs (`createOperation`), queries nouns (`accountBalances`), tests describe the rule in a sentence.
- Errors: expected refusals throw `DomainError(code, params)`; never swallow an error; never show a stack
  to the person; log with codes and ids, **never amounts, names or comments**.
- Strings: every visible text through `t("English text")`; Russian added in the same change.
- Styling only from `ui/theme` tokens; no inline colours.
- Keep modules small and single-purpose; do not split trivial code into many files.

## 4. How to work

1. **Find the root cause before changing code.** Reproduce with a failing test first.
2. Fix it where it arises; no cosmetic workaround, no hidden error, no disabled test, no `ts-ignore`
   without a linked issue.
3. Change only what the task needs. No drive-by refactors, renames or formatting of unrelated files.
4. Backward compatibility: stored data, data files (v1 forever), deep links and settings keep working;
   a schema change = new migration + migration test; never edit an applied migration.
5. Bug fix = regression test that fails before and passes after.
6. Architectural change (new module, new dependency, new pattern, boundary change) = short ADR in
   `docs/adr/` with the reason and alternatives, and owner approval if it affects money, data or privacy.
7. **Claims need evidence**: "works", "fixed", "verified" only with the command and its result. Say what
   was not tested (e.g. "not checked on a real phone").
8. Report limitations honestly; if a rule is unclear, ask one short question rather than invent it.

## 5. Tests required per change

| Change                        | Required                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Domain rule                   | Unit tests + invariant test if it touches balances; parity diff reviewed     |
| Use case / repository / query | Integration test on real SQLite                                              |
| Schema                        | Migration test from the previous version + constraints test                  |
| Screen                        | Component test for logic in hooks/reducers; Maestro flow for a new user path |
| Platform adapter              | Fake for tests + device checklist item                                       |

## 6. Git and review

- Work on a branch per task (`feat/…`, `fix/…`, `docs/…`); never push to `main` directly; **never
  force-push** shared branches; never delete branches without the owner.
- Small commits with messages saying why; one pull request per task with: what changed, how it was tested
  (commands + results), what was not tested, screenshots for UI.
- Merge only when CI is green and the owner (or a reviewer the owner names) approves. Money, data, privacy
  and dependency changes always need the owner.

## 7. Definition of Done

- [ ] Root cause stated (for fixes); tests added and passing locally and in CI.
- [ ] Typecheck, lint, format, boundaries, unit, DB, parity and affected Maestro flows green.
- [ ] Russian strings added; layouts checked at 320 px width and with large font.
- [ ] Docs updated where behaviour or structure changed (MAP, ADR, rules).
- [ ] Report to the owner in Russian: what changed, evidence, limits, next step.
