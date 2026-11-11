// Names, signs and the search of currencies (js/domain/currency-search.js, i18n currencyName): a currency is
// found by its code, sign, name or country, in any language of the application, and without accents.
import { CURRENCIES, type CurrencyInfo } from "../domain/currencies.ts";
import { LANGUAGES } from "../i18n/index.ts";

export function currencyName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : code;
  } catch {
    return code;
  }
}

const signCache = new Map<string, string>();
// Short sign of a currency, for example "$"; the code itself when it has none.
export function currencySign(code: string): string {
  const known = signCache.get(code);
  if (known !== undefined) return known;
  let sign = code;
  try {
    sign = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).formatToParts(1).find((p) => p.type === "currency")?.value || code;
  } catch {
    // The code stands for the sign.
  }
  signCache.set(code, sign);
  return sign;
}

const plain = (text: string): string => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е");
const fieldCache = new Map<string, string[]>();
function fieldsOf(c: CurrencyInfo): string[] {
  const known = fieldCache.get(c.code);
  if (known) return known;
  const names = (locale: string): (string | undefined)[] => {
    try {
      const regions = new Intl.DisplayNames([locale], { type: "region" });
      return [new Intl.DisplayNames([locale], { type: "currency" }).of(c.code), ...c.regions.map((r) => regions.of(r))];
    } catch {
      return [];
    }
  };
  const fields = [c.code, currencySign(c.code), ...LANGUAGES.flatMap((l) => names(l.locale))].filter((x): x is string => !!x).map(plain);
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
  const collator = new Intl.Collator(locale);
  return CURRENCIES.map((c) => [c.code, rank(c, words)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== null)
    .sort((a, b) => a[1] - b[1] || collator.compare(currencyName(a[0], locale), currencyName(b[0], locale)))
    .map(([code]) => code);
}
