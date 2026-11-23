// The empty-state pictures: four tab kinds play on the first visit, replay until the person acts, then stay at rest on screens
// already seen; budgets and scheduled payments always play (ui/quiet.ts). The module keeps launch-wide state, so the steps
// run in one test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPlayed, isQuiet, markActed, markPlayed, shouldPlay } from "../src/ui/quiet.ts";

test("first visit always plays; replays until the person acts; then only unseen tab screens play; budgets and scheduled always play", () => {
  assert.equal(isQuiet(), false);
  assert.equal(shouldPlay("accounts"), true);
  assert.equal(hasPlayed("accounts"), false);
  markPlayed("accounts");
  assert.equal(hasPlayed("accounts"), true);
  assert.equal(shouldPlay("accounts"), true, "replays before the person acts");
  markPlayed("budgets");
  markPlayed("scheduled");
  markActed();
  assert.equal(isQuiet(), true);
  assert.equal(shouldPlay("accounts"), false, "seen tab screen is at rest");
  assert.equal(shouldPlay("operations"), true, "unseen tab screen still plays");
  markPlayed("operations");
  assert.equal(shouldPlay("operations"), false);
  assert.equal(shouldPlay("budgets"), true, "budgets play at every visit, whatever the person did");
  assert.equal(shouldPlay("scheduled"), true, "scheduled payments play at every visit");
});
