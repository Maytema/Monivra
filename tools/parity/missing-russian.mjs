// Texts of the native source that look like words for the person but have no Russian translation, so the
// Russian interface would show English. A heuristic: string literals that start with a capital letter, hold
// letters and spaces only (plus simple punctuation and {placeholders}) and are not in the translation files.
// Usage (from the repository root): node tools/parity/missing-russian.mjs; it exits with 1 when something is missing,
// and test/russian.test.ts runs it, so a new English text without a translation fails the tests.
import fs from "node:fs";
import path from "node:path";

const dir = "mobile/src";
const keys = new Set([...Object.keys(JSON.parse(fs.readFileSync(`${dir}/i18n/ru.json`, "utf8"))), ...Object.keys(JSON.parse(fs.readFileSync(`${dir}/i18n/ru-mobile.json`, "utf8")))]);
// Words that are the same in both languages.
const SAME = new Set(["Monivra"]);
const found = new Map();
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.tsx?$/.test(e.name)) {
      const code = fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of code.matchAll(/(?<![\w$.])(["'])([A-Z][^"'\n\\]{2,200}?)\1/g)) {
        const text = m[2];
        if (!/[a-z]/.test(text) || /^[A-Z][A-Za-z0-9]*$/.test(text) && !/^[A-Z][a-z]+$/.test(text)) continue;
        if (!/^[A-Za-z0-9 ,.:;!?'’“”"()\-–—{}%+/&·…→←↑↓=]+$/.test(text)) continue;
        if (/^[MLHVCSQTAZmlhvcsqtaz] ?-?\d/.test(text)) continue; // an SVG path
        if (keys.has(text) || SAME.has(text)) continue;
        if (!found.has(text)) found.set(text, new Set());
        found.get(text).add(f.replace(`${dir}/`, ""));
      }
    }
  }
};
// Only the screens: the other layers hold names and data that are translated elsewhere.
for (const sub of ["features", "ui", "app"]) walk(`${dir}/${sub}`);
const list = [...found].sort((a, b) => a[0].localeCompare(b[0]));
for (const [text, files] of list) console.log(`${text}  [${[...files].join(", ")}]`);
console.error(`${list.length} candidates`);
if (list.length) process.exitCode = 1;
