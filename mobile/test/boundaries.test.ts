// The layers of src/ depend on each other in one direction only (domain is pure; screens are on top),
// and no file imports itself through a cycle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the structure of src/ keeps its layers and has no import cycle", () => {
  const run = spawnSync(process.execPath, ["scripts/check-boundaries.mjs"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
