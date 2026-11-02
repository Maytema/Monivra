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

## Percent and progress lines

A percent is rounded once, in `domain/percent.js` (`shownPercent`: two decimals, rounded as usual,
never 100 for a target that is not reached), and written by `ui/percent.js`; no screen rounds
or formats a percent by itself. Whether a goal is reached is decided on the amounts, never on the
rounded percent. The line under a meter must not repeat a figure the card already shows: a goal
says what is left (`To goal`), a debt what is paid back, a budget what is left or by how much it is
passed (`Over by`), a credit limit only that it is used up or exceeded.

## Notices

What just happened is told by `notice` (`ui/primitives.js`), at the bottom, above the navigation
bar and the floating button, never over the balance. First ask whether it is needed: when the
result is in front of the person (an operation saved on the list that shows it, a payment saved on
the scheduled payments) the highlighted row is the answer and there is no notice. Otherwise there
are two weights. `quiet` is as small as a toast with a check and, when a tap leads on, an arrow
(3.2 s; 1.6 s without a tap), for what went as expected. `important` is a card with a second line
(4.5 s) for what ended up somewhere else than one might think, such as a payment dated in the
future that went to the scheduled payments. A new kind of notice picks one of the two; it does
not get a form of its own. A notice is hidden while a sheet or a dialog is open, so the next
operation is never covered. `toast` is for short text without an icon, mostly input mistakes.

## Before handing over

Run `node tests/run.mjs`, `node tests/scenarios.mjs`, `npm run lint` and `npm run format:check`.
Only two working branches exist besides `main`: `updates` for improvements that invent nothing new
(spacing, layout, fixes, matching the original) and `experiments` for new functions and large
changes. Never create further branches. After a pull request is merged, reset the branch to `main`
and force-push it (`git push --force origin main:updates`), so the branches stay clean. Merge only
when the owner says so. After a change that
is visible on a phone, tell the owner to reload the page fully, because the browser keeps the
old modules.
