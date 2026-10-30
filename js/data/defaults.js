/* Default data: settings, rates and the two ways to begin (empty or a basic set) */
import { newId } from "../core/constants.js";
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
      groupDigits: true,
      decimal: false,
      hideCents: true,
      currencyFirst: false,
      dateFormat: "month",
      monthStart: 1,
      weekStart: 0,
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
      stats: ["flow", "scheduled", "bar", "average", "donut", "categories", "tags"],
    },
    rates: {
      KGS: 1,
      USD: 87.5,
      EUR: 98,
      RUB: 1.05,
      TJS: 8.2,
      KZT: 0.18,
      CNY: 12.2,
      GBP: 117,
      AUD: 57,
      CAD: 63,
      JPY: 0.59,
      CHF: 105,
    },
  };
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

// A few ordinary accounts and categories. Names follow the interface language and,
// once created, are plain records: every one can be edited or deleted.
export function createStarterData() {
  const base = createEmptyData();
  base.accounts = STARTER_ACCOUNTS.map(([name, type, icon, color]) => ({
    id: newId(),
    name: translate(name),
    type,
    opening: 0,
    icon,
    color,
    currency: base.settings.currency,
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
  }));
  const category =
    (type) =>
    ([name, icon, color]) => ({
      id: newId(),
      name: translate(name),
      type,
      icon,
      color,
      currency: base.settings.currency,
      parent: null,
      archived: false,
    });
  base.categories = [
    ...STARTER_EXPENSES.map(category("expense")),
    ...STARTER_INCOMES.map(category("income")),
  ];
  return base;
}
