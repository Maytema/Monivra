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
  editedFromPlan,
  operationMatchesFilters,
} from "../js/domain/finance.js";
import {
  applyBulkChanges,
  emptyBulkChanges,
  putOperation,
  validateOp,
} from "../js/domain/operations.js";
import { deleteCategory, storeCategory } from "../js/domain/categories.js";
import { nextDate, postDue, processScheduled } from "../js/domain/scheduled.js";

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
    posted === 3 &&
    days.join() === [-2, -1, 0].map((n) => addDays(TODAY, n)).join() &&
    item.date === addDays(TODAY, 1) &&
    item.recur.remaining === 2 &&
    postDue() === 0
  );
});

check("A one-time payment that came due is posted once and leaves the list", () => {
  scheduledExpense(addDays(TODAY, -1), null);
  const count = appData.ops.length;
  return (
    postDue() === 1 &&
    appData.ops.length === count + 1 &&
    appData.scheduled.length === 0 &&
    postDue() === 0
  );
});

check("A payment that is not due yet stays untouched", () => {
  const later = addDays(TODAY, 3);
  const item = scheduledExpense(later, { every: 1, unit: "Days", remaining: null, days: [] });
  const count = appData.ops.length;
  return postDue() === 0 && appData.ops.length === count && item.date === later;
});

check("A posted payment remembers where it came from and what was planned", () => {
  const item = scheduledExpense(addDays(TODAY, -1), null);
  postDue();
  const posted = appData.ops.at(-1);
  const plan = posted.fromSchedule?.planned;
  return (
    posted.fromSchedule.id === item.id &&
    posted.fromSchedule.date === item.date &&
    plan.amount === item.amount &&
    plan.date === posted.date &&
    !posted.recur &&
    !editedFromPlan(posted)
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

check("The filter finds the operations of scheduled payments, all or the changed ones", () => {
  const item = scheduledExpense(addDays(TODAY, -3), {
    every: 1,
    unit: "Days",
    remaining: null,
    days: [],
  });
  postDue();
  const made = appData.ops.filter((o) => o.fromSchedule?.id === item.id);
  made[0].amount += 100;
  made[1].date = addDays(made[1].date, 1);
  const pick = (filter) =>
    appData.ops.filter((o) => operationMatchesFilters(o, { ...emptyFilters(), ...filter }));
  return (
    made.length === 4 &&
    pick({ scheduled: "only" }).length === 4 &&
    pick({ scheduled: "only", edited: true }).length === 2 &&
    pick({ scheduled: "exclude" }).length === appData.ops.length - 4 &&
    pick({}).length === appData.ops.length
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
