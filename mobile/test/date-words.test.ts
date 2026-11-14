// Dates in words with the "Date format" setting, against the platform's formatting that the first application
// used (Intl: dateLabel and rangeLabel of js/domain/finance.js). Spaces are compared loosely: the platform puts
// thin and narrow no-break spaces where these put plain ones.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateWords } from "../src/i18n/dates.ts";

const plain = (s: string) => s.replace(/[   ]/g, " ").replace(/ – /g, " – ");
const year = String(new Date().getFullYear());
const last = String(Number(year) - 1);
const days = [
  [`${year}-11-08`, `${year}-11-14`],
  [`${year}-10-26`, `${year}-11-01`],
  [`${last}-11-08`, `${last}-11-14`],
  [`${last}-10-26`, `${last}-11-01`],
  [`${last}-12-28`, `${year}-01-03`],
  [`${year}-03-05`, `${year}-03-05`],
];
const intlRange = (locale: string, a: string, b: string) => {
  const withYear = a.slice(0, 4) !== year || b.slice(0, 4) !== year;
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).formatRange(new Date(a + "T00:00:00Z"), new Date(b + "T00:00:00Z"));
};

test("a range of days as the first application wrote it, in English (month or day first) and Russian", () => {
  for (const [language, format, locale] of [["en", "month", "en-US"], ["en", "day", "en-GB"], ["ru", "month", "ru-RU"]] as const) {
    const t = dateWords(language, format);
    for (const [a, b] of days) assert.equal(plain(t.range(a!, b!)), plain(intlRange(locale, a!, b!)), `${locale} ${a} ${b}`);
  }
});

test("a day follows the date format: month first, day first, or as stored", () => {
  assert.equal(dateWords("en", "month").day("2026-11-12"), "November 12, 2026");
  assert.equal(dateWords("en", "day").day("2026-11-12"), "12 November 2026");
  assert.equal(dateWords("en", "iso").day("2026-11-12"), "2026-11-12");
  assert.equal(dateWords("ru", "month").day("2026-11-12"), "12 ноября 2026");
  assert.equal(dateWords("en", "iso").range(`${year}-11-08`, `${year}-11-14`), "11-08 – 11-14");
});
