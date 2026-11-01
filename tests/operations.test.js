import { check } from "./harness.js";
import { addAccount } from "./helpers.js";
import { TODAY } from "../js/core/constants.js";
import { appData } from "../js/core/state.js";
import { putAccountOnSide, putCategoryOnSide } from "../js/domain/sides.js";
import { accountBalance, categoryTotal, categoryTotalIn } from "../js/domain/finance.js";
import {
  applyBulkChanges,
  deleteCategory,
  nextDate,
  processScheduled,
  validateOp,
} from "../js/domain/operations.js";

// A scheduled payment of the sample data's first expense, due at `date`.
const scheduledExpense = (date, recur) => {
  const base = appData.ops.find((o) => o.type === "expense");
  const item = { ...JSON.parse(JSON.stringify(base)), id: "__due", date, recur, reminder: null };
  appData.scheduled = [item];
  return item;
};

check("Choosing on one side of an operation changes only that side", () => {
  const [a, b] = appData.accounts.filter((x) => !x.archived).map((x) => x.id);
  const op = (fields) => ({ type: "expense", from: a, to: null, category: "c1", ...fields });
  const replaced = op();
  putAccountOnSide(replaced, true, b);
  const other = op({ type: "income", from: null, to: a });
  putAccountOnSide(other, false, b);
  const toTransfer = op();
  putAccountOnSide(toTransfer, false, b);
  const flipped = op();
  putCategoryOnSide(flipped, true, "c2");
  const swapped = op({ type: "income", from: null, to: a });
  putCategoryOnSide(swapped, false, "c2");
  const sameSide = op();
  putCategoryOnSide(sameSide, false, "c2");
  return (
    replaced.type === "expense" &&
    replaced.from === b &&
    replaced.to === null &&
    replaced.category === "c1" &&
    other.type === "income" &&
    other.to === b &&
    other.category === "c1" &&
    toTransfer.type === "transfer" &&
    toTransfer.from === a &&
    toTransfer.to === b &&
    toTransfer.category === null &&
    flipped.type === "income" &&
    flipped.to === a &&
    flipped.from === null &&
    flipped.category === "c2" &&
    swapped.type === "expense" &&
    swapped.from === a &&
    swapped.to === null &&
    sameSide.type === "expense" &&
    sameSide.from === a &&
    sameSide.category === "c2"
  );
});

check("Scheduled operations do not alter current balance", () => {
  const a = appData.accounts[0];
  if (!a) return true;
  const before = accountBalance(a.id),
    scheduled = appData.scheduled;
  try {
    appData.scheduled = [
      ...scheduled,
      {
        id: "__audit_scheduled",
        type: "income",
        to: a.id,
        amount: 500000,
        date: TODAY,
        tags: [],
      },
    ];
    return accountBalance(a.id) === before;
  } finally {
    appData.scheduled = scheduled;
  }
});

check("Deleting a category removes its operations, payments and budget entries", () => {
  const base = { type: "expense", archived: false, currency: appData.settings.currency };
  appData.categories.push(
    { ...base, id: "__c1", name: "A", parent: null },
    { ...base, id: "__c2", name: "B", parent: null },
    { ...base, id: "__c3", name: "A1", parent: "__c1" },
  );
  const cash = addAccount({ opening: 100000 }),
    spend = (category) => ({
      id: "__s" + category,
      type: "expense",
      from: cash.id,
      amount: 100,
      category,
      date: TODAY,
      tags: [],
      comment: "",
    });
  appData.ops = [spend("__c1"), spend("__c3"), spend("__c2")];
  appData.scheduled = [spend("__c3")];
  appData.budgets = [
    { id: "__b1", amount: 1, categories: ["__c1", "__c3"] },
    { id: "__b2", amount: 1, categories: ["__c1", "__c2"] },
  ];
  deleteCategory("__c1");
  return (
    appData.ops.length === 1 &&
    appData.scheduled.length === 0 &&
    appData.categories.filter((c) => c.id.startsWith("__c")).length === 1 &&
    appData.budgets.length === 1 &&
    appData.budgets[0].categories.join() === "__c2"
  );
});

check(
  "An expense in a category of another currency keeps the amount typed in that currency",
  () => {
    appData.rates.USD = 100;
    appData.rates.KGS = 1;
    const account = addAccount({ opening: 100000 });
    appData.categories.push({ id: "__usd", name: "Cafe", type: "expense", currency: "USD" });
    const draft = (extra) => ({
      type: "expense",
      from: account.id,
      category: "__usd",
      amount: 5000,
      date: TODAY,
      tags: [],
      comment: "",
      ...extra,
    });
    const automatic = draft();
    validateOp(automatic);
    const typed = draft({ receive: 300, receiveManual: true });
    validateOp(typed);
    const same = draft({ categoryAmount: { currency: "USD", amount: 1 } });
    appData.categories.at(-1).currency = account.currency;
    validateOp(same);
    return (
      automatic.categoryAmount.amount === 50 &&
      typed.categoryAmount.amount === 300 &&
      typed.receive === undefined &&
      same.categoryAmount === undefined
    );
  },
);

check("A category counts what was entered in its currency, whatever the rates do later", () => {
  appData.ops = [];
  appData.rates.USD = 100;
  appData.rates.KGS = 1;
  const account = addAccount({ opening: 100000 });
  const category = {
    id: "__usd",
    name: "Cafe",
    type: "expense",
    currency: "USD",
    color: "#d04fcc",
  };
  appData.categories.push(category);
  [{}, { receive: 500, receiveManual: true }, { receive: 20, receiveManual: true }].forEach(
    (extra, i) => {
      const op = {
        id: "__e" + i,
        type: "expense",
        from: account.id,
        category: category.id,
        amount: 10000,
        date: TODAY,
        tags: [],
        comment: "",
        ...extra,
      };
      validateOp(op);
      appData.ops.push(op);
    },
  );
  const before = categoryTotalIn(category);
  appData.rates.USD = 200;
  return (
    before === 620 &&
    categoryTotalIn(category) === 620 &&
    categoryTotal("__usd", "expense") === 30000
  );
});

check(
  "Calendar month clamping",
  () =>
    nextDate({
      date: "2026-01-31",
      recur: { every: 1, unit: "Months", remaining: null },
    }) === "2026-02-28",
);

check(
  "Finite recurrence",
  () =>
    nextDate({
      date: TODAY,
      recur: { every: 1, unit: "Days", remaining: 1 },
    }) === null,
);

check("Add now posts the payment today and moves the date by the interval", () => {
  const item = scheduledExpense("2026-11-19", {
    every: 3,
    unit: "Days",
    remaining: null,
    days: [],
  });
  const count = appData.ops.length;
  const balance = accountBalance(item.from);
  processScheduled("__due", true);
  const posted = appData.ops.at(-1);
  return (
    appData.ops.length === count + 1 &&
    posted.date === TODAY &&
    posted.amount === item.amount &&
    !posted.recur &&
    accountBalance(item.from) === balance - item.amount &&
    item.date === "2026-11-22"
  );
});

check("Skip moves the date and posts nothing", () => {
  const item = scheduledExpense("2026-11-19", {
    every: 1,
    unit: "Weeks",
    remaining: 3,
    days: [],
  });
  const count = appData.ops.length;
  processScheduled("__due", false);
  return appData.ops.length === count && item.date === "2026-11-26" && item.recur.remaining === 2;
});

check("The last repetition leaves the list", () => {
  scheduledExpense("2026-11-19", { every: 1, unit: "Days", remaining: 1, days: [] });
  processScheduled("__due", true);
  return appData.scheduled.length === 0;
});

check("A weekly payment goes to the chosen days of the week", () => {
  const item = scheduledExpense("2026-12-14", {
    every: 1,
    unit: "Weeks",
    remaining: null,
    days: [1, 3],
  });
  processScheduled("__due", false);
  const first = item.date;
  processScheduled("__due", false);
  return first === "2026-12-16" && item.date === "2026-12-21";
});

check(
  "A bulk edit moves operations to another category, account and tags, and keeps adjustments",
  () => {
    appData.ops = [];
    const cash = addAccount({ opening: 100000 });
    const card = addAccount({ opening: 100000 });
    const base = { date: TODAY, comment: "", tags: ["a"] };
    const expenseCategory = appData.categories.find((c) => c.type === "expense");
    const incomeCategory = appData.categories.find((c) => c.type === "income");
    appData.ops.push(
      {
        ...base,
        id: "__e",
        type: "expense",
        from: cash.id,
        to: null,
        category: expenseCategory.id,
        amount: 100,
      },
      {
        ...base,
        id: "__t",
        type: "transfer",
        from: cash.id,
        to: card.id,
        amount: 100,
        receive: 100,
      },
      { ...base, id: "__j", type: "adjustment", from: null, to: cash.id, amount: 100 },
    );
    applyBulkChanges(["__e", "__t", "__j"], {
      category: incomeCategory.id,
      account: card.id,
      role: "receiver",
      comment: "note",
      addTags: ["b"],
      removeTags: ["a"],
      clearTags: false,
      date: null,
    });
    const [expense, move, adjust] = appData.ops;
    return (
      expense.type === "income" &&
      expense.to === card.id &&
      !expense.from &&
      expense.category === incomeCategory.id &&
      move.type === "transfer" &&
      move.to === card.id &&
      move.from === cash.id &&
      !move.category &&
      adjust.type === "adjustment" &&
      adjust.to === card.id &&
      !adjust.category &&
      [expense, move, adjust].every((o) => o.comment === "note" && o.tags.join() === "b")
    );
  },
);
