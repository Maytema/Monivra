// Records of a ledger. Field names follow the data file of the first application (format v1), so a
// file written by either application reads back unchanged. Money is an integer of hundredths
// ("minor units") for every currency; dates are local calendar days "YYYY-MM-DD", times "HH:MM".

export type Minor = number;
export type LocalDate = string;
export type LocalTime = string;

export type AccountType = "Regular" | "Savings" | "Debt";
export type DebtDirection = "Owe me" | "I owe";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  opening: Minor;
  icon: string;
  color: string;
  currency: string;
  goal: Minor;
  limit: Minor;
  include: boolean;
  archived: boolean;
  favorite: boolean;
  description: string;
  debt: DebtDirection;
  totalDebt?: Minor;
  considerExpense: boolean;
  considerIncome: boolean;
  showExpense: boolean;
  showIncome: boolean;
}

export type CategoryType = "income" | "expense";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  currency: string;
  parent: string | null;
  archived: boolean;
}

export type OperationType = "income" | "expense" | "transfer" | "adjustment";

// A tax or a commission: a percent of the amount, or a fixed value in major units (as in format v1).
export interface Fee {
  kind: "tax" | "commission";
  percent?: number;
  value?: number;
  add?: boolean;
}

// Which scheduled payment and which of its occurrences an operation settles.
export interface ScheduleLink {
  id: string;
  date: LocalDate;
  postedAt?: string;
  byHand?: boolean;
}

export interface Operation {
  id: string;
  type: OperationType;
  amount: Minor;
  date: LocalDate;
  time?: LocalTime;
  from?: string | null;
  to?: string | null;
  // What the receiving side got: a transfer's destination, an income with fees, a cross-currency
  // adjustment. Stored once; it is a fact, not something re-derived from today's rate.
  receive?: Minor;
  // The person typed the second amount (only meaningful in a draft or a scheduled payment).
  receiveManual?: boolean;
  category?: string;
  // The amount in the category's currency when it differs from the account's.
  categoryAmount?: { currency: string; amount: Minor };
  fees?: Fee[];
  comment: string;
  tags: string[];
  photos?: string[];
  fromSchedule?: ScheduleLink;
  // The amount before an account's currency was changed with recalculation.
  recalculated?: { amount: Minor; currency: string };
}

export type IntervalUnit = "Days" | "Weeks" | "Months" | "Years";

export interface Recurrence {
  every: number;
  unit: IntervalUnit;
  days: number[];
  remaining: number | null;
}

export interface Reminder {
  before: number;
  unit: IntervalUnit;
  time: LocalTime;
}

export interface ScheduledPayment extends Operation {
  recur: Recurrence | null;
  reminder: Reminder | null;
  anchorDay?: number;
}

export type BudgetPeriod = "day" | "week" | "month" | "year";

export interface Budget {
  id: string;
  name: string;
  amount: Minor;
  currency: string;
  period: BudgetPeriod;
  categories: string[] | null;
}

// Settings of format v1. Unknown keys are kept as they are.
export interface Settings {
  accent: string;
  theme: "light" | "dark" | "system";
  language: string;
  currency: string;
  numberFormat: string;
  groupDigits: boolean;
  decimal: boolean;
  hideCents: boolean;
  currencyFirst: boolean;
  dateFormat: string;
  monthStart: number;
  weekStart: number;
  navLabels: string;
  bigAccounts: boolean;
  oneColumn: boolean;
  onePicker: boolean;
  subcategories: boolean;
  reverseKeys: boolean;
  opening: boolean;
  notifications: boolean;
  periodic: boolean;
  notificationTime: LocalTime;
  notificationFrequency: string;
  pin: unknown;
  relock: boolean;
  lockDelay: number;
  hidePreview: boolean;
  biometric: boolean;
  hiddenValues: string;
  hidden?: boolean;
  autoBackup: boolean;
  autoRates: boolean;
  fixedRates: string[];
  currencySort: string;
  stats: string[];
  totalCurrency?: Record<string, string>;
  dismissedHints?: string[];
  [key: string]: unknown;
}

// Exchange rates: how many KGS one unit of a currency is worth (format v1).
export type Rates = Record<string, number>;

export interface LedgerData {
  schema: 1;
  accounts: Account[];
  categories: Category[];
  ops: Operation[];
  tags: string[];
  scheduled: ScheduledPayment[];
  budgets: Budget[];
  backups: unknown[];
  settings: Settings;
  rates: Rates;
}
