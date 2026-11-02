# For an agent working on this repository

Start with [WHERE_TO_LOOK.md](WHERE_TO_LOOK.md): it names the files for a screen, a look or a
symptom, so the whole project need not be read. Then [ARCHITECTURE.md](ARCHITECTURE.md) for how a
screen is drawn and [DEVELOPMENT.md](DEVELOPMENT.md) for conventions and checks.

## How the work is done

- The application is compared with an original one; `catalog/` holds its screens. Behaviour comes
  from those screens or from the person who owns the project. Do not invent rules or arithmetic;
  if something is missing, ask one short question and say what to film or photograph.
- Find the cause and fix it where it arises. No workarounds that hide a problem, no `!important`,
  no hard-coded demo data in the application, no unused code, no digits or versions in names.
- Look and behaviour stay the same across screens: build sheets, rows, fields and buttons from
  `ui/primitives.js` and the tokens in `css/base.css`. When one screen is fixed, check the others
  that are built the same way. The rules for the sizes and the ends of screens are in
  [LAYOUT_RULES.md](LAYOUT_RULES.md); read them before building or changing a window.
- A person never sees a technical error. Commands throw `Error("message for the person")`;
  details go to the console.
- New visible text: English in the code, Russian in `js/i18n/ru.js`.
- Stored data keeps loading: do not rename the storage key or fields without a migration in
  `completeData`.

## Before handing over

Run `node tests/run.mjs`, `node tests/scenarios.mjs`, `npm run lint` and `npm run format:check`.
Only two working branches exist besides `main`: `updates` for improvements that invent nothing new
(spacing, layout, fixes, matching the original) and `experiments` for new functions and large
changes. Never create further branches. After a pull request is merged, reset the branch to `main`
and force-push it (`git push --force origin main:updates`), so the branches stay clean. Merge only
when the owner says so. After a change that
is visible on a phone, tell the owner to reload the page fully, because the browser keeps the
old modules.
