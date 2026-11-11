// The data file (format v1): the format of the first application's backups and of its stored data.
// It is how existing data moves into this application, and what this application exports, so either
// application can read the other's file. A file chosen by the person is untrusted input.
import { blankAccount } from "./accounts.ts";
import { blankCategory } from "./categories.ts";
import { defaultRates } from "./currencies.ts";
import { isValidDate, isValidTime } from "./dates.ts";
import type { Account, LedgerData, Operation, ScheduledPayment, Settings } from "./types.ts";

export const SUPPORTED_LANGUAGES = ["en", "ru"];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NODES = 4_000_000;
const MAX_DEPTH = 12;
const MAX_INTERVAL = 365;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const KNOWN_KEYS = ["schema", "accounts", "categories", "ops", "tags", "scheduled", "budgets", "backups", "settings", "rates"] as const;

export function defaultSettings(language: string): Settings {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  return {
    accent: "#a000b8",
    theme: "light",
    language: lang,
    currency: "KGS",
    numberFormat: lang === "ru" ? "space-comma" : "comma-dot",
    groupDigits: true,
    decimal: false,
    hideCents: false,
    currencyFirst: false,
    dateFormat: "month",
    monthStart: 1,
    weekStart: lang === "ru" ? 1 : 0,
    navLabels: "always",
    bigAccounts: false,
    oneColumn: false,
    onePicker: false,
    subcategories: true,
    reverseKeys: false,
    opening: true,
    notifications: false,
    periodic: false,
    notificationTime: "20:00",
    notificationFrequency: "Every day",
    pin: false,
    relock: false,
    lockDelay: 0,
    hidePreview: false,
    biometric: false,
    hiddenValues: "Hide all",
    autoBackup: false,
    autoRates: false,
    fixedRates: [],
    currencySort: "groups",
    stats: ["flow", "scheduled", "bar", "average", "donut", "categories", "tags"],
  };
}

export const createEmptyData = (language: string): LedgerData => ({
  schema: 1,
  accounts: [],
  categories: [],
  ops: [],
  tags: [],
  scheduled: [],
  budgets: [],
  backups: [],
  settings: defaultSettings(language),
  rates: defaultRates(),
});

const STARTER_ACCOUNTS: [string, Account["type"], string, string][] = [
  ["Cash", "Regular", "cash", "#24b5d1"],
  ["Card", "Regular", "card", "#5067d7"],
  ["Savings", "Savings", "pig", "#8d4ed9"],
];
const STARTER_EXPENSES: [string, string, string][] = [
  ["Food", "pizza", "#f57400"],
  ["Transport", "bike", "#479ee2"],
  ["Home", "home", "#45585e"],
  ["Health", "shield", "#2fb585"],
  ["Clothes", "tag", "#4945a2"],
  ["Entertainment", "play", "#7064cc"],
  ["Pets", "paw", "#b520c5"],
  ["Other", "trend", "#a5a3c8"],
];
const STARTER_INCOMES: [string, string, string][] = [
  ["Salary", "briefcase", "#858585"],
  ["Bonus", "gift", "#ead447"],
  ["Other", "trend", "#9f37a9"],
];

// A few ordinary accounts and categories named in the interface language.
export function createStarterData(language: string, translate: (s: string) => string, newId: () => string): LedgerData {
  const base = createEmptyData(language);
  const currency = base.settings.currency;
  base.accounts = STARTER_ACCOUNTS.map(([name, type, icon, color]) => blankAccount({ id: newId(), name: translate(name), type, icon, color, currency }));
  base.categories = [
    ...STARTER_EXPENSES.map(([name, icon, color]) => blankCategory({ id: newId(), name: translate(name), type: "expense", icon, color, currency })),
    ...STARTER_INCOMES.map(([name, icon, color]) => blankCategory({ id: newId(), name: translate(name), type: "income", icon, color, currency })),
  ];
  return base;
}

// ---- Validation (port of findDataProblem) ------------------------------------------------------

export interface DataProblem {
  what: string;
  number: number | string;
  reason: string;
}

const COLOR = /^#[a-f0-9]{6}$/i;
type Loose = Record<string, unknown>;
const isObject = (x: unknown): x is Loose => !!x && typeof x === "object" && !Array.isArray(x);
const problem = (what: string, number: number | string, reason: string): DataProblem => ({ what, number, reason });

function operationProblem(o: Loose, accountIds: Set<string>, categories: Map<string, Loose>, seen: Set<string>): string | null {
  if (typeof o.id !== "string" || seen.has(o.id)) return "it has no unique id";
  if (!["income", "expense", "transfer", "adjustment"].includes(o.type as string)) return "unknown type";
  if (!Number.isSafeInteger(o.amount) || (o.amount as number) <= 0) return "the amount must be greater than zero";
  if (!isValidDate(o.date)) return "the date is not valid";
  if (!Array.isArray(o.tags) || o.tags.some((t) => typeof t !== "string")) return "tags are not valid";
  if (typeof o.comment !== "string") return "the comment is not valid";
  const from = o.from as string | null | undefined,
    to = o.to as string | null | undefined;
  if (o.type === "adjustment") {
    if (!accountIds.has((from || to) ?? "") || !!from === !!to) return "the account is not found";
  } else if (o.type === "transfer") {
    if (!accountIds.has(from ?? "") || !accountIds.has(to ?? "")) return "the account is not found";
    if (from === to) return "a transfer needs two different accounts";
    if (!Number.isSafeInteger(o.receive) || (o.receive as number) <= 0) return "the received amount must be greater than zero";
  } else {
    if ((o.type === "expense" && to) || (o.type === "income" && from)) return "the account does not fit the type";
    if (!accountIds.has((o.type === "expense" ? from : to) ?? "")) return "the account is not found";
    const category = categories.get(o.category as string);
    if (!category) return "the category is not found";
    if (category.type !== o.type) return "the category does not fit the type";
  }
  const validPhoto = (v: unknown) => typeof v === "string" && /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(v);
  if (o.photo && !validPhoto(o.photo)) return "the photo is not valid";
  if (o.photos && (!Array.isArray(o.photos) || !o.photos.every(validPhoto))) return "the photos are not valid";
  const r = o.recur as Loose | null | undefined;
  if (
    r &&
    (!Number.isInteger(r.every) ||
      (r.every as number) < 1 ||
      (r.every as number) > MAX_INTERVAL ||
      !["Days", "Weeks", "Months", "Years"].includes(r.unit as string) ||
      (r.remaining !== null && (!Number.isInteger(r.remaining) || (r.remaining as number) < 1)) ||
      !Array.isArray(r.days) ||
      r.days.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
  )
    return "the repeat setting is not valid";
  if (o.time !== undefined && !isValidTime(o.time)) return "the time is not valid";
  if (o.anchorDay !== undefined && !(Number.isInteger(o.anchorDay) && (o.anchorDay as number) >= 1 && (o.anchorDay as number) <= 31))
    return "the day of the repeat is not valid";
  const link = o.fromSchedule as Loose | undefined;
  if (link && (typeof link.id !== "string" || !isValidDate(link.date))) return "the scheduled payment it came from is not valid";
  return null;
}

// The first problem of a dataset, or null when it is valid.
export function findDataProblem(x: unknown): DataProblem | null {
  if (!isObject(x)) return problem("File", 0, "this is not a backup of this application");
  if (x.schema !== 1) return problem("File", 0, "this is not a backup of this application or its version is not supported");
  for (const section of ["accounts", "categories", "ops", "tags", "scheduled", "budgets", "backups"])
    if (!Array.isArray(x[section])) return problem("Section", section, "the section is missing or damaged");
  const st = x.settings,
    rates = x.rates;
  if (!isObject(st) || !isObject(rates)) return problem("Section", 0, "settings or exchange rates are missing");
  const knownRate = (code: unknown) => typeof code === "string" && Number.isFinite(rates[code]) && (rates[code] as number) > 0;
  if (!COLOR.test(String(st.accent)) || !["light", "dark", "system"].includes(st.theme as string) || !Array.isArray(st.stats))
    return problem("Section", 0, "settings are damaged");
  if (!SUPPORTED_LANGUAGES.includes(st.language as string)) return problem("Section", 0, "the language is not supported");
  if (!knownRate(st.currency)) return problem("Section", 0, "the main currency has no exchange rate");
  const accounts = x.accounts as unknown[];
  const accountIds = new Set<string>();
  for (const [i, a] of accounts.entries()) {
    if (!isObject(a) || typeof a.id !== "string" || accountIds.has(a.id)) return problem("Account", i + 1, "it has no unique id");
    accountIds.add(a.id);
  }
  for (const [i, a] of (accounts as Loose[]).entries()) {
    const bad = (reason: string) => problem("Account", i + 1, reason);
    if (typeof a.name !== "string" || !a.name.trim()) return bad("the name is empty");
    if (!["Regular", "Savings", "Debt"].includes(a.type as string)) return bad("unknown type");
    if (!Number.isSafeInteger(a.opening)) return bad("the opening balance is not a number");
    if (!knownRate(a.currency)) return bad("the currency is unknown");
    if (!COLOR.test(String(a.color))) return bad("the color is not valid");
  }
  const categories = new Map<string, Loose>();
  for (const [i, c] of (x.categories as unknown[]).entries()) {
    const bad = (reason: string) => problem("Category", i + 1, reason);
    if (!isObject(c) || typeof c.id !== "string" || categories.has(c.id)) return bad("it has no unique id");
    if (typeof c.name !== "string" || !c.name.trim()) return bad("the name is empty");
    if (!["income", "expense"].includes(c.type as string)) return bad("unknown type");
    if (!COLOR.test(String(c.color))) return bad("the color is not valid");
    if (!knownRate(c.currency)) return bad("the currency is unknown");
    categories.set(c.id, c);
  }
  for (const [i, c] of (x.categories as Loose[]).entries()) {
    if (!c.parent) continue;
    const parent = categories.get(c.parent as string);
    if (!parent || parent.parent || parent.id === c.id || parent.type !== c.type) return problem("Category", i + 1, "the parent category is not valid");
  }
  const seen = new Set<string>();
  for (const [list, what] of [
    [x.ops, "Operation"],
    [x.scheduled, "Scheduled payment"],
  ] as const)
    for (const [i, o] of (list as unknown[]).entries()) {
      const reason = operationProblem(isObject(o) ? o : {}, accountIds, categories, seen);
      if (reason) return problem(what, i + 1, reason);
      seen.add((o as Loose).id as string);
    }
  for (const [i, b] of (x.budgets as unknown[]).entries()) {
    const bad = (reason: string) => problem("Budget", i + 1, reason);
    if (!isObject(b) || typeof b.name !== "string") return bad("the name is empty");
    if (!Number.isSafeInteger(b.amount) || (b.amount as number) <= 0) return bad("the amount must be greater than zero");
    if (!knownRate(b.currency)) return bad("the currency is unknown");
    if (!["day", "week", "month", "year"].includes(b.period as string)) return bad("the period is not valid");
    if (
      b.categories !== null &&
      (!Array.isArray(b.categories) || !b.categories.length || b.categories.some((id) => !categories.has(id as string)))
    )
      return bad("a category is not found");
  }
  return null;
}

// Fills in what newer versions added and migrates old shapes (port of completeData). The PIN is not
// carried over: a file never holds the digits, and the Android verifier stays in the old phone's
// keystore, so the person sets a PIN again in this application.
export function completeData(raw: Loose, language: string): LedgerData {
  const fresh = createEmptyData(language);
  const settings = { ...fresh.settings, ...(raw.settings as Loose) } as Settings;
  const whole = (value: unknown, from: number, to: number, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) ? Math.min(to, Math.max(from, n)) : fallback;
  };
  settings.monthStart = whole(settings.monthStart, 1, 28, fresh.settings.monthStart);
  settings.weekStart = whole(settings.weekStart, 0, 6, fresh.settings.weekStart);
  settings.lockDelay = whole(settings.lockDelay, 0, Infinity, fresh.settings.lockDelay);
  settings.pin = false;
  settings.biometric = false;
  if (!Array.isArray(settings.fixedRates)) settings.fixedRates = [];
  const data = { ...(raw as unknown as LedgerData), settings, rates: { ...fresh.rates, ...(raw.rates as Loose) } as LedgerData["rates"] };
  const photosOf = <T extends Operation>(o: T): T => {
    const copy = { ...o } as T & { photo?: string };
    if (copy.photo) copy.photos = [copy.photo];
    delete copy.photo;
    return copy;
  };
  data.ops = (data.ops ?? []).map(photosOf);
  data.scheduled = (data.scheduled ?? []).map((item) => {
    const copy = photosOf(item) as ScheduledPayment & { reminderLead?: unknown };
    if (typeof copy.reminder === "string") copy.reminder = { before: 0, unit: "Days", time: copy.reminder };
    if (copy.reminder === undefined) copy.reminder = null;
    if (copy.recur === undefined) copy.recur = null;
    delete copy.reminderLead;
    return copy;
  });
  data.tags = [...new Set((data.tags ?? []).filter((t) => typeof t === "string"))];
  data.backups = [];
  for (const key of Object.keys(data)) if (!(KNOWN_KEYS as readonly string[]).includes(key)) delete (data as unknown as Loose)[key];
  return data;
}

// Throws when the parsed file is too big, nests too deep, or has names that reach prototypes.
function checkShape(root: unknown): void {
  let nodes = 0;
  const walk = (value: unknown, depth: number) => {
    if (value === null || typeof value !== "object") return;
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new FileProblem("The file is too large or too deeply nested to be a backup.");
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new FileProblem("The file contains names that a backup never has.");
      walk((value as Loose)[key], depth + 1);
    }
  };
  walk(root, 0);
}

export class FileProblem extends Error {
  problem: DataProblem | null;
  constructor(message: string, found: DataProblem | null = null) {
    super(message);
    this.name = "FileProblem";
    this.problem = found;
  }
}

export interface DataFileMeta {
  app?: string;
  build?: string;
  exportedAt?: string;
}

// Reads a data file: parse, untrusted-input checks, validation, completion. Throws FileProblem.
export function readDataFile(text: string, language: string): { data: LedgerData; meta: DataFileMeta } {
  if (text.length > MAX_FILE_BYTES) throw new FileProblem("The file is too large or too deeply nested to be a backup.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FileProblem("The file is damaged or is not a JSON file.");
  }
  checkShape(parsed);
  const found = findDataProblem(parsed);
  if (found) throw new FileProblem("This file cannot be used.", found);
  const raw = parsed as Loose;
  const meta = isObject(raw.meta) ? (raw.meta as DataFileMeta) : {};
  return { data: completeData(raw, language), meta };
}

// The text of a data file: everything recorded, without inner backups, plus a description.
export function writeDataFile(data: LedgerData, meta: DataFileMeta): string {
  const snapshot: Loose = {};
  for (const key of KNOWN_KEYS) snapshot[key] = key === "backups" ? [] : data[key];
  return JSON.stringify({ ...snapshot, meta }, null, 2);
}
