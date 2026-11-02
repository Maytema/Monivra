import { check } from "./harness.js";
import { addAccount } from "./helpers.js";
import { deepClone, TODAY } from "../js/core/constants.js";
import { appData, emptyFilters, forgetDeleted, uiState } from "../js/core/state.js";
import { deleteAccount } from "../js/domain/accounts.js";
import { putAccountOnSide, putCategoryOnSide } from "../js/domain/sides.js";
import {
  accountBalance,
  addDays,
  categoryFamily,
  categoryTotal,
  categoryTotalIn,
  periodAround,
  periodBounds,
  canShiftPeriod,
  operationMatchesFilters,
  shiftPeriod,
} from "../js/domain/finance.js";
import {
  applyBulkChanges,
  emptyBulkChanges,
  isFarDate,
  putOperation,
  validateOp,
} from "../js/domain/operations.js";
import { deleteCategory, storeCategory } from "../js/domain/categories.js";
import { budgetOperations, budgetState } from "../js/domain/budgets.js";
import {
  missedPayments,
  nextDate,
  comesAfterPayment,
  postDue,
  reminderForTime,
  processScheduled,
  settleMissed,
} from "../js/domain/scheduled.js";

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

check("Payments that came due are posted on the day they were due", () => {
  const item = scheduledExpense(addDays(TODAY, -2), {
    every: 1,
    unit: "Days",
    remaining: 5,
    days: [],
  });
  const count = appData.ops.length;
  const posted = postDue();
  const days = appData.ops.slice(count).map((o) => o.date);
  return (
    posted.length === 3 &&
    days.join() === [-2, -1, 0].map((n) => addDays(TODAY, n)).join() &&
    item.date === addDays(TODAY, 1) &&
    item.recur.remaining === 2 &&
    postDue().length === 0
  );
});

check("A one-time payment that came due is posted once and leaves the list", () => {
  scheduledExpense(addDays(TODAY, -1), null);
  const count = appData.ops.length;
  return (
    postDue().length === 1 &&
    appData.ops.length === count + 1 &&
    appData.scheduled.length === 0 &&
    postDue().length === 0
  );
});

check("A payment that is not due yet stays untouched", () => {
  const later = addDays(TODAY, 3);
  const item = scheduledExpense(later, { every: 1, unit: "Days", remaining: null, days: [] });
  const count = appData.ops.length;
  return postDue().length === 0 && appData.ops.length === count && item.date === later;
});

check(
  "A payment added ahead of time says it was added by hand, one made on its day does not",
  () => {
    const ahead = scheduledExpense(addDays(TODAY, 3), null);
    processScheduled(ahead.id, true);
    const byHand = appData.ops.at(-1).fromSchedule;
    scheduledExpense(addDays(TODAY, -1), null);
    postDue();
    const onItsDay = appData.ops.at(-1).fromSchedule;
    return byHand.byHand === true && byHand.date === addDays(TODAY, 3) && !onItsDay.byHand;
  },
);

check("A posted payment remembers which payment and occurrence it came from", () => {
  const item = scheduledExpense(addDays(TODAY, -1), null);
  postDue();
  const posted = appData.ops.at(-1);
  return (
    posted.fromSchedule.id === item.id &&
    posted.fromSchedule.date === item.date &&
    posted.date === item.date &&
    !posted.recur
  );
});

check(
  "A payment far behind waits for an answer; adding posts what was missed, skipping posts none",
  () => {
    const daily = { every: 1, unit: "Days", remaining: null, days: [] };
    const item = scheduledExpense(addDays(TODAY, -40), daily);
    const before = appData.ops.length;
    const posted = postDue();
    const waiting = missedPayments();
    const kept =
      waiting.length === 1 && waiting[0].count === 41 && item.date === addDays(TODAY, -40);
    const added = settleMissed(item.id, true);
    const afterAdd = appData.ops.length - before;
    const next = item.date;
    const again = scheduledExpense(addDays(TODAY, -40), daily);
    const count = appData.ops.length;
    const skipped = settleMissed(again.id, false);
    return (
      posted.length === 0 &&
      kept &&
      added.length === 41 &&
      afterAdd === 41 &&
      next === addDays(TODAY, 1) &&
      skipped.length === 0 &&
      appData.ops.length === count &&
      again.date === addDays(TODAY, 1) &&
      missedPayments().length === 0
    );
  },
);

check("A single payment dated more than a year ago waits for an answer too", () => {
  scheduledExpense(addDays(TODAY, -400), null);
  const before = appData.ops.length;
  return postDue().length === 0 && appData.ops.length === before && missedPayments().length === 1;
});

check("A scheduled payment dated today or a few days ago is posted at once", () => {
  scheduledExpense(addDays(TODAY, -20), null);
  const before = appData.ops.length;
  return (
    postDue().length === 1 &&
    appData.ops.at(-1).date === addDays(TODAY, -20) &&
    appData.ops.length === before + 1 &&
    appData.scheduled.length === 0
  );
});

// Scheduled payments that start in the past, in the ways the form allows.
const startedAgo = (days, recur, extra = {}) => {
  const item = scheduledExpense(addDays(TODAY, -days), recur);
  Object.assign(item, extra);
  return item;
};
const postedOf = (item) => appData.ops.filter((o) => o.fromSchedule?.id === item.id);

check("A repeating payment that started in the past posts what was missed and goes on", () => {
  const monthly = { every: 1, unit: "Months", remaining: null, days: [] };
  const item = startedAgo(70, monthly);
  postDue();
  const dates = postedOf(item).map((o) => o.date);
  return (
    dates.length >= 2 &&
    dates.every((d) => d <= TODAY) &&
    item.date > TODAY &&
    appData.scheduled.includes(item)
  );
});

check("A payment with a number of repeats counts the missed ones and ends after the last", () => {
  const weekly = (remaining) => ({ every: 1, unit: "Days", remaining, days: [] });
  const open = startedAgo(3, weekly(10));
  postDue();
  const stillThere =
    appData.scheduled.includes(open) && open.recur.remaining === 6 && postedOf(open).length === 4;
  const done = startedAgo(10, weekly(3), { id: "__done" });
  postDue();
  return stillThere && postedOf(done).length === 3 && !appData.scheduled.includes(done);
});

check(
  "A payment with one repeat left that started in the past is posted once and goes away",
  () => {
    const item = startedAgo(5, { every: 1, unit: "Days", remaining: 1, days: [] });
    postDue();
    return postedOf(item).length === 1 && appData.scheduled.length === 0;
  },
);

check("A one-time payment from the past is posted on its own day and goes away", () => {
  const item = startedAgo(9, null);
  postDue();
  const [posted] = postedOf(item);
  return posted.date === addDays(TODAY, -9) && !posted.recur && appData.scheduled.length === 0;
});

check("A yearly and a weekly payment that started in the past keep their rules", () => {
  const yearly = startedAgo(400, { every: 1, unit: "Years", remaining: null, days: [] });
  const weekly = {
    ...yearly,
    id: "__w",
    date: addDays(TODAY, -15),
    recur: { every: 1, unit: "Weeks", remaining: null, days: [] },
  };
  appData.scheduled.push(weekly);
  // The yearly one began more than a year ago: it waits for an answer, the weekly one is posted.
  postDue();
  const waiting = missedPayments().map((e) => e.item.id);
  return waiting.join() === "__due" && postedOf(weekly).length >= 2 && weekly.date > TODAY;
});

check(
  "Several payments are settled one by one: what is small is posted, what is large waits",
  () => {
    const a = startedAgo(2, null);
    const b = { ...a, id: "__big", date: addDays(TODAY, -500) };
    const c = {
      ...a,
      id: "__run",
      date: addDays(TODAY, -45),
      recur: { every: 1, unit: "Days", remaining: null, days: [] },
    };
    appData.scheduled.push(b, c);
    const posted = postDue();
    return (
      posted.length === 1 &&
      missedPayments()
        .map((e) => e.item.id)
        .sort()
        .join() === "__big,__run"
    );
  },
);

check("Skipping one-time and repeating payments from the past leaves no operation behind", () => {
  const one = startedAgo(500, null);
  const before = appData.ops.length;
  settleMissed(one.id, false);
  const gone = !appData.scheduled.includes(one) && appData.ops.length === before;
  const run = startedAgo(500, { every: 1, unit: "Months", remaining: null, days: [] });
  settleMissed(run.id, false);
  return (
    gone && run.date > TODAY && run.date <= addDays(TODAY, 31) && appData.ops.length === before
  );
});

check("A payment dated today is posted at once, whatever its time of day", () => {
  const item = startedAgo(0, null, { time: "23:59" });
  postDue();
  return postedOf(item).length === 1 && !postedOf(item)[0].time && appData.scheduled.length === 0;
});

check("A deleted operation of a payment is not posted again", () => {
  const item = startedAgo(2, { every: 1, unit: "Days", remaining: null, days: [] });
  postDue();
  const [first] = postedOf(item);
  const count = postedOf(item).length;
  appData.ops = appData.ops.filter((o) => o.id !== first.id);
  postDue();
  return postedOf(item).length === count - 1 && item.date === addDays(TODAY, 1);
});

check(
  "Add now on a repeating payment posts today and moves to the next date; skip only moves",
  () => {
    const item = scheduledExpense(addDays(TODAY, 3), {
      every: 1,
      unit: "Days",
      remaining: null,
      days: [],
    });
    processScheduled(item.id, true);
    const posted = postedOf(item)[0];
    const moved = item.date === addDays(TODAY, 4);
    processScheduled(item.id, false);
    return (
      posted.date === TODAY &&
      posted.fromSchedule.byHand &&
      moved &&
      item.date === addDays(TODAY, 5) &&
      postedOf(item).length === 1
    );
  },
);

check("Moving a repeating payment back to a day it already settled posts nothing twice", () => {
  const item = startedAgo(2, { every: 1, unit: "Days", remaining: null, days: [] });
  postDue();
  const count = postedOf(item).length;
  item.date = addDays(TODAY, -2);
  postDue();
  return postedOf(item).length === count && item.date === addDays(TODAY, 1);
});

check("A date more than a year from today is asked about", () => {
  return (
    isFarDate(addDays(TODAY, -366)) &&
    isFarDate(addDays(TODAY, 366)) &&
    !isFarDate(addDays(TODAY, -365)) &&
    !isFarDate(TODAY)
  );
});

check("One occurrence of a payment is posted only once", () => {
  const item = scheduledExpense(addDays(TODAY, -1), {
    every: 1,
    unit: "Days",
    remaining: null,
    days: [],
  });
  const first = deepClone(item);
  postDue();
  const count = appData.ops.length;
  // The same payment, as another device still has it, comes due again.
  appData.scheduled = [first];
  postDue();
  return appData.ops.length === count && first.date === addDays(TODAY, 1);
});

check("A payment that repeats monthly keeps its day after a short month", () => {
  const item = {
    date: "2026-01-31",
    anchorDay: 31,
    recur: { every: 1, unit: "Months", remaining: null, days: [] },
  };
  const seen = [];
  for (let n = 0; n < 4; n++) {
    seen.push(item.date);
    item.date = nextDate(item);
  }
  return seen.join() === "2026-01-31,2026-02-28,2026-03-31,2026-04-30";
});

check("The day of a monthly rule is the day of its date, and editing the date moves it", () => {
  const rule = { every: 1, unit: "Months", remaining: null, days: [] };
  const item = scheduledExpense("2030-01-31", rule);
  putOperation({ ...item }, true);
  const first = appData.scheduled[0].anchorDay;
  putOperation({ ...appData.scheduled[0], date: "2030-02-28" }, true);
  const moved = appData.scheduled[0].anchorDay;
  putOperation({ ...appData.scheduled[0], recur: null }, true);
  return first === 31 && moved === 28 && appData.scheduled[0].anchorDay === undefined;
});

check("An operation dated in the future becomes a one-time scheduled payment", () => {
  const base = appData.ops.find((o) => o.type === "expense");
  const day = addDays(TODAY, 4);
  const count = appData.ops.length;
  const before = accountBalance(base.from);
  putOperation({ ...base, date: day });
  const moved = appData.scheduled.find((o) => o.id === base.id);
  return (
    appData.ops.length === count - 1 &&
    !appData.ops.some((o) => o.id === base.id) &&
    moved.date === day &&
    moved.recur === null &&
    /^\d\d:\d\d$/.test(moved.time) &&
    accountBalance(base.from) === before + base.amount
  );
});

check("Moving an operation to a past day only changes its date", () => {
  const base = appData.ops.find((o) => o.type === "expense");
  const count = appData.ops.length;
  const day = addDays(TODAY, -40);
  putOperation({ ...base, date: day });
  return (
    appData.ops.length === count &&
    appData.ops.find((o) => o.id === base.id).date === day &&
    !appData.scheduled.some((o) => o.id === base.id)
  );
});

check("A bulk change of the date to the future moves those operations to the payments", () => {
  const [a, b] = appData.ops.filter((o) => o.type === "expense");
  const day = addDays(TODAY, 2);
  const count = appData.ops.length;
  const moved = applyBulkChanges([a.id, b.id], { ...emptyBulkChanges(), date: day });
  return (
    moved === 2 &&
    appData.ops.length === count - 2 &&
    appData.scheduled.filter((o) => o.date === day).length === 2
  );
});

const pick = (filter, list = appData.ops) =>
  list.filter((o) => operationMatchesFilters(o, { ...emptyFilters(), ...filter }));

check("The filter shows operations of scheduled payments, or leaves them out", () => {
  const item = scheduledExpense(addDays(TODAY, -2), {
    every: 1,
    unit: "Days",
    remaining: null,
    days: [],
  });
  postDue();
  const made = appData.ops.filter((o) => o.fromSchedule?.id === item.id).length;
  return (
    made === 3 &&
    pick({}).length === appData.ops.length &&
    pick({ origin: ["schedule"] }).length === 3 &&
    pick({ origin: ["manual"] }).length === appData.ops.length - 3 &&
    pick({ origin: ["manual", "schedule"] }).length === appData.ops.length &&
    pick({ origin: [] }).length === 0
  );
});

check("A budget counts the expenses of its categories and subcategories in its period", () => {
  const food = appData.categories.find((c) => c.type === "expense" && !c.parent);
  appData.categories.push({ ...food, id: "bsub", name: "Bakery", parent: food.id });
  const base = appData.ops.find((o) => o.type === "expense");
  const spent = (id, category, amount) => ({
    ...base,
    id,
    category,
    amount,
    date: TODAY,
    fees: [],
    foreign: undefined,
  });
  appData.ops = [spent("a", food.id, 300), spent("b", "bsub", 200), spent("c", "other", 900)];
  uiState.period = { mode: "month", anchor: TODAY };
  const budget = (categories) => ({
    id: "x",
    name: "x",
    currency: appData.settings.currency,
    amount: 1000,
    period: "month",
    categories,
  });
  const own = budgetState(budget([food.id]));
  return (
    own.used === 500 && own.left === 500 && own.share === 50 && budgetState(budget([])).used === 0
  );
});

check("A budget lists the operations it counts, newest first, for its own period", () => {
  const food = appData.categories.find((c) => c.type === "expense" && !c.parent);
  const base = appData.ops.find((o) => o.type === "expense");
  const at = (id, date, category) => ({
    ...base,
    id,
    date,
    category,
    fees: [],
    foreign: undefined,
  });
  appData.ops = [
    at("old", addDays(TODAY, -60), food.id),
    at("a", TODAY, food.id),
    at("b", TODAY, "other"),
    at("c", TODAY, food.id),
  ];
  uiState.period = { mode: "month", anchor: TODAY };
  const budget = {
    id: "x",
    name: "x",
    currency: appData.settings.currency,
    amount: 1,
    period: "month",
    categories: [food.id],
  };
  return (
    budgetOperations(budget)
      .map((o) => o.id)
      .join() === "c,a"
  );
});

check(
  "An operation dated in the past is stored on its day and moves the balance, even below zero",
  () => {
    const account = addAccount({ opening: 0 });
    const category = appData.categories.find((c) => c.type === "expense" && !c.parent);
    const day = addDays(TODAY, -33);
    putOperation({
      type: "expense",
      from: account.id,
      to: null,
      category: category.id,
      amount: 20000,
      date: day,
      comment: "",
      tags: [],
    });
    const stored = appData.ops.find((o) => o.from === account.id);
    return (
      stored.date === day && accountBalance(account.id) === -20000 && appData.scheduled.length === 0
    );
  },
);

check('The period steps by its own length, and "All time" has no neighbours', () => {
  const month = { mode: "month", anchor: "2026-01-31" };
  const range = { mode: "range", from: "2026-03-01", to: "2026-03-10" };
  const all = { mode: "all", anchor: "2026-01-31" };
  shiftPeriod(1, month);
  shiftPeriod(-1, range);
  return (
    month.anchor === "2026-02-01" &&
    range.from === "2026-02-19" &&
    range.to === "2026-02-28" &&
    !canShiftPeriod(all) &&
    shiftPeriod(1, all) === false &&
    all.anchor === "2026-01-31"
  );
});

check("Filters combine: subcategory under its own parent, account, type and tags", () => {
  const parents = appData.categories.filter((c) => c.type === "expense" && !c.parent);
  const [first, second] = parents;
  appData.categories.push(
    { ...first, id: "s1", name: "Same", parent: first.id },
    { ...second, id: "s2", name: "Same", parent: second.id },
  );
  const [a, b] = appData.accounts.filter((x) => !x.archived).map((x) => x.id);
  const base = appData.ops.find((o) => o.type === "expense");
  const make = (id, fields) => ({ ...base, id, from: a, tags: [], comment: "", ...fields });
  const ops = [
    make("p1", { category: first.id }),
    make("c1", { category: "s1" }),
    make("c2", { category: "s2" }),
    make("c1-b", { category: "s1", from: b, tags: ["t"] }),
    make("t1", { type: "transfer", category: null, from: a, to: b }),
    make("i1", { type: "income", category: "s1", from: null, to: a }),
  ];
  const ids = (filter) =>
    pick(filter, ops)
      .map((o) => o.id)
      .join();
  return (
    ids({ categories: ["s1"] }) === "c1,c1-b,i1" &&
    ids({ categories: ["s2"] }) === "c2" &&
    ids({ categories: ["s1"], types: ["expense"] }) === "c1,c1-b" &&
    ids({ categories: ["s1"], accounts: [b] }) === "c1-b" &&
    ids({ categories: ["s1", "s2"], accounts: [a], types: ["expense"] }) === "c1,c2" &&
    ids({ categories: ["s1"], tags: ["t"] }) === "c1-b" &&
    ids({ types: ["transfer"] }) === "t1" &&
    ids({ types: ["transfer", "income"] }) === "t1,i1" &&
    ids({ accounts: [b] }) === "c1-b,t1" &&
    ids({ categories: [first.id] }) === "p1"
  );
});

check("A category is filtered as chosen: a subcategory can be left out of its parent", () => {
  const food = appData.categories.find((c) => c.name === "Food");
  const sub = { ...food, id: "sub", name: "Cafe", parent: food.id };
  const other = { ...food, id: "sub2", name: "Market", parent: food.id };
  appData.categories.push(sub, other);
  const base = appData.ops.find((o) => o.type === "expense");
  const make = (category) => ({ ...base, id: `x-${category}`, category });
  const ops = [make(food.id), make("sub"), make("sub2")];
  const match = (categories) =>
    ops
      .filter((o) => operationMatchesFilters(o, { ...emptyFilters(), categories }))
      .map((o) => o.category);
  return (
    match(categoryFamily(food.id)).length === 3 &&
    match([food.id, "sub"]).join() === `${food.id},sub` &&
    match(["sub2"]).join() === "sub2" &&
    match([food.id]).join() === food.id
  );
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

check("Deleted records leave the selection and the filters", () => {
  appData.categories.push({ id: "__c1", name: "A", type: "expense", parent: null });
  const cash = addAccount({ opening: 100000 });
  appData.ops = [
    {
      id: "__a",
      type: "expense",
      from: cash.id,
      amount: 100,
      category: "__c1",
      date: TODAY,
      tags: [],
    },
    {
      id: "__b",
      type: "expense",
      from: cash.id,
      amount: 100,
      category: "c1",
      date: TODAY,
      tags: [],
    },
  ];
  uiState.selected = ["__a", "__b"];
  uiState.filters.categories = ["__c1"];
  uiState.filters.accounts = [cash.id, "other"];
  forgetDeleted(deleteCategory("__c1"));
  const afterCategory = uiState.selected.join() === "__b" && uiState.filters.categories === null;
  forgetDeleted(deleteAccount(cash.id));
  return (
    afterCategory && uiState.selected.length === 0 && uiState.filters.accounts.join() === "other"
  );
});

check("Storing a category applies the planned changes of its subcategories", () => {
  const base = { type: "expense", archived: false, currency: appData.settings.currency };
  appData.categories.push(
    { ...base, id: "__p", name: "Parent", parent: null },
    { ...base, id: "__other", name: "Other", parent: null },
    { ...base, id: "__s1", name: "Merged", parent: "__p" },
    { ...base, id: "__s2", name: "Archived", parent: "__p" },
    { ...base, id: "__s3", name: "Removed", parent: "__p" },
  );
  const cash = addAccount({ opening: 100000 });
  const spend = (id, category) => ({
    id,
    type: "expense",
    from: cash.id,
    amount: 100,
    category,
    date: TODAY,
    tags: [],
  });
  appData.ops = [spend("__o1", "__s1"), spend("__o3", "__s3")];
  appData.budgets = [{ id: "__b", amount: 1, categories: ["__s1"] }];
  const removed = storeCategory(
    { ...appData.categories.find((c) => c.id === "__p"), name: "Renamed" },
    {
      newSubcategories: [{ ...base, id: "__s4", name: "Fresh" }],
      subActions: [
        { id: "__s1", mode: "mergeSub", target: "__other" },
        { id: "__s2", mode: "archiveSub" },
        { id: "__s3", mode: "deleteSub" },
      ],
    },
  );
  const find = (id) => appData.categories.find((c) => c.id === id);
  return (
    find("__p").name === "Renamed" &&
    find("__s1") === undefined &&
    appData.ops.find((o) => o.id === "__o1").category === "__other" &&
    appData.budgets[0].categories.join() === "__other" &&
    find("__s2").archived === true &&
    find("__s3") === undefined &&
    !appData.ops.some((o) => o.id === "__o3") &&
    find("__s4").parent === "__p" &&
    removed.operations.join() === "__o3" &&
    removed.categories.includes("__s1") &&
    removed.categories.includes("__s3")
  );
});

check("The ids of the operations a payment posted are handed back", () => {
  const item = scheduledExpense(addDays(TODAY, -2), {
    every: 1,
    unit: "Days",
    remaining: null,
    days: [],
  });
  const ids = postDue();
  return ids.length === 3 && ids.every((id) => postedOf(item).some((o) => o.id === id));
});

check("The period around posted days keeps the chosen one, else the month, else a range", () => {
  const month = { mode: "month", anchor: TODAY };
  const [from] = periodBounds(month);
  const inside = periodAround([from], month);
  const far = addDays(from, -45);
  const other = periodAround([far], month);
  const wide = periodAround([far, addDays(far, 40)], month);
  return (
    inside === month &&
    other.mode === "month" &&
    other.anchor === far &&
    wide.mode === "range" &&
    wide.from === far &&
    wide.to === addDays(far, 40)
  );
});

check("A scheduled payment cannot be created for, or moved to, a day that has come", () => {
  const base = appData.ops.find((o) => o.type === "expense");
  const fresh = (date) => ({ ...JSON.parse(JSON.stringify(base)), id: "__new", date, recur: null });
  const refuses = (fn) => {
    try {
      fn();
      return false;
    } catch (e) {
      return e.message === "A scheduled payment starts tomorrow at the earliest";
    }
  };
  const tomorrow = addDays(TODAY, 1);
  appData.scheduled = [];
  const today = refuses(() => putOperation(fresh(TODAY), true));
  const past = refuses(() => putOperation(fresh(addDays(TODAY, -3)), true));
  putOperation(fresh(tomorrow), true);
  const moved = refuses(() => putOperation({ ...appData.scheduled[0], date: TODAY }, true));
  // An overdue payment that waits for an answer can still be saved as it is.
  const late = scheduledExpense(addDays(TODAY, -2), null);
  putOperation({ ...late, comment: "kept" }, true);
  return today && past && moved && appData.scheduled[0].comment === "kept";
});

check("A reminder on the day of the payment cannot come after the payment time", () => {
  const same = { before: 0, unit: "Days", time: "20:00" };
  return (
    comesAfterPayment(same, "18:00") &&
    comesAfterPayment(same, "20:00") &&
    !comesAfterPayment(same, "21:00") &&
    !comesAfterPayment({ ...same, before: 1 }, "18:00") &&
    !comesAfterPayment(null, "18:00")
  );
});

check(
  "A reminder of the payment day follows the payment time, or goes when there is no room",
  () => {
    const same = { before: 0, unit: "Days", time: "16:00" };
    const later = reminderForTime(same, "18:00", "19:00");
    const moved = reminderForTime(same, "18:00", "15:00");
    const dropped = reminderForTime(same, "18:00", "01:00");
    const other = { before: 1, unit: "Days", time: "16:00" };
    return (
      later === same &&
      moved.time === "13:00" &&
      moved.before === 0 &&
      dropped === null &&
      reminderForTime(other, "18:00", "09:00") === other &&
      reminderForTime(null, "18:00", "09:00") === null
    );
  },
);
