/* Default data: settings, rates and the two ways to begin (empty or a basic set) */
import { newId } from "../core/constants.js";
import { defaultRates } from "./currencies.js";
import { isSupportedLanguage, translate } from "../i18n/index.js";

// Interface language of a new dataset: the browser language when supported.
const browserLanguage = () => {
  const code = (globalThis.navigator?.language || "en").slice(0, 2);
  return isSupportedLanguage(code) ? code : "en";
};

// Dataset without any records; only settings and rates.
export function createEmptyData() {
  return {
    schema: 1,
    accounts: [],
    categories: [],
    ops: [],
    tags: [],
    scheduled: [],
    budgets: [],
    backups: [],
    settings: {
      accent: "#a000b8",
      theme: "light",
      language: browserLanguage(),
      currency: "KGS",
      numberFormat: browserLanguage() === "ru" ? "space-comma" : "comma-dot",
      groupDigits: true,
      decimal: false,
      hideCents: false,
      currencyFirst: false,
      dateFormat: "month",
      monthStart: 1,
      weekStart: browserLanguage() === "ru" ? 1 : 0,
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
      biometrics: false,
      relock: false,
      lockDelay: 0,
      hidePreview: false,
      hiddenValues: "Hide all",
      autoBackup: false,
      autoRates: false,
      fixedRates: [],
      currencySort: "groups",
      stats: ["flow", "scheduled", "bar", "average", "donut", "categories", "tags"],
    },
    rates: defaultRates(),
  };
}

// Numeric settings are numbers; an older file may hold them as text or out of range.
function numericSettings(settings, fresh) {
  const whole = (value, from, to, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) ? Math.min(to, Math.max(from, n)) : fallback;
  };
  settings.monthStart = whole(settings.monthStart, 1, 28, fresh.monthStart);
  settings.weekStart = whole(settings.weekStart, 0, 6, fresh.weekStart);
  settings.lockDelay = whole(settings.lockDelay, 0, Infinity, fresh.lockDelay);
}

// Data of an older version or a file gets everything newer versions added: missing settings
// and the rates of currencies it did not know. Values already present are kept.
export function completeData(data) {
  const fresh = createEmptyData();
  data.settings = { ...fresh.settings, ...data.settings };
  numericSettings(data.settings, fresh.settings);
  data.rates = { ...fresh.rates, ...data.rates };
  return data;
}

const STARTER_ACCOUNTS = [
  ["Cash", "Regular", "cash", "#24b5d1"],
  ["Card", "Regular", "card", "#5067d7"],
  ["Savings", "Savings", "pig", "#8d4ed9"],
];
const STARTER_EXPENSES = [
  ["Food", "pizza", "#f57400"],
  ["Transport", "bike", "#479ee2"],
  ["Home", "home", "#45585e"],
  ["Health", "shield", "#2fb585"],
  ["Clothes", "tag", "#4945a2"],
  ["Entertainment", "play", "#7064cc"],
  ["Pets", "paw", "#b520c5"],
  ["Other", "trend", "#a5a3c8"],
];
const STARTER_INCOMES = [
  ["Salary", "briefcase", "#858585"],
  ["Bonus", "gift", "#ead447"],
  ["Other", "trend", "#9f37a9"],
];

// A new account with every field set; `fields` override the defaults.
export const blankAccount = (fields = {}) => ({
  id: newId(),
  name: "",
  type: "Regular",
  opening: 0,
  icon: "wallet",
  color: "#a000b8",
  currency: "KGS",
  goal: 0,
  limit: 0,
  include: true,
  archived: false,
  favorite: false,
  description: "",
  debt: "Owe me",
  considerExpense: false,
  considerIncome: false,
  showExpense: false,
  showIncome: false,
  ...fields,
});
// A new category with every field set; `fields` override the defaults.
export const blankCategory = (fields = {}) => ({
  id: newId(),
  name: "",
  type: "expense",
  icon: "tag",
  color: "#a5a3c8",
  currency: "KGS",
  parent: null,
  archived: false,
  ...fields,
});

// A few ordinary accounts and categories. Names follow the interface language and,
// once created, are plain records: every one can be edited or deleted.
export function createStarterData() {
  const base = createEmptyData();
  base.accounts = STARTER_ACCOUNTS.map(([name, type, icon, color]) =>
    blankAccount({ name: translate(name), type, icon, color, currency: base.settings.currency }),
  );
  const category =
    (type) =>
    ([name, icon, color]) =>
      blankCategory({ name: translate(name), type, icon, color, currency: base.settings.currency });
  base.categories = [
    ...STARTER_EXPENSES.map(category("expense")),
    ...STARTER_INCOMES.map(category("income")),
  ];
  return base;
}
