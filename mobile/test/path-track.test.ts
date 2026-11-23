import { test } from "node:test";
import assert from "node:assert/strict";
import { numberTrack, pathTrack } from "../src/ui/path-track.ts";
import { NOTE_OUTLINE, NOTE_TIMES, RING_BACK, RING_FRAMES, RING_FRONT } from "../src/ui/budget-motion.ts";

const nums = (s: string) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

test("a track holds the ends and blends the numbers between two strings", () => {
  const track = pathTrack([0, 100], ["M0 0L10 20Z", "M10 0L20 40Z"]);
  assert.equal(track(-5), "M0 0L10 20Z");
  assert.equal(track(100), "M10 0L20 40Z");
  assert.equal(track(50), "M5 0L15 30Z");
  assert.equal(track(25), "M2.5 0L12.5 25Z");
});

test("the Budgets tracks equal a plain linear blend of the recorded frames (to the rounding of 0.01)", () => {
  const times = RING_FRAMES.map((r) => r[0]!);
  for (const [t, list] of [[NOTE_TIMES, NOTE_OUTLINE], [times, RING_BACK], [times, RING_FRONT]] as const) {
    const track = pathTrack(t, list);
    for (const i of [0, 3, 11, t.length - 2]) {
      const mid = (t[i]! + t[i + 1]!) / 2;
      const a = nums(list[i]!), b = nums(list[i + 1]!), got = nums(track(mid));
      assert.equal(got.length, a.length);
      got.forEach((v, k) => assert.ok(Math.abs(v - (a[k]! + b[k]!) / 2) <= 0.0051, `${i}/${k}`));
    }
  }
  const width = numberTrack(times, RING_FRAMES.map((r) => r[4]!));
  assert.equal(width(times[5]!), RING_FRAMES[5]![4]);
});
