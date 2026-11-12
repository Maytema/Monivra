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
  // Names of the week day of an ISO date, or of a week day number (0 is Sunday), and of a month (0–11).
  weekday(date: string | number, form?: "long" | "short" | "narrow"): string;
  monthName(index: number): string;
  // "Thu, Nov 12" / "чт, 12 нояб.".
  shortDate(date: string): string;
  // "Nov 12" / "12 нояб." (the labels of a chart axis).
  dayMonth(date: string): string;
}

// Week days and short months: built in, because the platform's dates go through a slow bridge on the
// phone's engine and every list row asks for them.
const WEEKDAYS: Record<string, Record<"long" | "short" | "narrow", string[]>> = {
  en: {
    long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    narrow: ["S", "M", "T", "W", "T", "F", "S"],
  },
  ru: {
    long: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
    short: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
    narrow: ["В", "П", "В", "С", "Ч", "П", "С"],
  },
};
const SHORT_MONTHS: Record<string, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
};
const weekdayOf = (date: string): number => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay();

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
    weekday: (date, form = "long") => (WEEKDAYS[code] ?? WEEKDAYS.en!)[form][typeof date === "number" ? ((date % 7) + 7) % 7 : weekdayOf(date)] ?? "",
    monthName: (index) => months.nominative[index] ?? "",
    shortDate: (date) => {
      const w = (WEEKDAYS[code] ?? WEEKDAYS.en!).short[weekdayOf(date)];
      const m = (SHORT_MONTHS[code] ?? SHORT_MONTHS.en!)[Number(date.slice(5, 7)) - 1];
      const d = Number(date.slice(8, 10));
      return code === "ru" ? `${w}, ${d} ${m}` : `${w}, ${m} ${d}`;
    },
    dayMonth: (date) => {
      const m = (SHORT_MONTHS[code] ?? SHORT_MONTHS.en!)[Number(date.slice(5, 7)) - 1];
      const d = Number(date.slice(8, 10));
      return code === "ru" ? `${d} ${m}` : `${m} ${d}`;
    },
  };
}
