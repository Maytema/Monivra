// Copies the Russian strings of the first application (js/i18n/ru.js, keyed by English text) into
// src/i18n/ru.json. Strings that only this application uses live in src/i18n/ru-mobile.json.
// Run from mobile/: node scripts/convert-strings.mjs
import { writeFile } from "node:fs/promises";
const { russianStrings } = await import(new URL("../../js/i18n/ru.js", import.meta.url));
const sorted = Object.fromEntries(Object.entries(russianStrings).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(new URL("../src/i18n/ru.json", import.meta.url), JSON.stringify(sorted, null, 1) + "\n");
console.log(Object.keys(sorted).length, "strings");
