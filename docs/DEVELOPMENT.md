# Development

## Setup (new application)

```bash
cd mobile
npm ci                 # needs access to the npm registry
npx expo start         # development server (Expo Go is not enough: native modules → a development build)
npx expo run:android   # development build on a connected phone or emulator (Android SDK needed)
```

Tests need no install: `node --test test/*.test.ts` (Node 22+). See [TESTING.md](TESTING.md).

The CI builds are the release path today: every push to `rn-migration` builds `arm64-v8a` (phones) and
`x86_64` (emulator) release APKs (`.github/workflows/mobile.yml`). The APK on `mobile-builds` is signed
with a throw-away key and must be re-signed with the project key before it is given to a person; the key
and its password are kept outside the repository and are never printed or committed.

## Setup (first application)

```bash
python3 -m http.server 8000      # from the repository root, open http://localhost:8000
npm test                          # checks (Playwright with Chromium)
```

Its Android shell: [ANDROID.md](ANDROID.md).

## Conventions (new application)

- TypeScript strict; names say what a thing is; a short comment at the top of each module says what it
  is and which file of the first application it reproduces.
- Money: `Minor` integers; conversion and rounding only through `domain/money.ts`.
- Visible text: English in code through `t.t("…")` / `t.tc(one, other, n)`; Russian in
  `src/i18n/ru-mobile.json` in the same change.
- Colours and sizes come from `ui/theme.ts` and the shared pieces of `ui/`; a measure copied from the
  first application's CSS or the owner's reference is named in a comment.
- A button that the emulator tour must reach has an `accessibilityLabel`.
- Do not call `toLocaleString`, `Intl.*` or `localeCompare` in code that runs per row or per frame
  ([decision 0003](decisions/0003-no-platform-formatting-in-hot-paths.md)).
- Sheets and pages of a flow: `sheets.open(<Content />, "sheet" | "dialog" | "full")`; a long list inside a
  sheet passes `{ scrolls: true }` so it is not nested in the sheet's scroll view.

## Preparing a change for review

1. `node --test test/*.test.ts` and `node scripts/check-boundaries.mjs` pass; `tsc -p tsconfig.core.json`
   passes when the core changed.
2. Commit with a message that says what changed and why; documents updated in the same commit
   ([AGENTS.md §5](AGENTS.md#5-keeping-documents-in-step-with-code)).
3. Push to `rn-migration`; read the CI run (types, build, emulator tour) and its screenshots before saying
   anything is done.
4. Report in Russian: what changed, the evidence, what was not checked.
