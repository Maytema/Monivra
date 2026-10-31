/* Currency search: finds a currency by its code, sign, name or country as the text is typed. */
import { CURRENCIES, currencySymbol } from "../data/currencies.js";
import { LANGUAGES, currencyName, currentLocale } from "../i18n/index.js";

// Lower case, without accents and with "ё" written as "е", so typing is forgiving.
const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е");
const LANGUAGE_CODES = LANGUAGES.map((l) => l.locale);
const searchCache = new Map();
// Text fields of a currency that a search looks at: code, sign, name and countries in every
// language of the application, so a name is found in whichever language it is typed.
function searchFields(c) {
  if (!searchCache.has(c.code)) {
    const names = (loc) => {
      try {
        const regions = new Intl.DisplayNames([loc], { type: "region" });
        return [
          new Intl.DisplayNames([loc], { type: "currency" }).of(c.code),
          ...c.regions.map((r) => regions.of(r)),
        ];
      } catch {
        return [];
      }
    };
    searchCache.set(
      c.code,
      [c.code, currencySymbol(c.code), ...LANGUAGE_CODES.flatMap(names)].filter(Boolean).map(plain),
    );
  }
  return searchCache.get(c.code);
}
// How well a currency fits the typed text: 0 is the best, null means no match. Every word typed
// has to match; a code that is the word or starts with it ranks before a name that starts with it,
// and that before a word found anywhere inside.
function matchRank(c, words) {
  const fields = searchFields(c);
  let total = 0;
  for (const word of words) {
    let best = null;
    fields.forEach((field, i) => {
      let rank = null;
      if (i === 0 && field === word) rank = 0;
      else if (i === 0 && field.startsWith(word)) rank = 1;
      else if (field.startsWith(word) || field.split(/[\s,.-]+/).some((w) => w.startsWith(word)))
        rank = 2;
      else if (field.includes(word)) rank = 3;
      if (rank !== null && (best === null || rank < best)) best = rank;
    });
    if (best === null) return null;
    total += best;
  }
  return total;
}
// Currencies matching the typed text, best matches first.
export function searchCurrencies(text) {
  const words = plain(text).split(/\s+/).filter(Boolean);
  if (!words.length) return CURRENCIES.map((c) => c.code);
  const collator = new Intl.Collator(currentLocale());
  return CURRENCIES.map((c) => [c.code, matchRank(c, words)])
    .filter(([, rank]) => rank !== null)
    .sort(
      (a, b) => a[1] - b[1] || collator.compare(currencyName(a[0], a[0]), currencyName(b[0], b[0])),
    )
    .map(([code]) => code);
}
