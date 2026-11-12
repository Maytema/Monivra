import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHexInput, hexToOklch, isHex, parseHex, prettyShades, shadeRow } from "../src/ui/color-tools.ts";

test("HEX input: with or without #, 3 or 6 digits, any case; anything else is not a colour yet", () => {
  assert.equal(parseHex("#1F7AE0"), "#1f7ae0");
  assert.equal(parseHex("1f7ae0"), "#1f7ae0");
  assert.equal(parseHex(" abc "), "#aabbcc");
  assert.equal(parseHex("1f7ae"), null);
  assert.equal(parseHex("zz7ae0"), null);
  assert.equal(parseHex(""), null);
  assert.equal(cleanHexInput("#1F-7a e0ff"), "1f7ae0");
});

test("shades: as many as asked, light to dark, valid, distinct, the colour itself among them", () => {
  for (const color of ["#1f7ae0", "#e5322d", "#f2c200", "#22b35e", "#9b3fd1", "#666666", "#000000", "#ffffff", "#fde7f0", "#10200f"])
    for (const count of [5, 6, 7, 8]) {
      const row = prettyShades(color, count);
      assert.ok(row.length >= count - 2 && row.length <= count, `${color} ${count}: ${row.length}`);
      assert.ok(row.every(isHex), `${color}: ${row.join()}`);
      assert.equal(new Set(row).size, row.length);
      assert.ok(row.includes(color), `${color} is in ${row.join()}`);
      const lightness = row.map((c) => hexToOklch(c)[0]);
      for (let i = 1; i < lightness.length; i++) if (row[i] !== color && row[i - 1] !== color) assert.ok(lightness[i]! < lightness[i - 1]! + 1e-6, `${color}: ${row.join()}`);
    }
});

test("shades keep the hue of the colour", () => {
  const [, , hue] = hexToOklch("#1f7ae0");
  for (const c of prettyShades("#1f7ae0", 7)) assert.ok(Math.abs(hexToOklch(c)[2] - hue) < 6, c);
});

test("the row of shades fits the width", () => {
  for (const width of [320, 360, 393, 411, 480]) {
    const { count, size } = shadeRow(width);
    assert.ok(count * size + (count - 1) * 8 <= width - 40 + 0.01);
    assert.ok(size >= 34 && size <= 44);
  }
});
