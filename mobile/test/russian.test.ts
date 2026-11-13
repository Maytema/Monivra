// Every text of the screens that is written in English has a Russian translation (tools/parity/missing-russian.mjs).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("no screen text lacks a Russian translation", () => {
  const run = spawnSync("node", ["tools/parity/missing-russian.mjs"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
  assert.equal(run.status, 0, `Texts without a Russian translation:\n${run.stdout}`);
});
