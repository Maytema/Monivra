// The empty-state pictures play on the first visit of every screen, replay until the person acts, then stay at rest on
// screens already seen (ui/quiet.ts). The module keeps launch-wide state, so the steps run in one test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuiet, markActed, markPlayed, shouldPlay } from "../src/ui/quiet.ts";

test("first visit always plays; replays until the person acts; then only unseen screens play", () => {
  assert.equal(isQuiet(), false);
  assert.equal(shouldPlay("budgets"), true);
  markPlayed("budgets");
  assert.equal(shouldPlay("budgets"), true, "replays before the person acts");
  markActed();
  assert.equal(isQuiet(), true);
  assert.equal(shouldPlay("budgets"), false, "seen screen is at rest");
  assert.equal(shouldPlay("scheduled"), true, "unseen screen still plays");
  markPlayed("scheduled");
  assert.equal(shouldPlay("scheduled"), false);
});
