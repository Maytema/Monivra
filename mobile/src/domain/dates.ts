// Calendar days as "YYYY-MM-DD" and times as "HH:MM". Arithmetic happens at noon UTC so that daylight
// saving never moves a day. The current moment is always passed in (a `Clock`), never read here.
import type { LocalDate, LocalTime } from "./types.ts";

export interface Clock {
  today(): LocalDate;
  time(): LocalTime;
  nowIso(): string;
}

export const parseDate = (s: LocalDate): Date => new Date(s + "T12:00:00Z");
export const toIsoDate = (d: Date): LocalDate => d.toISOString().slice(0, 10);

export const addDays = (s: LocalDate, n: number): LocalDate => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
};

// A calendar date "YYYY-MM-DD" that exists (the 30th of February does not). Plain arithmetic, not the engine's
// date parsing: it runs for every operation when a data file is checked, and dates are slow on the phone's
// engine. The same answers as parsing it (proleptic Gregorian calendar, years 0000–9999).
export const isValidDate = (s: unknown): s is LocalDate => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);
};

export const isValidTime = (s: unknown): s is LocalTime =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// The date `months` months after `date`, on `day` of the month or the month's last day.
export function addMonths(date: LocalDate, months: number, day = parseDate(date).getUTCDate()): LocalDate {
  const base = parseDate(date);
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1, 12));
  d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
  return toIsoDate(d);
}

// A clock of the device: local day and time.
export const systemClock: Clock = {
  today: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  time: () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  },
  nowIso: () => new Date().toISOString(),
};

// A clock that always says the same moment (tests, previews).
export const fixedClock = (day: LocalDate, time: LocalTime = "12:00"): Clock => ({
  today: () => day,
  time: () => time,
  nowIso: () => `${day}T${time}:00.000Z`,
});
