import { test } from "node:test";
import assert from "node:assert/strict";
import { expand, valueAt, type Key } from "../src/ui/keys.ts";

test("keys expand to plain arrays and the value holds outside them", () => {
  const spec = expand([[100, 0], [200, 10], [300, 4]] as Key[]);
  assert.deepEqual(spec.input, [100, 200, 300]);
  assert.equal(valueAt(spec, 0), 0);
  assert.equal(valueAt(spec, 150), 5);
  assert.equal(valueAt(spec, 250), 7);
  assert.equal(valueAt(spec, 999), 4);
});

test("an easing is sampled in ten steps and ends on the key's value", () => {
  const spec = expand([[0, 0], [100, 1, (n: number) => n * n]] as Key[]);
  assert.equal(spec.input.length, 11);
  assert.equal(valueAt(spec, 100), 1);
  assert.ok(Math.abs(valueAt(spec, 50) - 0.25) < 1e-9);
});
