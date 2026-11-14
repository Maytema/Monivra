import { test } from "node:test";
import assert from "node:assert/strict";
import { chartBins, donutArcs, donutSlices, OTHER_SLICE, sliceAt, type Group } from "../src/domain/chart.ts";

const g = (id: string, total: number): Group => ({ id, name: id, color: "#000000", total });

test("donut: narrow slices beyond the first six are gathered into one that lists them", () => {
  const big = ["a", "b", "c", "d", "e", "f"].map((id) => g(id, 100));
  const slices = donutSlices([...big, g("x", 1), g("y", 2), g("zero", 0)]);
  assert.equal(slices.length, 7);
  const other = slices.at(-1)!;
  assert.equal(other.id, OTHER_SLICE);
  assert.equal(other.total, 3);
  assert.deepEqual(other.members?.map((m) => m.id), ["x", "y"]);
});

test("donut: a single narrow slice stays as it is, an empty category has none", () => {
  const big = ["a", "b", "c", "d", "e", "f"].map((id) => g(id, 100));
  assert.equal(donutSlices([...big, g("x", 1), g("none", 0)]).length, 7);
  assert.ok(donutSlices([...big, g("x", 1)]).every((s) => s.id !== OTHER_SLICE));
});

test("bars: each operation lands in the part of the period it falls into; at most 30 parts", () => {
  const rows = [
    { date: "2026-10-01", reportType: "expense" as const, reportAmount: 500 },
    { date: "2026-10-31", reportType: "income" as const, reportAmount: 900 },
    { date: "2026-10-31", reportType: "expense" as const, reportAmount: 100 },
  ];
  const r = chartBins(rows, "2026-10-01", "2026-10-31");
  assert.equal(r.days, 31);
  assert.equal(r.expense.length, 30);
  assert.equal(r.expense[0], 500);
  assert.equal(r.income[29], 900);
  assert.equal(r.expense[29], 100);
  const week = chartBins([{ date: "2026-10-03", reportType: "expense", reportAmount: 7 }], "2026-10-01", "2026-10-07");
  assert.equal(week.expense.length, 7);
  assert.equal(week.expense[2], 7);
});

// The ring: the slices around the circle and the slice under a touch.
const arcs = donutArcs([g("a", 50), g("b", 25), g("c", 25)]);

test("each slice is as wide as its share, one after another", () => {
  assert.deepEqual(arcs, [
    { id: "a", start: 0, end: 0.5 },
    { id: "b", start: 0.5, end: 0.75 },
    { id: "c", start: 0.75, end: 1 },
  ]);
  assert.deepEqual(donutArcs([g("a", 0)]), []);
});

test("the angle of the touch picks the slice: twelve o'clock is the start, clockwise", () => {
  assert.equal(sliceAt(arcs, 10, -80, 60, 100), "a"); // just right of twelve
  assert.equal(sliceAt(arcs, 80, 0, 60, 100), "a"); // three o'clock: a quarter
  assert.equal(sliceAt(arcs, -10, 80, 60, 100), "b"); // just left of six
  assert.equal(sliceAt(arcs, -80, -5, 60, 100), "c"); // nine o'clock and a little up
});

test("a touch off the band of the ring picks nothing", () => {
  assert.equal(sliceAt(arcs, 0, -10, 60, 100), null); // the middle
  assert.equal(sliceAt(arcs, 0, -120, 60, 100), null); // outside
  assert.equal(sliceAt([], 0, -80, 60, 100), null);
});
