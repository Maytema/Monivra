# Open questions

Two kinds: **decisions** only the owner can make, and **facts** a proof of concept must establish. Each
decision has a recommendation and the checkpoint by which it is needed (MIGRATION_ROADMAP). Nothing here
was decided by this audit.

## 1. Owner decisions

### Needed before C0 (start of proofs of concept)

| ID   | Question                                                                                                                                                                                                                | Options                                                   | Recommendation                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Q-P2 | Where does the new app live?                                                                                                                                                                                            | `mobile/` folder in this repository · separate repository | `mobile/` here: the parity harness needs the old code; one history |
| Q-P5 | Expo SDK 58 needs Android 7+; today's APK supports Android 6. Drop Android 6?                                                                                                                                           | accept · stay on an older SDK (not advisable)             | Accept                                                             |
| Q-F7 | Fix F-1 (saving an unrelated change re-prices a cross-currency amount) in the current app now, with a regression test?                                                                                                  | fix now · leave and only document                         | Fix now, before parity fixtures are recorded                       |
| Q-G1 | The current `AGENTS.md` forbids new branches and recommends force-pushing `main:updates`; practice differs. Adopt AI_AGENT_GUIDELINES (no force-push, branch per task) for the new app and update the root `AGENTS.md`? | adopt · keep current                                      | Adopt                                                              |

### Needed by C1 (stack confirmed)

| ID   | Question                                                                                                                                | Recommendation                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Q-P6 | May we use Expo's paid/hosted build service (EAS), or only GitHub Actions?                                                              | Android on GitHub Actions (as today); EAS only when iOS starts |
| Q-S1 | Encrypt the database (SQLCipher, key in Keystore/Keychain)? Costs some speed and complexity; today the data is not encrypted by the app | Decide after PoC P6 measurements                               |

### Needed by C2 (schema and migration)

| ID   | Question                                                                                                                                                     | Recommendation                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Q-M1 | How do existing installs move? A: data file export/import (new app installed next to the old) · B: in-place upgrade of `app.monivra.finance.dev`             | A for everyone; new app uses the production id `app.monivra.finance`; B only if wanted and PoC P4 passes |
| Q-M3 | After migration, set the PIN again (the verifier is not in the data file)?                                                                                   | Yes                                                                                                      |
| Q-F1 | Exchange rates re-value all history today (totals, reports, budgets change when a rate is edited). Keep, or remember the rate of each operation for reports? | Keep for parity in v1; design rate history as a later feature                                            |
| Q-F2 | All currencies use two decimals (JPY, KRW, KWD… included). Keep?                                                                                             | Keep in v1 (parity); schema records the scale so it can change later with a migration                    |
| Q-F3 | Deleting an account also deletes its transfers and so changes **other** accounts' balances; deleting a category deletes its operations. Keep?                | Keep the rule; add an automatic safety backup and a warning that names the other affected accounts       |
| Q-F4 | The fee of an expense is counted in no expense total (the account pays the full amount, analytics count the net). Intended?                                  | Confirm; consider showing fees as their own line in statistics                                           |
| Q-F5 | Tags become records with ids (renaming a tag renames it everywhere)?                                                                                         | Yes                                                                                                      |
| Q-F6 | If a posted occurrence was deleted and the payment is moved back to that day, may it be posted again (today: yes)?                                           | Keep today's behaviour                                                                                   |

### Later

| ID   | Due                   | Question                                                                                                                                               | Recommendation                                                         |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Q-F8 | C3                    | A trash/undo for deleted operations?                                                                                                                   | Yes, simple 30-day trash (tombstones exist anyway) — product decision  |
| Q-P3 | C4                    | Remote crash reporting (needs network permission, privacy policy)?                                                                                     | No in v1; exportable local log                                         |
| Q-N1 | Phase 5               | Exact or alarm-clock delivery for payment reminders?                                                                                                   | Inexact by default; an "exact time" option only if store policy allows |
| Q-P1 | C5                    | Future of the web version (GitHub Pages): keep the current one, retire it, or build React Native Web later?                                            | Keep as is until C5                                                    |
| Q-L1 | Before public release | `catalog/` holds screens of "the original application" the app is compared with. If that is a third-party product, confirm the right to use its design | Legal check before publishing                                          |
| Q-P4 | C6                    | iOS: timeline, Apple developer account, build machine                                                                                                  | —                                                                      |
| Q-A1 | C7                    | Sign-in methods (email code, Google, Apple), guest-data merge on first sign-in                                                                         | Email code + Google; Apple on iOS                                      |
| Q-S2 | C7                    | Sync conflict: an operation added offline to an account deleted elsewhere — revive the account, or move the operation to "Recovered"?                  | Revive, and tell the person                                            |
| Q-S3 | C7                    | Which settings sync (ledger) and which stay per device (theme, lock)?                                                                                  | Split as in AUTH_SYNC §2                                               |
| Q-S4 | C7                    | End-to-end encryption (rules out server-side posting and analytics)?                                                                                   | Decide with the backend choice                                         |
| Q-B1 | C8                    | What is premium; confirm "export and own data are never paywalled"                                                                                     | Confirm the principle                                                  |
| Q-M2 | Phase 0a              | Provide an anonymised real-size export (amounts and names scrambled) for tests?                                                                        | Yes, if comfortable                                                    |

## 2. Facts to establish in proofs of concept

| ID   | Assumption [A]                                                                                                                     | PoC |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | --- |
| A-1  | Expo Router can host a swipeable root with live preview, FAB and today's Back order                                                | P1  |
| A-2  | A bottom-sheet solution keeps the footer visible with the keyboard up and supports nested sheets                                   | P1  |
| A-3  | A single writer + `expo-sqlite` transactions are atomic with UI, timer and background callers                                      | P2  |
| A-4  | Drizzle works inside our writer's transaction; generated SQL is acceptable                                                         | P2  |
| A-5  | Node's SQLite runs the same migrations/queries as the bundled SQLite of `expo-sqlite`                                              | P2  |
| A-6  | `expo-background-task` really requires network on Android; if so a local WorkManager module works                                  | P3  |
| A-7  | `expo-file-system`'s document directory is the app's `filesDir`, so `files/mirror/data.json` is readable after an in-place upgrade | P4  |
| A-8  | A Capacitor alarm still pending at upgrade does not crash or misfire in the new app                                                | P4  |
| A-9  | Hermes `Intl` covers `PluralRules` (ru), `DisplayNames` (currency), `formatRange`, grouping options                                | P5  |
| A-10 | PIN KDF with a stronger setting unlocks in < 300 ms on a low-end phone; SQLCipher cost acceptable                                  | P6  |
| A-11 | `expo-print` renders a 50-page Cyrillic report in acceptable time and can be cancelled                                             | P7  |
| A-12 | iOS pending local notification limit (believed 64) and its effect on the 60-day / 150-reminder plan                                | C6  |
