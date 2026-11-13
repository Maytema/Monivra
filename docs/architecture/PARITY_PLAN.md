# How we know the native application equals the first one

Nobody can prove "everything is identical" for a whole application; what a professional rewrite does is shrink
the unknown until what is left is small, listed, and decided on purpose. Four layers, each catching what the
others miss (the approach follows Martin Fowler's *Feature Parity* pattern and the usual cross-platform parity
checklists):

1. **Behaviour of the rules — differential tests.** The same inputs go through the first application's code
   (`js/domain`, run by `mobile/test/parity/run-old.mjs`) and through the new `mobile/src/domain`; the outputs
   must be equal (balances, periods, scheduled posting, reminders, CSV, report, currency change, deletion
   impact …). Extend this for every rule that touches money until each exported function of `js/domain` has a twin.
2. **Inventory of screens and actions — the parity matrix.** One table (`docs/architecture/PARITY_MATRIX.md`,
   to be filled): every screen, window, button, long press, swipe, empty state, error text of the first
   application (found from `js/` and the crawl of `tools/tour/crawl-old.mjs`) with the native counterpart and a
   status: *same*, *adapted on purpose* (with the reason: browser → native), *missing*. "Done" means no row is
   *missing* and every *adapted* row has a reason.
3. **Side-by-side screenshots.** The emulator tour (`mobile/scripts/emulator-smoke.sh`) produces one image per
   row of the matrix; the old crawl produces the other. A person (or a script for plain layout) compares them.
   A mismatch is fixed or written down as accepted.
4. **Texts.** Every English key of `js/i18n/ru.js` is either present in the native source or listed as dropped
   (browser-only). Checked by a script (`node tools/parity/texts-by-screen.mjs` writes PARITY_TEXTS.md: per screen file, the texts the native source lacks).
   Windows and pages: `node tools/parity/windows.mjs > docs/architecture/PARITY_WINDOWS.md` lists every `openSheet`, `confirmAction` and `openPage` call site of the first application (115), with hand-checked notes in `tools/parity/windows-notes.md`.

Progress is counted in finished vertical slices (a whole flow such as "create a scheduled payment, see it,
open it, skip it"), not in files or lines. Line counts mean nothing for equivalence.

Before every release: a 5-minute pass of the golden paths on a real phone, with the same test data on the
first and the native application.
