/* Pre-merge audit: scheduling of future operations, the card limit, the debt switches, excluded
   accounts, rounding, merging, the PIN and the reminders. Each check names the rule it holds. */
import { check } from "./harness.js";
import { addAccount, transfer } from "./helpers.js";
import { today } from "../js/core/constants.js";
import { appData, setAppData } from "../js/core/state.js";
import { createBackup } from "../js/domain/backups.js";
import { changeAccountCurrency, planCurrencyChange } from "../js/domain/currency-change.js";
import {
  accountBalance,
  accountProgress,
  addDays,
  convertCurrency,
  overallBalance,
  reportRows,
  totalByType,
  transferRoles,
} from "../js/domain/finance.js";
import {
  deleteOperation,
  isPlanned,
  planFutureOperations,
  putOperation,
} from "../js/domain/operations.js";
import { planRestore } from "../js/domain/restore.js";
import { dueReminders, reminderDay } from "../js/domain/reminders.js";
import { postDue } from "../js/domain/scheduled.js";
import { makePin, pbkdf2, pinMatches, protectedPin, sha256 } from "../js/platform/pin.js";
import { applyImport, undoImport } from "../js/data/csv-import.js";
import { completeData } from "../js/data/defaults.js";
import { createReportFixture } from "./report-fixture.js";

let counter = 0;
const expense = (account, date, amount, extra = {}) => ({
  id: `__e${++counter}`,
  type: "expense",
  from: account.id,
  category: appData.categories.find((c) => c.type === "expense").id,
  amount,
  date,
  comment: "",
  tags: [],
  ...extra,
});
const fresh = () => {
  appData.ops = [];
  appData.scheduled = [];
  return addAccount({ opening: 100000 });
};
const later = (days) => addDays(today(), days);
// Time passes: every scheduled payment is `days` closer (the clock of the check cannot move).
const pass = (days) => {
  for (const item of appData.scheduled) item.date = addDays(item.date, -days);
};

// ---- 1. Future-dated and past-dated operations ----

check("An expense dated ahead becomes a one-time scheduled payment and changes nothing yet", () => {
  const a = fresh();
  const before = [accountBalance(a.id), overallBalance(), totalByType("expense")];
  const saved = putOperation(expense(a, later(6), 50000));
  return (
    appData.ops.length === 0 &&
    appData.scheduled.length === 1 &&
    appData.scheduled[0].id === saved.id &&
    appData.scheduled[0].date === later(6) &&
    appData.scheduled[0].recur === null &&
    isPlanned(saved) &&
    [accountBalance(a.id), overallBalance(), totalByType("expense")].join() === before.join()
  );
});

check("On its day the payment is posted once, with its own date, and never again", () => {
  const a = fresh();
  putOperation(expense(a, later(6), 50000));
  pass(5);
  if (postDue().length) return false;
  pass(1);
  const posted = postDue();
  const again = postDue();
  const later2 = postDue();
  return (
    posted.length === 1 &&
    again.length === 0 &&
    later2.length === 0 &&
    appData.scheduled.length === 0 &&
    appData.ops.length === 1 &&
    appData.ops[0].date === today() &&
    appData.ops[0].fromSchedule.date === today() &&
    accountBalance(a.id) === 50000
  );
});

check("An expense dated in the past is done at once and keeps its date", () => {
  const a = fresh();
  const past = addDays(today(), -20);
  putOperation(expense(a, past, 12345));
  return (
    appData.scheduled.length === 0 &&
    appData.ops.length === 1 &&
    appData.ops[0].date === past &&
    accountBalance(a.id) === 100000 - 12345 &&
    reportRows().every((r) => r.date === past)
  );
});

check("A payment missed while the app was closed is posted once, on its own day", () => {
  const a = fresh();
  putOperation(expense(a, later(3), 1000));
  pass(10);
  postDue();
  postDue();
  return appData.ops.length === 1 && appData.ops[0].date === addDays(today(), -7);
});

check("A repeating payment posts each occurrence once however often the app is opened", () => {
  const a = fresh();
  const item = putOperation(expense(a, later(1), 700));
  appData.scheduled.find((x) => x.id === item.id).recur = {
    every: 1,
    unit: "Days",
    remaining: null,
  };
  pass(4);
  for (let i = 0; i < 3; i++) postDue();
  const dates = appData.ops.map((o) => o.date).sort();
  return (
    dates.join() === [-3, -2, -1, 0].map((n) => addDays(today(), n)).join() &&
    appData.scheduled[0].date === later(1)
  );
});

check("Editing or deleting a pending payment leaves a posted one alone", () => {
  const a = fresh();
  const item = putOperation(expense(a, later(1), 300));
  pass(1);
  postDue();
  const posted = appData.ops.map((o) => o.id);
  // The one-time payment is gone once posted; a new pending one is edited and deleted freely.
  const next = putOperation(expense(a, later(9), 400));
  putOperation({ ...appData.scheduled[0], amount: 450 }, true);
  deleteOperation(next.id, true);
  return (
    item.id !== undefined &&
    appData.scheduled.length === 0 &&
    appData.ops.map((o) => o.id).join() === posted.join() &&
    accountBalance(a.id) === 100000 - 300
  );
});

check("An operation dated ahead that came from a backup or a file moves to the scheduled", () => {
  const a = fresh();
  appData.ops.push({ ...expense(a, later(4), 900), id: "from-file" });
  const before = accountBalance(a.id);
  const moved = planFutureOperations();
  const second = planFutureOperations();
  return (
    before === 100000 - 900 &&
    moved === 1 &&
    second === 0 &&
    appData.ops.length === 0 &&
    appData.scheduled[0].id === "from-file" &&
    accountBalance(a.id) === 100000 &&
    // The day comes: it is posted once.
    (pass(4), postDue().length === 1) &&
    postDue().length === 0
  );
});

check("A CSV row dated ahead is added as a scheduled payment, and the import can be undone", () => {
  const a = fresh();
  const plan = {
    ops: [
      { ...expense(a, later(8), 500), id: "csv-future" },
      { ...expense(a, addDays(today(), -2), 600), id: "csv-past" },
    ],
    created: { accounts: [], categories: [] },
    newTags: [],
  };
  const added = applyImport(plan);
  const placed =
    appData.ops.map((o) => o.id).join() === "csv-past" &&
    appData.scheduled.map((o) => o.id).join() === "csv-future" &&
    accountBalance(a.id) === 100000 - 600;
  undoImport(added);
  return placed && appData.ops.length === 0 && appData.scheduled.length === 0;
});

check("A backup keeps the scheduled payments, and restoring twice does not double them", () => {
  const a = fresh();
  putOperation(expense(a, later(5), 100));
  createBackup("manual");
  const incoming = appData.backups[0].data;
  const once = planRestore(appData, incoming, { mode: "merge", scheduled: "count" }).next;
  const twice = planRestore(once, incoming, { mode: "merge", scheduled: "count" }).next;
  const replaced = planRestore(appData, incoming, { mode: "replace", scheduled: "count" }).next;
  return (
    once.scheduled.length === 1 &&
    twice.scheduled.length === 1 &&
    replaced.scheduled.length === 1 &&
    replaced.scheduled[0].date === later(5)
  );
});

// ---- 2. Credit card: own funds, used credit, limit ----

check("A card with money of its own uses no credit: 0 % used, never a negative share", () => {
  const card = addAccount({ opening: 454950, limit: 200000 });
  const p = accountProgress(card);
  // What is available is the money of its own plus the limit.
  return p.percent === 0 && p.done === 0 && p.left === 654950;
});

check("Credit used is what is spent below zero; beyond the limit it shows as exceeded", () => {
  const card = addAccount({ opening: 0, limit: 200000 });
  const at = (spent) => {
    appData.ops = [expense(card, today(), spent)];
    return accountProgress(card);
  };
  const half = at(100000),
    full = at(200000),
    over = at(250000);
  return (
    half.percent === 50 &&
    half.left === 100000 &&
    full.percent === 100 &&
    full.left === 0 &&
    over.percent === 125 &&
    over.left === -50000 &&
    // The balance stays the one number of the account: the limit never enters it.
    accountBalance(card.id) === -250000
  );
});

check("Repaying a card from another account moves its use back and forth exactly", () => {
  const cash = addAccount({ opening: 500000 });
  const card = addAccount({ opening: 0, limit: 300000 });
  appData.ops = [expense(card, today(), 120000)];
  transfer(cash, card, 120000);
  return accountProgress(card).percent === 0 && accountBalance(cash.id) === 380000;
});

// ---- 3. Debt switches ----

check("Debt switches: the direction of a transfer alone decides what it counts as", () => {
  const regular = addAccount({});
  for (const considerExpense of [false, true])
    for (const considerIncome of [false, true])
      for (const debt of ["I owe", "Owe me"]) {
        const d = addAccount({ type: "Debt", debt, considerExpense, considerIncome });
        const into = { type: "transfer", from: regular.id, to: d.id };
        const out = { type: "transfer", from: d.id, to: regular.id };
        const a = transferRoles(into),
          b = transferRoles(out);
        const right =
          (a.expense === d) === considerExpense &&
          a.income === null &&
          (b.income === d) === considerIncome &&
          b.expense === null;
        if (!right) return false;
        // Never both for one event.
        if ((a.expense && a.income) || (b.expense && b.income)) return false;
      }
  return true;
});

check("A transfer between two debt accounts, or two regular accounts, counts as nothing", () => {
  const x = addAccount({ type: "Debt", considerExpense: true, considerIncome: true });
  const y = addAccount({ type: "Debt", considerExpense: true, considerIncome: true });
  const r1 = addAccount({}),
    r2 = addAccount({});
  const none = (o) => !transferRoles(o).expense && !transferRoles(o).income;
  return (
    none({ type: "transfer", from: x.id, to: y.id }) &&
    none({ type: "transfer", from: r1.id, to: r2.id })
  );
});

check("With both debt switches on, repayment is one expense and a loan taken one income", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 1000000 });
  const debt = addAccount({
    type: "Debt",
    debt: "I owe",
    opening: -300000,
    considerExpense: true,
    considerIncome: true,
  });
  transfer(debt, cash, 300000); // the loan arrives: income
  transfer(cash, debt, 100000); // a partial repayment: expense
  transfer(cash, debt, 50000); // another one
  const rows = reportRows();
  return (
    rows.length === 3 &&
    totalByType("income") === convertCurrency(300000, cash.currency, appData.settings.currency) &&
    totalByType("expense") === convertCurrency(150000, cash.currency, appData.settings.currency) &&
    accountBalance(debt.id) === -300000 + -300000 + 150000 &&
    // The debt flips to "Owe me" when overpaid, the classification does not change.
    rows.every((r) => r.category === "debt:" + debt.id)
  );
});

check("Editing or deleting a debt transfer takes its effect back exactly", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 100000 });
  const debt = addAccount({ type: "Debt", considerExpense: true, opening: 0 });
  transfer(cash, debt, 40000);
  const id = appData.ops[0].id;
  const spent = totalByType("expense");
  appData.ops[0].amount = 25000;
  appData.ops[0].receive = 25000;
  const edited = totalByType("expense");
  appData.ops = appData.ops.filter((o) => o.id !== id);
  return (
    spent === 40000 &&
    edited === 25000 &&
    totalByType("expense") === 0 &&
    accountBalance(cash.id) === 100000 &&
    accountBalance(debt.id) === 0
  );
});

// ---- 4. Accounts excluded from the overall balance ----

check("An excluded account leaves the overall balance but not the history or the analytics", () => {
  appData.ops = [];
  for (const account of appData.accounts) account.include = false;
  const kept = addAccount({ opening: 1000 });
  const off = addAccount({ opening: 5000, include: false });
  const base = appData.settings.currency;
  appData.ops.push(expense(off, today(), 700), expense(kept, today(), 200));
  return (
    overallBalance() === convertCurrency(800, kept.currency, base) &&
    accountBalance(off.id) === 4300 &&
    totalByType("expense") === 900 &&
    reportRows().length === 2
  );
});

// ---- 5. Rounding ----

check(
  "Converting an account in mode all keeps the balance equal to the converted old balance",
  () => {
    appData.rates.USD = 87.5;
    appData.rates.KGS = 1;
    let worst = 0;
    for (let seed = 1; seed <= 40; seed++) {
      appData.ops = [];
      const cash = addAccount({ opening: 1237500 + seed * 17 });
      const other = addAccount({ opening: 0 });
      for (let i = 0; i < 1 + (seed % 9); i++) {
        appData.ops.push({
          id: `__r${seed}_${i}`,
          type: "income",
          to: cash.id,
          category: appData.categories.find((c) => c.type === "income").id,
          amount: 333 + seed * 13 + i * 7,
          date: today(),
          tags: [],
          comment: "",
        });
      }
      transfer(cash, other, 1111 + seed);
      const before = accountBalance(cash.id);
      const plan = planCurrencyChange(cash.id, "USD", "all");
      changeAccountCurrency(cash.id, "USD", "all");
      const exact = convertCurrency(before, "KGS", "USD");
      worst = Math.max(worst, Math.abs(accountBalance(cash.id) - exact));
      if (plan.after !== accountBalance(cash.id)) return false;
    }
    return worst === 0;
  },
);

check("A converted operation edited or deleted afterwards reverses exactly", () => {
  appData.ops = [];
  const kgs = addAccount({ opening: 500000 });
  const usd = addAccount({ currency: "USD", opening: 0 });
  appData.rates.USD = 87.5;
  transfer(kgs, usd, 123457);
  const op = appData.ops[0];
  op.receive = convertCurrency(op.amount, "KGS", "USD");
  const sum = () => accountBalance(kgs.id) + 0;
  const gone = sum();
  appData.ops = [];
  return gone === 500000 - 123457 && sum() === 500000 && accountBalance(usd.id) === 0;
});

// ---- 7. Merging a backup ----

check("A merge keeps the version here of a record that is in both, when asked", () => {
  setAppData(createReportFixture());
  createBackup("manual");
  const backup = appData.backups[0].data;
  appData.ops[0].comment = "edited later";
  appData.accounts[0].name = "Renamed later";
  const keep = planRestore(appData, backup, {
    mode: "merge",
    scheduled: "count",
    conflicts: "keep",
  });
  const take = planRestore(appData, backup, { mode: "merge", scheduled: "count" });
  return (
    keep.next.ops.find((o) => o.id === appData.ops[0].id).comment === "edited later" &&
    keep.next.accounts.find((a) => a.id === appData.accounts[0].id).name === "Renamed later" &&
    keep.summary.merge.ops.changed === 1 &&
    take.next.ops.find((o) => o.id === appData.ops[0].id).comment !== "edited later" &&
    keep.next.ops.length === appData.ops.length
  );
});

check("A merge brings back what was deleted here, with the account its operations need", () => {
  setAppData(createReportFixture());
  createBackup("manual");
  const backup = appData.backups[0].data;
  const gone = appData.accounts[0].id;
  appData.ops = appData.ops.filter((o) => o.from !== gone && o.to !== gone);
  appData.scheduled = appData.scheduled.filter((o) => o.from !== gone && o.to !== gone);
  appData.accounts = appData.accounts.filter((a) => a.id !== gone);
  const plan = planRestore(appData, backup, {
    mode: "merge",
    scheduled: "count",
    conflicts: "keep",
  });
  return !plan.problem && plan.next.accounts.some((a) => a.id === gone);
});

check("Merging the same backup again changes nothing, with either policy", () => {
  setAppData(createReportFixture());
  createBackup("manual");
  const backup = appData.backups[0].data;
  for (const conflicts of ["keep", "backup"]) {
    const once = planRestore(appData, backup, { mode: "merge", scheduled: "count", conflicts });
    const twice = planRestore(once.next, backup, { mode: "merge", scheduled: "count", conflicts });
    if (twice.next.ops.length !== once.next.ops.length) return false;
    if (twice.summary.merge.ops.added !== 0) return false;
  }
  return true;
});

// ---- 9. PIN ----

check("SHA-256 and PBKDF2 give the published test vectors", () => {
  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const text = (s) => new TextEncoder().encode(s);
  return (
    hex(sha256(text("abc"))) ===
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" &&
    hex(sha256(text(""))) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" &&
    hex(pbkdf2(text("password"), text("salt"), 1)) ===
      "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b" &&
    hex(pbkdf2(text("password"), text("salt"), 2)) ===
      "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"
  );
});

check(
  "A PIN is stored as a salted hash; a wrong PIN is refused; an older plain PIN is converted",
  () => {
    const stored = makePin("4821");
    const other = makePin("4821");
    const converted = completeData({
      settings: { pin: "1234" },
      backups: [{ data: { settings: { pin: "9999" } } }],
    });
    return (
      !JSON.stringify(stored).includes("4821") &&
      stored.salt !== other.salt &&
      stored.hash !== other.hash &&
      pinMatches(stored, "4821") &&
      !pinMatches(stored, "4822") &&
      !pinMatches(false, "") &&
      typeof converted.settings.pin === "object" &&
      pinMatches(converted.settings.pin, "1234") &&
      !JSON.stringify(converted).includes("9999") &&
      pinMatches(converted.backups[0].data.settings.pin, "9999") &&
      protectedPin(false) === false
    );
  },
);

// ---- 10. Reminders ----

check(
  "A reminder day counts back days, weeks, months and years, keeping the day of the month",
  () => {
    const day = (before, unit, date) =>
      reminderDay({ date, reminder: { before, unit, time: "09:00" } });
    return (
      day(3, "Days", "2026-03-02") === "2026-02-27" &&
      day(2, "Weeks", "2026-03-15") === "2026-03-01" &&
      day(1, "Months", "2026-03-31") === "2026-02-28" &&
      day(1, "Years", "2028-02-29") === "2027-02-28"
    );
  },
);

check(
  "Reminders come once, at their time, only with notifications on; the periodic one follows its days",
  () => {
    const a = fresh();
    const item = putOperation(expense(a, later(1), 100));
    appData.scheduled.find((x) => x.id === item.id).reminder = {
      before: 1,
      unit: "Days",
      time: "09:00",
    };
    const at = (hour) => {
      const d = new Date();
      d.setHours(hour, 0, 0, 0);
      return d;
    };
    appData.settings.notifications = false;
    const off = dueReminders(appData, at(10), new Set());
    appData.settings.notifications = true;
    appData.settings.periodic = true;
    appData.settings.notificationTime = "20:00";
    appData.settings.notificationFrequency = "Every day";
    const early = dueReminders(appData, at(8), new Set());
    const morning = dueReminders(appData, at(10), new Set());
    const evening = dueReminders(appData, at(21), new Set());
    const shown = new Set(evening.map((r) => r.key));
    const again = dueReminders(appData, at(21), shown);
    appData.settings.notificationFrequency = "Weekdays";
    const weekday = new Date().getDay();
    const weekdaysOnly = dueReminders(appData, at(21), new Set()).some(
      (r) => r.kind === "periodic",
    );
    return (
      off.length === 0 &&
      early.length === 0 &&
      morning.length === 1 &&
      morning[0].kind === "payment" &&
      evening.length === 2 &&
      again.length === 0 &&
      weekdaysOnly === (weekday >= 1 && weekday <= 5)
    );
  },
);
