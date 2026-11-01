# Development

## Setup

```
npm install              # eslint, prettier, playwright (checking only)
npx playwright install chromium
python3 -m http.server 8000
```

## Checks

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `node tests/run.mjs`    | Opens the app in Chromium and runs the in-page checks (`tests/*.test.js`) |
| `node tests/scenarios.mjs` | Drives the app like a person in a 360 px wide browser            |
| `npm run lint`          | ESLint (`eslint.config.js`): undefined and unused names, `prefer-const`, `===` … |
| `npm run format:check`  | Prettier, `printWidth` 100                                            |
| `tools/visual-regression` | Compares screenshots of every reachable screen with a trusted version |

Run all of them before a pull request. Behaviour that moved to the domain gets a check in
`tests/*.test.js`; behaviour a person sees gets a scenario in `tests/scenarios.mjs`.

The in-page checks live in `tests/` and are never imported by the application. Each check
starts from the sample data and the user's own data is restored afterwards
(`tests/harness.js`).

## Conventions

- **Names say what a thing is.** No digits, versions or "new/old" in names. Handlers are
  verbs (`saveAccount`), HTML builders end in `Html`, screen builders in `View` or `Page`.
  A state field is named for what it holds (`calculatorOn`, `resultReady`, `activeSide`).
- **Logic before layout.** A rule about money, records or validation goes to `domain/` with a
  check. A screen builds markup from a draft and calls a command.
- **Throw `Error("message for the person")`** from commands. Do not catch it in the screen
  unless the screen has something else to do; the click handler shows it.
- **No workarounds.** If something misbehaves, find the cause and fix it where it arises.
- **Comments** only where the reason is not obvious from the code; one short line per module
  saying what it is for.
- **CSS** uses the tokens in `css/base.css`. No `!important`, no inline colours.
- **Text** is English in the code; `i18n/ru.js` maps it. A new visible string needs a Russian
  entry.
- **Data format.** Do not rename fields of `appData` or the storage key. A change that old
  documents do not satisfy goes into `completeData` so stored data keeps loading.

## Adding things

**A page.** Write `xxxView(page)` returning HTML, register its kind in the page table of
`app/shell.js`, open it with `openPage("kind", state)`.

**A sheet or dialog.** `openSheet(() => html, "Title")` — the function is called on every render.
Build everything the sheet shows inside that function, or the markup goes stale after a tap.
Buttons that finish a sheet go into `sheetFooterHtml(...)`: they stay in view while the content
above them scrolls. Use Cancel / Confirm for choices and a single Complete for the rest.

**A tappable element.** `buttonHtml(label, fn, className)`; an input uses `registerInput`.

**A command.** A function in `domain/` that validates, changes `appData`, calls `save()`, and
returns what it removed if it deletes records.

**A language.** Create `js/i18n/<code>.js` with an object `{ "English text": "Translation" }`
and list it in `LANGUAGES` in `js/i18n/index.js`.

**A check.** `check("what must hold", () => boolean)` in a `tests/*.test.js` file; import the
file in `tests/index.js`.
