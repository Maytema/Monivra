# Current architecture (as found on 2026-11-11)

Labels: see [README.md](README.md#evidence-labels-used-in-every-document).

## 1. What the application is

- An offline personal-finance tracker written as **vanilla ES modules with no build step and no runtime
  dependencies** [V `package.json`: only eslint, playwright, prettier as dev dependencies].
- Two delivery targets from one code base:
  - **Web**: `index.html` + `js/app/main.js`, published to GitHub Pages from `main` by
    `.github/workflows/pages.yml` [V].
  - **Android**: Capacitor 7 shell in `android-app/` that copies the same web files into the APK and swaps
    the entry point to `js/app/main-native.js` (`android-app/scripts/build-web.mjs`) [V]. Code package
    `app.monivra.finance`; test builds use applicationId `app.monivra.finance.dev`
    (`prepare-android.mjs`, default) [V]. `minSdk 23`, `targetSdk 35` [D `docs/ANDROID.md`].
- No network access at all in the APK: `INTERNET` is removed from the manifest [V
  `overlay/app/src/main/AndroidManifest.xml`]. No analytics, crash reporting, accounts, sync or payments.
- `main` is 22 commits behind `android-first-apk`; nothing of the Android work is merged [V `git rev-list`].

Size [V]: 133 JS modules / 19.5k lines (`screens` 7.3k, `data` 2.7k, `domain` 2.6k, `i18n` 1.7k,
`app` 1.6k, `ui` 1.6k, `platform` 1.4k, `core` 0.6k), 15 CSS files / 7.3k lines, 5 Java classes / 0.8k
lines, 1,302 Russian strings (28 of them plural forms).

## 2. Runtime model

```
index.html ─► js/app/main.js (web) | main-native.js (Android: prepareNative() first)
            └► startup(): global listeners, first render(), posting of due payments, reminders
render()  (app/shell.js): builds the whole page as one HTML string from appData + uiState,
            passes it through translateMarkup, writes #app.innerHTML, restores scroll positions
taps      ─► one document click listener ─► data-action id ─► closure registry (ui/handlers.js)
commands  ─► domain/* mutate the global appData in place ─► save() ─► localStorage (+ Android mirror)
```

- **State** [V `js/core/state.js`]: `appData` (everything the person owns, one mutable global object) and
  `uiState` (tab, period, filters, selection, page stack, sheet stack). The period survives in
  `sessionStorage` only.
- **Rendering** [V `js/app/shell.js`]: no framework, no virtual DOM. Every change re-renders the whole page.
  Handlers cannot be closures in HTML strings, so `buttonHtml(label, fn)` stores `fn` in a registry under
  a fresh id on every render [V `js/ui/handlers.js`].
- **Navigation** [V `js/ui/navigation.js`]: two stacks, pages (`openPage/goBack/goHome`) and layers
  (`openSheet/closeLayers`); both keep a function that rebuilds their HTML. Swipe between root tabs with a
  live preview (`app/swipe.js`). Android Back is reported by the shell (`platform/lifecycle.js`).
- **Translation** [V `js/i18n/index.js`]: English text is the key; `translateMarkup` translates finished
  HTML by regex over text nodes and `aria-label|placeholder|title`. Plurals via `translateCount` and
  `Intl.PluralRules`. Two languages: `en`, `ru`.
- **Theme** [V `css/base.css`, `app/shell.js applyAppearance`]: CSS custom properties derived from one
  accent colour with `color-mix`; `.dark` class; readable text colour computed in JS (`core/color.js`).
  613 `var(--…)` uses vs 54 literal colours in CSS [V grep].

## 3. Declared layers vs actual dependencies

`ARCHITECTURE.md` declares `app > screens > ui > domain > data > core`, with two small exceptions
(`render()` and `save()`). The import graph says otherwise [V, script over all imports]:

| Edge that goes "up" or sideways | Count | Example                                                          |
| ------------------------------- | ----- | ---------------------------------------------------------------- |
| `data → ui`                     | 6     | `data/storage.js` imports `toast` and `save-alert`               |
| `data → screens`                | 3     | `data/import-export.js` builds pages                             |
| `data → domain`                 | 8     | `data/backup-file.js → domain/backups.js`                        |
| `domain → ui`                   | 1     | `domain/backups.js → ui/save-alert.js`                           |
| `core → data`                   | 2     | `core/state.js` imports `data/defaults.js` and `data/storage.js` |
| `ui → app`                      | 11    | `render()`                                                       |
| `screens → app`                 | 38    | `render()`                                                       |

**98 of 133 modules form one strongly connected import cycle** [V]. It works because ES modules tolerate
cycles when nothing is used at load time, but it means no module can be lifted out alone.

Coupling of the money logic to global state [V, grep per file]: `domain/finance.js` uses `appData` on 25
lines and `uiState` on 9 lines (period, filters); `operations.js`, `accounts.js`, `categories.js`,
`scheduled.js`, `currency-change.js`, `ordering.js`, `deletion.js`, `backups.js` all mutate the global
`appData` and call `save()` themselves. Pure modules (no `appData`): `fees.js`, `dual-amount.js`,
`sides.js`, `percent.js`, `chart.js`, `reminders.js`, `reminder-plan.js`, `restore.js`,
`currency-search.js`, `data/currencies.js`.

Business logic inside screens [V]: budget create/update/delete and its validation
(`screens/budgets.js` ~line 240), "scheduled expenses" totals (`screens/statistics.js` line 140),
group totals (`screens/accounts/list.js` lines 166, 237), archive toggle (`screens/accounts/edit.js`),
tag creation (`screens/operation-editor/extras.js`, `operations/bulk-edit.js`), exchange-rate edits
(`screens/rates.js`). 36 direct `save()` calls live in `screens/`, `app/` and `ui/` [V grep].

## 4. Data and persistence

- **One JSON document** under `localStorage["monivra.offline.2026.v1"]`, `schema: 1` [V
  `core/constants.js`, `data/defaults.js`]. Lists: `accounts`, `categories`, `ops`, `tags` (strings),
  `scheduled`, `budgets`, `backups` (up to 10 full snapshots **inside the same document**), `settings`,
  `rates`.
- **Load** [V `core/state.js`]: parse → `findDataProblem` (full validation, `data/storage.js`) →
  `completeData` (fills defaults, migrates old shapes: single `photo` → `photos`, plain PIN → hash,
  string reminder → object). Unreadable data is **never overwritten**: it is kept in `loadProblem` and the
  recovery screen asks the person; saving is blocked until then.
- **Save** [V `data/storage.js save()`]: `JSON.stringify(appData)` of the whole document on every change;
  a failure (quota) shows a persistent alert. Limit ≈ 5 M characters (measured, `STORAGE_LIMIT_CHARS`);
  photos are base64 JPEG data URLs inside operations (`MAX_PHOTOS = 5`), so photos and the 10 inner
  backups compete for the same quota.
- **Android second copy** [V `platform/native-sync.js`, `DataMirror.java`]: 800 ms after a save the
  stored text is written to `files/mirror/data.json` as `{v, savedAt, seq, sha256, text}` (temp file,
  fsync, rename, previous copy kept as `data.prev.json`). At start, if `localStorage` is empty the copy is
  restored; if the copy has a higher save number it is taken (WebView flushes `localStorage` lazily). It
  never replaces damaged data. `allowBackup="false"`: Android cloud backup is off [V manifest].
- **Ids** [V `newId`]: `Date.now().toString(36)` + 6 base-36 chars of `Math.random()`. Not UUIDs.
- **Dates** [V]: local calendar days `YYYY-MM-DD` (`today()` via `toLocaleDateString("en-CA")`), times
  `HH:MM`; arithmetic on dates at noon UTC to avoid DST.
- **Money** [V]: integers in **hundredths for every currency** (`formatNumber` divides by 100,
  `evaluateExpression` multiplies by 100, fixed fees `value * 100`). Currencies with 0 or 3 decimals
  (JPY, KWD…) are still stored in hundredths. Rates: one table "KGS per unit", editable, no history.

## 5. Domain logic (where the money rules live)

| Concern                      | Module                                           | Notes                                                     |
| ---------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Balance, conversion, periods | `domain/finance.js`                              | Balances derived on every call; see FINANCIAL_RULES_AUDIT |
| Validate / store / bulk edit | `domain/operations.js`                           | `validateOp`, `putOperation`, `applyBulkChanges`          |
| Fees (tax, commission)       | `domain/fees.js`                                 | Pure                                                      |
| Scheduled payments           | `domain/scheduled.js`                            | `nextDate`, `postDue`, `catchUp`, `settleMissed`          |
| Budgets                      | `domain/budgets.js` (+ CRUD in screen)           | Spent = report rows of the period                         |
| Accounts, cards, debts       | `domain/accounts.js`, `finance.js cardState`     | Opening balance + adjustment operations                   |
| Categories                   | `domain/categories.js`                           | Delete cascades to operations                             |
| Currency change              | `domain/currency-change.js`                      | Two modes, rounding remainder into opening balance        |
| Backups / restore / deletion | `domain/backups.js`, `restore.js`, `deletion.js` | Restore planned as a whole before anything changes        |
| Reports (PDF/CSV)            | `domain/report-model.js`, `data/report-*.js`     | Own copy of the balance formula (`balanceOn`)             |
| CSV import                   | `data/csv-import.js`                             | Plan → apply → undo                                       |
| Reminders                    | `domain/reminders.js`, `domain/reminder-plan.js` | Pure                                                      |

## 6. Platform layer (Android)

`js/platform/*` is the only web code that knows about the shell [V]; `platform/native.js` returns
`null` plugins in a browser. Native side [V `overlay/.../*.java`]:

| Native piece                     | What it does                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MonivraNativePlugin`            | save/share document (SAF, FileProvider), print PDF, biometric prompt, secure get/set/remove, mirror read/write, 12/24 h setting, app-ready (splash), system bars, privacy screen (`FLAG_SECURE`: no screenshots, hidden in recents) |
| `SecureStore`                    | AES-GCM key in Android Keystore (`monivra_secure_v1`); holds the PIN verifier                                                                                                                                                       |
| `DataMirror`                     | Second copy of the data with SHA-256 and previous copy                                                                                                                                                                              |
| `PdfPrintAdapter`                | System print of the generated PDF                                                                                                                                                                                                   |
| `@capacitor/local-notifications` | Payment reminders and the periodic reminder (see `docs/SCHEDULED_AND_NOTIFICATIONS.md`)                                                                                                                                             |
| `@capacitor/app`                 | Back button, lifecycle                                                                                                                                                                                                              |

PIN [V `platform/pin.js`]: PBKDF2-HMAC-SHA256, 20,000 iterations, salted, implemented in JS; on Android the
verifier lives in `SecureStore` and the data keeps only `{v:2, native:true, length}`. Screen lock only;
the financial data is **not encrypted** at rest by the app [V comments in `pin.js`, `secure-pin.js`].

## 7. Build, CI, signing

- `.github/workflows/android.yml` [V]: job 1 lint + unit + browser suites; job 2 build APK
  (`android-app/scripts/ci-build.sh`), publish to branch `android-builds`; job 3 Android 14 emulator test
  (`android-app/e2e/emulator.mjs`: install, offline start, kill/restart persistence, damaged data not
  overwritten, rotation, language/theme, foreign-signature refusal, alarm registered, no financial data in
  logcat).
- Signing [V/D]: CI signs with an ephemeral key and publishes `RESIGN-ONLY-*.apk`; the owner's test key
  (`keys/monivra-test.jks`, kept outside the repository) re-signs. `versionCode` = CI run number.
- `pages.yml` publishes the web version from `main`.

## 8. Tests (summary; details in TEST_STRATEGY.md)

27 test files, 8.7k lines: in-page unit checks (`tests/*.test.js`, 223 checks run by `tests/run.mjs` in
headless Chromium), browser scenarios (`tests/scenarios.mjs`, phone-sized Playwright), focused suites
(`android-mock`, `storage-limits`, `selection`, `pin`, `pdf-cancel`, `statistics`, `scheduled-ui`), the
Android emulator test, and visual regression tools (`tools/visual-regression`). Reference screens of the
product the app is compared with are in `catalog/` (45 images).

## 9. What the current architecture does well (worth keeping as principles)

1. Money as integers; one place each for percent rounding (`domain/percent.js`) and fees.
2. Balances are **derived**, never stored, so editing or deleting history cannot leave a stale balance.
3. Scheduled occurrences carry `fromSchedule {id, date}`; posting checks it, so an occurrence is posted
   once even after restore or merge [T].
4. Destructive operations are planned first (`planRestore`, `planCurrencyChange`, `planImport`), shown, then
   applied as a whole; a failed save rolls the in-memory state back (`restoreData`, `deleteData`).
5. Stored data that fails validation is never silently replaced.
6. Strong habit of regression tests per rule (FINANCIAL_RULES.md ↔ `premerge.test.js`, `stress.test.js`).

## 10. Structural limits that motivate a new architecture

1. Whole-document JSON in `localStorage`: no transactions, ≈5 MB ceiling shared with photos and backups,
   full rewrite on each save, unreadable from Android background code.
2. One global mutable object: commands mutate in place and save; a command that throws half-way leaves the
   in-memory object partly changed (most commands validate first, but not all — see TECHNICAL_DEBT T-05).
3. Full-page string rendering: every change redraws everything; balance is recomputed per account per
   render (O(accounts × operations)).
4. Import cycle covering 74 % of modules; business rules in screens.
5. No identity, sync or entitlements; ids are not globally unique by construction.
6. Nothing financial can run while the app is closed (documented in
   `docs/SCHEDULED_AND_NOTIFICATIONS.md`).
