// Names, signs and the search of currencies (js/domain/currency-search.js, i18n currencyName): a currency is
// found by its code, sign, name or country, in any language of the application, and without accents.
import { CURRENCIES, type CurrencyInfo } from "../domain/currencies.ts";
import { NAMES } from "../i18n/names.ts";
import { SIGNS } from "../i18n/signs.ts";

const tableFor = (locale: string) => NAMES[locale.slice(0, 2)] ?? NAMES.en!;

const nameCache = new Map<string, string>();
export function currencyName(code: string, locale: string): string {
  const key = locale.slice(0, 2) + code;
  const cached = nameCache.get(key);
  if (cached) return cached;
  const known = tableFor(locale).currency[code];
  const name = known ? known.charAt(0).toUpperCase() + known.slice(1) : code;
  nameCache.set(key, name);
  return name;
}

// Short sign of a currency, for example "$"; the code itself when it has none.
export const currencySign = (code: string): string => SIGNS[code] ?? code;

export const plain = (text: string): string => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е");
const fieldCache = new Map<string, string[]>();
function fieldsOf(c: CurrencyInfo): string[] {
  const known = fieldCache.get(c.code);
  if (known) return known;
  const names = (locale: string): (string | undefined)[] => {
    const table = tableFor(locale);
    return [table.currency[c.code], ...c.regions.map((r) => table.region[r])];
  };
  const fields = [c.code, currencySign(c.code), ...Object.keys(NAMES).flatMap((language) => names(language))].filter((x): x is string => !!x).map(plain);
  fieldCache.set(c.code, fields);
  return fields;
}

// 0 is the best fit, null no match. Every word has to match; a code equal to the word or starting with it
// ranks before a name starting with it, and that before a word found anywhere inside.
function rank(c: CurrencyInfo, words: string[]): number | null {
  const fields = fieldsOf(c);
  let total = 0;
  for (const word of words) {
    let best: number | null = null;
    fields.forEach((field, i) => {
      let r: number | null = null;
      if (i === 0 && field === word) r = 0;
      else if (i === 0 && field.startsWith(word)) r = 1;
      else if (field.startsWith(word) || field.split(/[\s,.-]+/).some((w) => w.startsWith(word))) r = 2;
      else if (field.includes(word)) r = 3;
      if (r !== null && (best === null || r < best)) best = r;
    });
    if (best === null) return null;
    total += best;
  }
  return total;
}

export function searchCurrencies(text: string, locale: string): string[] {
  const words = plain(text).split(/\s+/).filter(Boolean);
  if (!words.length) return CURRENCIES.map((c) => c.code);
  return CURRENCIES.map((c) => [c.code, rank(c, words)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== null)
    .sort((a, b) => a[1] - b[1] || byText(sortKey(a[0], locale), sortKey(b[0], locale)))
    .map(([code]) => code);
}

// Alphabetical order of names without the platform's collation (slow on the phone): lower case, no accents,
// ё as е — the order of the Latin and Cyrillic alphabets.
const keyCache = new Map<string, string>();
export function sortKey(code: string, locale: string): string {
  const key = locale.slice(0, 2) + code;
  let value = keyCache.get(key);
  if (value === undefined) keyCache.set(key, (value = plain(currencyName(code, locale))));
  return value;
}
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
