import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNumber, NUMBER_FORMATS } from "../src/domain/money.ts";
import { newestFirst } from "../src/domain/ledger.ts";
import type { Operation } from "../src/domain/types.ts";

// The former formatting through the platform (exact, but slow on the phone's engine).
const SEPARATORS: Record<string, [string, string]> = { "comma-dot": [",", "."], "dot-comma": [".", ","], "space-dot": ["\u00a0", "."], "space-comma": ["\u00a0", ","] };
const viaPlatform = (n: number, format: string, group: boolean, least: number, most = least): string => {
  const [g, d] = SEPARATORS[format]!;
  return (n / 100)
    .toLocaleString("en-US", { minimumFractionDigits: least, maximumFractionDigits: most, useGrouping: group })
    .replace("-", "−")
    .replace(/[,.]/g, (c) => (c === "," ? g : d));
};

test("amounts are formatted exactly as the platform formatted them", () => {
  const values = [0, 1, 5, 9, 10, 49, 50, 51, 99, 100, 101, 149, 150, 151, 250, 1234, 99999, 100000, 123456789, -1, -50, -150, -151, -12345678, 999999999999];
  let seed = 7;
  for (let i = 0; i < 3000; i++) {
    seed = (seed * 48271) % 2147483647;
    values.push(Math.round(((seed / 2147483647) - 0.5) * 10 ** (1 + (i % 12))));
  }
  for (const n of values)
    for (const format of NUMBER_FORMATS)
      for (const group of [true, false])
        for (const [least, most] of [[0, 0], [0, 2], [2, 2], [0, 1], [1, 1]] as const) {
          const expected = viaPlatform(n, format, group, least, most);
          const actual = formatNumber(n, format, group, least, most);
          // A negative amount that rounds to zero is shown without the minus sign.
          if (expected === "−" + actual && !/[1-9]/.test(actual)) continue;
          assert.equal(actual, expected, `${n} ${format} ${group} ${least}-${most}`);
        }
});

test("newest first: by day, then time, then id, without the platform's collation", () => {
  const op = (id: string, date: string, time?: string) => ({ id, date, time, type: "expense", amount: 1, comment: "", tags: [] }) as unknown as Operation;
  const list = [op("a", "2026-01-02"), op("b", "2026-01-03", "09:00"), op("c", "2026-01-03", "10:00"), op("d", "2026-01-03", "10:00"), op("e", "2025-12-31")];
  assert.deepEqual(list.sort(newestFirst).map((o) => o.id), ["d", "c", "b", "a", "e"]);
});
