# Testing, checks and debugging

Every command here was run on 2026-11-13 in this repository; the result is noted.

## New application (`mobile/`)

| Check | Command (from `mobile/`) | Needs | Result 2026-11-13 |
| ----- | ------------------------ | ----- | ----------------- |
| Unit and integration tests (domain, database on Node's SQLite, store, rates, keypad, filters, parity with the first application) | `node --test test/*.test.ts` (same as `npm test`) | Node 22+, nothing installed | pass |
| Layers and import cycles | `node scripts/check-boundaries.mjs` (also `test/boundaries.test.ts`) | Node | "structure of src/ is in order (121 files)" |
| Types of the core (domain, data, application, services, i18n) | `tsc -p tsconfig.core.json` | TypeScript (`npm i -g typescript` or the project's) | exit 0 |
| Full types (with React Native) | `npx tsc --noEmit -p tsconfig.json` | `npm ci` (network to the npm registry) | run in CI only |
| APK build, emulator tour | `.github/workflows/mobile.yml` on every push to `rn-migration` | GitHub Actions | see the run |

What CI does on a push (`mobile.yml`): `npm ci`, tests, boundaries, types, `expo prebuild`, Gradle release
builds for `arm64-v8a` and `x86_64`, then the emulator job installs the x86_64 APK on an Android emulator
(API 34, Pixel 6 profile, ~411 dp wide) and runs `scripts/emulator-smoke.sh`. Results go to the branch
`mobile-builds` under `builds/<run number>/`: `BUILD.txt`, `apk-size-*.txt`, an unsigned APK to be re-signed,
and `emulator/` with a PNG and the UI tree (XML) of every step, `steps.txt` (taps, checks, `result: passed`),
`js-log.txt` (JavaScript log), `perf.txt` (timings), `crash.txt` when the app died.

Reading a run:

```bash
git fetch origin mobile-builds:refs/remotes/origin/mobile-builds
git show origin/mobile-builds:builds/<n>/emulator/steps.txt
git show origin/mobile-builds:builds/<n>/emulator/12-account-form.png > /tmp/shot.png
```

A step that only logs `NOT FOUND: <label>` did not fail the run; `FAIL:` lines and `result: failed` did.
An emulator start that fails while downloading the system image is an infrastructure failure: re-run
the failed job (`gh run rerun <id> --failed`).

### Adding to the emulator tour

`scripts/emulator-smoke.sh` taps by visible text or accessibility label (`tap "Label"`), takes `shot <name>
<seconds>`, checks `has "Text" <shot>`, and goes back with `back`. Give new buttons an
`accessibilityLabel` so the tour can reach them. Animations are switched off on the emulator, so the tour
shows layout, not smoothness.

## The first application as the reference

```bash
cd <repository root>
python3 -m http.server 8765 &                       # the first application, served
NODE_PATH=$(npm root -g) node tools/tour/crawl-old.mjs Accounts /tmp/old-accounts 3 90
```

`crawl-old.mjs <tab> <out> [depth] [max windows]` opens the first application at the emulator's size with
the data of `tools/tour/seed.json` (accounts of every kind, a debt each way, an archived account), presses
every button of every window from a fresh start (each path replayed) and writes one PNG per window plus
`inventory.json` (path that leads there, buttons, texts). It is a discovery aid: conditional states that no
button path reaches (errors, empty data, other settings) must be found in the code.

Checks of the first application itself (from the repository root):

| Command | Result 2026-11-13 |
| ------- | ----------------- |
| `npm test` (in-page checks + browser scenarios, needs Playwright with Chromium) | pass |
| `npx eslint js tests` | available (ESLint 10.1) |
| `node tools/visual-regression/crawl.mjs record|replay …`, `compare.mjs` | see `tools/visual-regression/README.md` |

## Testing money

- A change to a rule in `src/domain` needs a test in `test/finance-rules.test.ts` (or a file of its own)
  that would fail without the change; balances are checked by replaying operations, never by trusting a
  stored figure.
- Where the first application defines the behaviour, `test/parity.test.ts` runs its code
  (`test/parity/run-old.mjs`) and the new code on the same fixture and compares.
- `test/database.test.ts` checks one-transaction writes, refusals, migrations and that the SQL view
  `account_balance` equals the application's balances.

## Migrations and data preservation

A new migration gets a test in `test/database.test.ts` that opens a database of the previous version,
migrates it and checks that every record and balance is still there (the pattern of
"migrations: a fresh database gets the newest schema; a newer one is not touched" and "a data file of
the first application imports whole and reads back the same").

## Debugging

- **A screen looks wrong**: compare its emulator PNG with the first application's window (crawler) and
  the owner's reference; read the XML of the step for bounds and labels.
- **Something is slow**: read `perf.txt` (`layer … shown` = time from asking for a sheet to its first frame;
  `engine …` = cost of platform calls). Add `perfLog(label, ms)` (`src/platform/perf.ts`) around a
  suspect and push; never guess. Typical causes: platform formatting in rows, a list that is not
  virtualized, a hook that reads the whole ledger, an animation on the JavaScript thread.
- **A crash at start**: `crash.txt` and `js-log.txt` of the run.
- **Touches do nothing**: a responder that never released (see `ui/pager.tsx`
  `onPanResponderTerminationRequest`), or an invisible layer left open (`ui/sheets.tsx`).

## Regressions

Reproduce with a test (logic) or a tour step (screen) first, fix the cause, keep the test.
