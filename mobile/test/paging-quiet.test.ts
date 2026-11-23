// Paging is not acting: only the period dialog (and a calendar pick) is. Swipes and the arrows pass byPerson = false
// (features/period-bar.tsx); a command or opening the add sheet calls markActed itself. Own file: the quiet flag is launch-wide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuiet, shouldPlay } from "../src/ui/quiet.ts";
import { getView, setView } from "../src/features/view-core.ts";

test("paging does not stop the replays, a pick in the dialog does", () => {
  assert.equal(isQuiet(), false);
  const today = getView().period;
  setView({ period: { ...today, anchor: "2026-10-01" } }, false); // the arrow
  setView({ period: { ...today, anchor: "2026-09-01" } }, false); // a swipe of the pager
  assert.equal(isQuiet(), false, "paging through periods is not an action");
  assert.equal(shouldPlay("operations"), true);
  setView({ period: { ...today, anchor: "2026-05-01" } }); // a pick in the period dialog
  assert.equal(isQuiet(), true, "a pick in the period dialog is an action");
});
