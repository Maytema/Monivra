// The date a new operation starts with on a screen showing a period (domain/periods.ts dateForNewOperation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateForNewOperation } from "../src/domain/periods.ts";

const s = { weekStart: 1, monthStart: 1 };
const today = "2026-11-21";

test("a period holding today gives today", () => {
  assert.equal(dateForNewOperation({ mode: "month", anchor: "2026-11-05" }, s, today), today);
  assert.equal(dateForNewOperation({ mode: "week", anchor: today }, s, today), today);
  assert.equal(dateForNewOperation({ mode: "day", anchor: today }, s, today), today);
  assert.equal(dateForNewOperation({ mode: "year", anchor: "2026-01-01" }, s, today), today);
});

test("a past period gives its day nearest to today", () => {
  assert.equal(dateForNewOperation({ mode: "day", anchor: "2026-10-03" }, s, today), "2026-10-03");
  assert.equal(dateForNewOperation({ mode: "month", anchor: "2026-10-21" }, s, today), "2026-10-31");
  assert.equal(dateForNewOperation({ mode: "month", anchor: "2026-02-21" }, s, today), "2026-02-28");
  assert.equal(dateForNewOperation({ mode: "week", anchor: "2026-11-10" }, s, today), "2026-11-15");
  assert.equal(dateForNewOperation({ mode: "year", anchor: "2025-06-01" }, s, today), "2025-12-31");
  assert.equal(dateForNewOperation({ mode: "range", anchor: "2026-09-01", from: "2026-09-01", to: "2026-09-10" }, s, today), "2026-09-10");
});

test("a month starting on another day follows its own bounds", () => {
  // Months from the 10th: the month anchored on 2026-10-21 runs 2026-10-10 … 2026-11-09.
  assert.equal(dateForNewOperation({ mode: "month", anchor: "2026-10-21" }, { weekStart: 1, monthStart: 10 }, today), "2026-11-09");
});

test("a future period gives its first day (a scheduled payment); all time gives today", () => {
  assert.equal(dateForNewOperation({ mode: "month", anchor: "2026-12-21" }, s, today), "2026-12-01");
  assert.equal(dateForNewOperation({ mode: "day", anchor: "2026-11-25" }, s, today), "2026-11-25");
  assert.equal(dateForNewOperation({ mode: "week", anchor: "2026-11-30" }, s, today), "2026-11-30");
  assert.equal(dateForNewOperation({ mode: "all", anchor: today }, s, today), today);
});
