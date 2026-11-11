// Translation: English text is the key (as in the first application), Russian comes from ru.json
// (the first application's strings) and ru-mobile.json (strings only this application has).
import ruShared from "./ru.json";
import ruMobile from "./ru-mobile.json";

type Table = Record<string, string | string[]>;
const TABLES: Record<string, Table> = { en: {}, ru: { ...(ruShared as Table), ...(ruMobile as Table) } };
export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-US" },
  { code: "ru", name: "Русский", locale: "ru-RU" },
] as const;

export interface Translator {
  language: string;
  locale: string;
  t(text: string, values?: Record<string, string | number>): string;
  tc(one: string, other: string, n: number): string;
  monthYear(date: string): string;
  day(date: string, withYear?: boolean): string;
}

const MONTHS: Record<string, { nominative: string[]; genitive: string[] }> = {
  en: {
    nominative: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    genitive: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  ru: {
    nominative: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
    genitive: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
};

// Plural category for English and Russian without depending on Intl.PluralRules.
function pluralIndex(language: string, n: number): number {
  if (language !== "ru") return n === 1 ? 0 : 3;
  const a = Math.abs(n) % 100,
    b = a % 10;
  if (b === 1 && a !== 11) return 0;
  if (b >= 2 && b <= 4 && (a < 12 || a > 14)) return 1;
  return 2;
}

export function translator(language: string): Translator {
  const code = TABLES[language] ? language : "en";
  const table = TABLES[code] ?? {};
  const locale = LANGUAGES.find((l) => l.code === code)?.locale ?? "en-US";
  const months = MONTHS[code] ?? MONTHS.en!;
  const fill = (text: string, values?: Record<string, string | number>) =>
    values ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(values[name] ?? m)) : text;
  return {
    language: code,
    locale,
    t: (text, values) => {
      const value = table[text];
      return fill(typeof value === "string" ? value : text, values);
    },
    tc: (one, other, n) => {
      const forms = table[other];
      const i = pluralIndex(code, n);
      const text = Array.isArray(forms) ? (forms[Math.min(i, forms.length - 1)] ?? other) : i === 0 ? one : other;
      return text.replace("{n}", String(n));
    },
    monthYear: (date) => {
      const name = months.nominative[Number(date.slice(5, 7)) - 1] ?? "";
      return `${code === "ru" ? name.charAt(0).toUpperCase() + name.slice(1) : name} ${date.slice(0, 4)}`;
    },
    day: (date, withYear = true) => {
      const d = Number(date.slice(8, 10));
      const m = months.genitive[Number(date.slice(5, 7)) - 1] ?? "";
      const y = withYear ? ` ${date.slice(0, 4)}` : "";
      return code === "ru" ? `${d} ${m}${y}` : `${m} ${d}${withYear ? "," + y : ""}`;
    },
  };
}
