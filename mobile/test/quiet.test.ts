// The empty-state pictures replay until the person has done something in this launch (ui/quiet.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuiet, markActed } from "../src/ui/quiet.ts";

test("the pictures play until the person acts, then stay at rest", () => {
  assert.equal(isQuiet(), false);
  markActed();
  assert.equal(isQuiet(), true);
  markActed();
  assert.equal(isQuiet(), true);
});
