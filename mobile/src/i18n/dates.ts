// Dates in words, built in: the platform's dates go through a slow bridge on the phone's engine, and every list
// row asks for them. English and Russian, with the setting "Date format": "month" (month first in English),
// "day" (day first; Russian always puts the day first) or "iso" (2026-11-12), as js/domain/finance.js dateLabel.
export interface DateWords {
  monthYear(date: string): string;
  day(date: string, withYear?: boolean): string;
  // Names of the week day of an ISO date, or of a week day number (0 is Sunday), and of a month (0–11).
  weekday(date: string | number, form?: "long" | "short" | "narrow"): string;
  monthName(index: number): string;
  // "Nov" / "нояб." (0–11).
  shortMonth(index: number): string;
  // "Thu, Nov 12" / "чт, 12 нояб.".
  shortDate(date: string): string;
  // "Nov 12" / "12 нояб." (the labels of a chart axis).
  dayMonth(date: string): string;
  // A range of days in the compact form of the period bar: "Nov 8 – 14", "Oct 26 – Nov 1", "8–14 нояб."; the
  // year only outside the current one (js/domain/finance.js rangeLabel, which used Intl formatRange).
  range(from: string, to: string): string;
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

export function dateWords(code: string, dateFormat = "month"): DateWords {
  const months = MONTHS[code] ?? MONTHS.en!;
  const dayFirst = code === "ru" || dateFormat === "day";
  return {
    monthYear: (date) => {
      const name = months.nominative[Number(date.slice(5, 7)) - 1] ?? "";
      return `${code === "ru" ? name.charAt(0).toUpperCase() + name.slice(1) : name} ${date.slice(0, 4)}`;
    },
    day: (date, withYear = true) => {
      if (dateFormat === "iso") return date;
      const d = Number(date.slice(8, 10));
      const m = months.genitive[Number(date.slice(5, 7)) - 1] ?? "";
      const y = withYear ? ` ${date.slice(0, 4)}` : "";
      return dayFirst ? `${d} ${m}${y}` : `${m} ${d}${withYear ? "," + y : ""}`;
    },
    range: (from, to) => {
      const thisYear = String(new Date().getFullYear());
      const withYear = from.slice(0, 4) !== thisYear || to.slice(0, 4) !== thisYear;
      if (dateFormat === "iso") {
        const cut = (x: string) => (withYear ? x : x.slice(5));
        return `${cut(from)} – ${cut(to)}`;
      }
      const short = SHORT_MONTHS[code] ?? SHORT_MONTHS.en!;
      const [ya, ma, da] = [from.slice(0, 4), short[Number(from.slice(5, 7)) - 1], Number(from.slice(8, 10))];
      const [yb, mb, db] = [to.slice(0, 4), short[Number(to.slice(5, 7)) - 1], Number(to.slice(8, 10))];
      const sameYear = ya === yb;
      const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
      if (dayFirst) {
        const year = (y: string) => (code === "ru" ? ` ${y} г.` : ` ${y}`);
        const tail = withYear ? year(yb) : "";
        if (from === to) return `${da} ${ma}${tail}`;
        if (sameMonth) return `${da}${code === "ru" ? "–" : " – "}${db} ${mb}${tail}`;
        if (sameYear) return `${da} ${ma} – ${db} ${mb}${tail}`;
        return `${da} ${ma}${year(ya)} – ${db} ${mb}${year(yb)}`;
      }
      const tail = withYear ? `, ${yb}` : "";
      if (from === to) return `${ma} ${da}${tail}`;
      if (sameMonth) return `${ma} ${da} – ${db}${tail}`;
      if (sameYear) return `${ma} ${da} – ${mb} ${db}${tail}`;
      return `${ma} ${da}, ${ya} – ${mb} ${db}, ${yb}`;
    },
    weekday: (date, form = "long") => (WEEKDAYS[code] ?? WEEKDAYS.en!)[form][typeof date === "number" ? ((date % 7) + 7) % 7 : weekdayOf(date)] ?? "",
    monthName: (index) => months.nominative[index] ?? "",
    shortMonth: (index) => (SHORT_MONTHS[code] ?? SHORT_MONTHS.en!)[index] ?? "",
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
