# Technology decisions

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). **Confirmed** = stated by the
vendor's documentation read on 2026-11-11 (links at the end) — still not tried in this project.
**PoC** = must be proven in Phase 0 (MIGRATION_ROADMAP) before code depends on it. Popularity is not a
reason used anywhere below.

Column key for each decision: _Fit_ (why for Monivra) · _Alternatives_ · _+_ · _−_ · _Maintenance risk_ ·
_Android / iOS_ · _Dev Build_ (works in an Expo development build) · _Native code_ (would we write any).

## 0. Platform baseline

| Item      | Decision                                                                                                                                                                                                   | Evidence                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Expo SDK  | Latest stable at the start of Phase 1 (today **SDK 58**: React Native 0.88, React 19.3.0, Android 7+ / compileSdk 37 / targetSdk 36, iOS 16.4+), upgraded once per SDK release after the test suite passes | Confirmed (Expo versions page, SDK 58 changelog, released 2026-10-15) |
| Workflow  | **Development builds + Continuous Native Generation** (`npx expo prebuild`), never Expo Go (custom native modules, SQLCipher, background need a dev build)                                                 | Confirmed (SQLCipher "not Expo Go")                                   |
| Language  | TypeScript `strict` (default in SDK 58), plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`                                                                                                     | Confirmed default; extra flags [R]                                    |
| JS engine | Hermes (default)                                                                                                                                                                                           | PoC P5 for `Intl` coverage                                            |

**Consequence to decide (Q-P5):** the current APK supports Android 6 (`minSdk 23`); Expo SDK 58 requires
Android 7+ (API 24). Phones on Android 6 cannot install the new app.

## 1. Navigation — **Expo Router** (on React Navigation)

- _Fit_: typed file routes; deep links needed for notification taps ("open this scheduled payment"); stack
  - tabs + modals match today's pages/sheets.
- _Alternatives_: React Navigation used directly (explicit config, fewer conventions); custom navigation (no).
- _+_ first-party with Expo, typed routes, deep linking built in. _−_ SDK 58 reworked its navigation core and
  removed most of the forked React Navigation API (Confirmed) — churn; file conventions must be learnt.
- _Maintenance risk_: medium (fast-moving). Mitigation: use only Stack, Tabs, modal routes; no custom
  navigators; screens unaware of the router beyond `useLocalSearchParams`/`router.push`.
- _Android/iOS_: both. _Dev Build_: yes. _Native code_: no.
- **PoC P1**: root tabs with swipe and live preview of the next tab (today `app/swipe.js`), Android Back
  through sheets then pages then background (today's rule), FAB above the tab bar. If Expo Router fights
  the swipeable root, fall back to React Navigation with a pager-based root (decision recorded as ADR).

## 2. Local database — **SQLite via `expo-sqlite`**

- _Fit_: relational data with references (accounts ↔ operations ↔ categories ↔ schedules ↔ budgets),
  aggregates for reports, transactions, constraints for idempotency, one file openable from background code.
- _Alternatives_: `op-sqlite` (JSI, fast, SQLCipher; third-party, smaller maintainer base); WatermelonDB
  (lazy model + sync protocol; adds its own model layer and update discipline); Realm (MongoDB announced the
  deprecation of its device SDKs/Device Sync in 2024 — not re-checked here; not considered);
  MMKV/AsyncStorage (key-value, no transactions — rejected for the ledger, fine for tiny UI prefs).
- _+_ first-party; sync and async APIs; `useSQLCipher` config plugin; session extension (changesets);
  change listener; WAL via pragma (all Confirmed). _−_ `withTransactionAsync` includes **any** query that runs
  while it is open; `withExclusiveTransactionAsync` uses a new connection where `PRAGMA foreign_keys` from the
  main connection does not apply and other writes fail with "database is locked" (Confirmed caveats).
- _Our answer to the caveats_: one serialized writer per process (`data/writer.ts`); short ledger commands
  can use the synchronous transaction API on the main connection (no other JS can interleave); foreign keys
  enabled at open on every connection we create. **PoC P2** proves: atomicity under concurrent UI + timer +
  background task, rollback on error, FK enforcement, throughput with 100k operations.
- _Android/iOS_: both. _Dev Build_: yes (SQLCipher requires it). _Native code_: no.

## 3. Query and schema layer — **Drizzle ORM (query builder + types), SQL migrations reviewed by hand**

- _Fit_: typed queries catch column mistakes (helps agents); schema in TS next to the domain types.
- _Alternatives_: hand-written SQL with hand-written row types (fewest dependencies, most boilerplate);
  Kysely (typed builder, no schema-to-migration tool); Prisma (not suited to RN SQLite).
- _+_ type safety, `drizzle-kit` generates SQL, documented expo-sqlite integration (Confirmed as listed by
  Expo). _−_ another dependency; generated migrations can propose destructive diffs (renames as drop+add).
- _Rule_: generated migration SQL is read, edited if needed and committed; every migration has a test
  (DATA_MIGRATION_PLAN §3). If PoC P2 shows Drizzle's transaction API cannot run inside our writer
  cleanly, use hand-written SQL repositories instead (decision at C1).
- _Native code_: no.

## 4. State — **database as the store + a small UI store (Zustand)**

- Data on screen comes from named queries re-run on table changes (expo-sqlite change listener, or
  Drizzle's live query hook). UI-only state (period, filters, selection, lock state, open sheets) in a few
  Zustand stores or component state. Editor drafts in `useReducer` with the reducer in the feature.
- _Alternatives_: Redux Toolkit (more ceremony than needed), TanStack Query (built for remote fetching;
  usable but invalidation would be manual), React Context only (re-render scope too wide), Jotai (fine; one
  small store library is enough).
- _Risk_: low. _Native code_: no.

## 5. Forms and validation — **no form library; domain validation; Zod at boundaries**

- The heaviest form (operation editor) is a calculator with two amounts, sides and options, not a field
  form; a reducer + domain `validateDraft` fits better than React Hook Form/Formik.
- Zod schemas validate untrusted input only: data files, CSV mapping results, deep-link params, sync
  payloads, migration input. Domain errors come from domain functions with codes.
- _Alternatives_: React Hook Form (good for long field forms; adopt per screen if one appears), Valibot.

## 6. Authentication (later) — compared in AUTH_SYNC_ARCHITECTURE §3; no choice before decision Q-A1.

## 7. Cloud synchronization (later) — compared in AUTH_SYNC_ARCHITECTURE §4; schema is sync-ready now.

## 8. Background tasks — **`expo-background-task` first; a small local module if PoC P3 requires**

- _Confirmed (Expo docs)_: Android uses WorkManager, iOS BGTaskScheduler; minimum interval 15 min on
  Android; execution "at some point in the future if the system decides so"; tasks run only when the
  battery is sufficient **and the network is available**; killed app stops tasks until restart; iOS often
  ignores short intervals and needs a physical device to test.
- _Problem_: a network requirement contradicts offline posting. **PoC P3** checks whether that constraint is
  really applied on Android; if it is, write `modules/monivra-background` (Kotlin, ~200 lines): a periodic
  WorkManager job without network constraint + a one-off job at the next due time, both calling the same
  JS task. iOS stays on BGTaskScheduler (no alternative exists).
- _Alternatives_: `react-native-background-fetch` (third-party, similar OS limits); headless JS + AlarmManager
  only (exact alarms need policy-sensitive permissions).
- Details and honest limits: BACKGROUND_EXECUTION.md.

## 9. Notifications — **`expo-notifications`** (local, scheduled)

- _Confirmed_: SDK 58 shows foreground notifications by default, adds Android `delivery: 'alarmClock'` for
  time-critical alarms and a `largeIcon` config option. Channels, date triggers, permission request.
- _Alternatives_: Notifee (rich Android features; check maintenance before considering), keeping the
  Capacitor plugin (not available in RN).
- _Risk_: medium (permissions and alarm semantics change with Android versions). `alarmClock` delivery
  shows an alarm icon and is meant for alarms — whether payment reminders qualify is a product/policy
  decision (Q-N1). _Native code_: no.

## 10. Secure storage and lock — **`expo-secure-store`** + **`expo-local-authentication`**

- Keystore/Keychain-backed storage for the PIN verifier and (if adopted) the SQLCipher key; biometric
  prompt. PIN hashing: a platform KDF (e.g. PBKDF2 with a higher iteration count, via `expo-crypto` or a
  native call) — PoC P6 measures time on a low-end phone.
- _Alternatives_: `react-native-keychain` (more options; third-party). _Native code_: no.

## 11. Localization — **i18next + react-i18next, English text kept as keys**, `expo-localization`

- _Fit_: today's 1,302 Russian strings are keyed by English text; i18next accepts natural-language keys
  (separators disabled), so `ru.js` converts to `ru.json` by script. Plural arrays convert to i18next
  plural suffixes (`_one/_few/_many/_other`).
- _Alternatives_: Lingui (macro-based extraction, good; needs a build step), FormatJS/react-intl (ICU
  messages; heavier rewrite of strings).
- **PoC P5**: Hermes `Intl` coverage for what the app uses today — `NumberFormat` grouping,
  `DateTimeFormat` with `timeZone: "UTC"`, `PluralRules` (ru), `DisplayNames` (currency names),
  `formatRange` (period bar). Missing pieces get `@formatjs` polyfills.

## 12. Design system — **own components on `StyleSheet` + tokens**, Reanimated, Gesture Handler, `react-native-svg`

- _Fit_: identity must stay as today; a UI kit with its own look (React Native Paper/Material, Tamagui
  themes) would pull the product away from it.
- _Alternatives_: NativeWind/Tailwind (fast styling, class strings again), Tamagui (compiler, complexity),
  Unistyles (good theming; one more dependency — acceptable alternative if theming needs grow).
- Bottom sheets: `@gorhom/bottom-sheet` vs a sheet built on Reanimated — **PoC P1** (keyboard behaviour,
  footer that stays visible, nested sheets; these are today's hardest layout rules, `LAYOUT_RULES.md`).

## 13. Charts — **own SVG components** (`react-native-svg`)

- Today: a donut and bars drawn as custom SVG (`domain/chart.js` slices). Two chart types do not justify a
  chart library. _Alternatives_: Victory Native (Skia), gifted-charts. Revisit if analytics grows.

## 14. Reports / PDF / print — **render the report model as HTML → `expo-print`** (PDF file, system print), `expo-sharing`

- The model (`report-model.js`) ports; the canvas + hand-written PDF writer does not (T-19).
- _Alternatives_: Skia drawing of pages (closer to today's layout code, PDF output path unclear), a native
  PDF module (more native code).
- **PoC P7**: a 50-page detailed report with Cyrillic, long comments, three currencies — time, file size,
  cancellation, page breaks.

## 15. Files, photos, sharing

`expo-file-system` (documents, SAF on Android for "save to…"), `expo-document-picker`, `expo-sharing`,
`expo-image-picker` + `expo-image-manipulator` (shrink photos as today). Attachments as files (T-12).

## 16. Ids and time

`uuid` (v7 for new records, v5 for deterministic occurrence ids) with a secure random source
(`expo-crypto`/`react-native-get-random-values`); dates stay `YYYY-MM-DD` strings with ported helpers (no
date library needed; Temporal not required).

## 17. Testing — Jest (`jest-expo`), React Native Testing Library, real-SQLite tests, **Maestro** E2E

- _Alternatives_: Detox (powerful, heavier setup and flakiness on CI emulators), Appium (generic, slow).
- Real SQLite in Node for repository/migration tests: `node:sqlite` or `better-sqlite3` running the same SQL
  files [A — PoC P2 confirms SQL dialect parity with expo-sqlite's SQLite version].
- Parity harness re-uses Playwright (already installed) to run the old `js/domain` in Chromium.

## 18. Logging, errors, crash reporting

Local structured log (ring buffer in a file, no money data), error boundaries, `DomainError` codes.
Remote crash reporting (`@sentry/react-native` or similar) **only after** decision Q-P3 (needs `INTERNET`,
privacy policy, data-processing terms).

## 19. CI/CD — GitHub Actions (kept)

- Jobs: typecheck, ESLint, Prettier, dependency-cruiser, Jest, DB tests, parity tests, Android build
  (`expo prebuild` + Gradle, signed as today), Maestro on the Android emulator (as `android.yml` does now).
- iOS builds need macOS: EAS Build or macOS runners when iOS starts (Q-P4).
- Release signing: the existing key flow (re-sign with the owner's key) continues; Google Play App Signing
  when publishing (owner decision).

## Sources (vendor documentation read on 2026-11-11)

- [Expo SDK versions table](https://docs.expo.dev/versions/v58.0.0) — platform versions per SDK
- [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58.md) — RN 0.88, router rework, notifications, sqlite changes
- [expo-background-task](https://docs.expo.dev/versions/latest/sdk/background-task.md) — WorkManager/BGTaskScheduler limits
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite) — transactions, SQLCipher, WAL, session, change listener
- [PowerSync + Supabase guide](https://docs.powersync.com/integration-guides/supabase-+-powersync) — candidate sync stack (AUTH_SYNC)
