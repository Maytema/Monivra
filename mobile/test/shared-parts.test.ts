// The shared pieces stay shared: no screen draws its own copy of a radio mark or a sheet title.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
const src = new URL("../src", import.meta.url).pathname;

test("the radio mark is drawn in one place (ui/kit.tsx RadioMark)", () => {
  const copies = sources(src).filter((f) => readFileSync(f, "utf8").includes("width: 22, height: 22, borderRadius: 11, borderWidth: 2"));
  assert.deepEqual(copies.map((f) => f.slice(src.length)), ["/ui/kit.tsx"]);
});

test("Segmented is gone and the sheet title style lives in DialogTitle only", () => {
  const all = sources(src).map((f) => [f, readFileSync(f, "utf8")] as const);
  assert.deepEqual(all.filter(([, s]) => /\bSegmented\b/.test(s)).map(([f]) => f), []);
});
