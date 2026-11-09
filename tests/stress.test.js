/* State-matrix checks of the money model. Every expectation is worked out here by a separate, plain
   calculation (`refCard`, `refRoles`, sums of the operations), never read back from the code under
   test. See docs/STATE_MATRIX.md for the matrix and what it covers. */
import { check } from "./harness.js";
import { addAccount } from "./helpers.js";
import { today } from "../js/core/constants.js";
import { appData } from "../js/core/state.js";
import { dataSnapshot } from "../js/domain/backups.js";
import {
  accountBalance,
  addDays,
  cardState,
  convertCurrency,
  newestFirst,
  overallBalance,
  reportRows,
} from "../js/domain/finance.js";
import { deleteOperation, putOperation } from "../js/domain/operations.js";
import { nextDate, postDue } from "../js/domain/scheduled.js";
import { completeData } from "../js/data/defaults.js";
import { csvTable } from "../js/data/csv.js";

let n = 0;
const cat = (type) => appData.categories.find((c) => c.type === type).id;
const op = (type, fields) => ({
  id: `__s${++n}`,
  type,
  amount: 0,
  date: today(),
  comment: "",
  tags: [],
  ...(type === "expense" && { category: cat("expense") }),
  ...(type === "income" && { category: cat("income") }),
  ...fields,
});
const spend = (a, amount, extra) => op("expense", { from: a.id, amount, ...extra });
const refund = (a, amount, extra) => op("income", { to: a.id, amount, ...extra });
const topUp = (from, to, amount, extra) =>
  op("transfer", { from: from.id, to: to.id, amount, receive: amount, ...extra });
const clean = () => {
  appData.ops = [];
  appData.scheduled = [];
};

// Reference: the balance is opening plus the signed amounts; the parts follow from a waterfall
// written separately from cardState (money first, then the credit line, then the excess).
function refCard(balance, limit) {
  if (!(limit > 0)) return null;
  let own = 0,
    used = 0,
    over = 0;
  if (balance >= 0) own = balance;
  else if (-balance <= limit) used = -balance;
  else [used, over] = [limit, -balance - limit];
  return { own, used, over, avail: own + (limit - used) };
}
const partsOk = (a, expectedBalance) => {
  const s = cardState(a),
    r = refCard(expectedBalance, a.limit);
  if (accountBalance(a.id) !== expectedBalance) return false;
  if (!r) return s === null;
  return (
    s.own === r.own &&
    s.creditUsed === r.used &&
    s.overLimit === r.over &&
    s.available === r.avail &&
    s.creditUsed >= 0 &&
    s.overLimit >= 0 &&
    s.own * (s.creditUsed + s.overLimit) === 0 && // own money and used credit never coexist
    s.own - s.creditUsed - s.overLimit === expectedBalance && // nothing created or lost
    Math.abs(s.utilization - Math.max(0, -expectedBalance) / a.limit) < 1e-12
  );
};

// ---- 1. Card: starting states x spends, at and around every boundary ----

const OPENINGS = [500000, 0, -500000, -2000000, -2500000]; // own, none, part, full, over
const LIMIT = 2000000;
const SPENDS = [300000, 1000000, 2500000, 3000000, 2499999, 2500001, 1, 0];
check("Card: 5 starting states x 8 spends match the reference parts", () => {
  let cases = 0;
  for (const opening of OPENINGS)
    for (const amount of SPENDS) {
      clean();
      const a = addAccount({ opening, limit: LIMIT });
      if (amount > 0) putOperation(spend(a, amount));
      if (!partsOk(a, opening - amount)) return false;
      cases++;
    }
  return cases === 40;
});

check("Card: the example 5,000 own / 20,000 limit follows the net-ledger rule", () => {
  const want = [
    [300000, { own: 200000, used: 0, over: 0, avail: 2200000 }],
    [1000000, { own: 0, used: 500000, over: 0, avail: 1500000 }],
    [2500000, { own: 0, used: 2000000, over: 0, avail: 0 }],
    [3000000, { own: 0, used: 2000000, over: 500000, avail: 0 }],
  ];
  return want.every(([amount, w]) => {
    clean();
    const a = addAccount({ opening: 500000, limit: 2000000 });
    putOperation(spend(a, amount));
    const s = cardState(a);
    return (
      s.own === w.own &&
      s.creditUsed === w.used &&
      s.overLimit === w.over &&
      s.available === w.avail
    );
  });
});

// Every order of: refund, top-up, edit the original spend, delete it. The final balance depends
// only on which operations are left, never on the order they came in.
const permutations = (xs) =>
  xs.length < 2
    ? [xs]
    : xs.flatMap((x, i) =>
        permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
      );
check("Card: refund, top-up, edit and delete in all 24 orders end in the same state", () => {
  const other = () => addAccount({ opening: 5000000 });
  let ok = 0;
  for (const order of permutations(["refund", "topup", "edit", "delete"])) {
    clean();
    const a = addAccount({ opening: 500000, limit: 2000000 }),
      src = other();
    const spent = putOperation(spend(a, 3000000));
    let expected = 500000 - 3000000,
      editedTo = 3000000,
      deleted = false;
    const srcBefore = accountBalance(src.id);
    for (const step of order) {
      if (step === "refund") {
        putOperation(refund(a, 700000));
        expected += 700000;
      } else if (step === "topup") {
        putOperation(topUp(src, a, 1500000));
        expected += 1500000;
      } else if (step === "edit" && !deleted) {
        putOperation({ ...spent, amount: 2200000 });
        expected += editedTo - 2200000;
        editedTo = 2200000;
      } else if (step === "delete" && !deleted) {
        deleteOperation(spent.id);
        expected += editedTo;
        deleted = true;
      }
      if (!partsOk(a, expected)) return false;
    }
    // the top-up moved money, it did not create it: both sides together
    const net = accountBalance(a.id) + accountBalance(src.id);
    const externalIn = 700000 - (deleted ? 0 : editedTo);
    if (net !== 500000 + srcBefore + externalIn) return false;
    ok++;
  }
  return ok === 24;
});

check("Card: lowering the limit below what is used or removing it moves no money", () => {
  clean();
  const a = addAccount({ opening: 0, limit: 2000000 });
  putOperation(spend(a, 1500000));
  const before = [accountBalance(a.id), overallBalance()];
  a.limit = 1000000; // below usage
  const low = cardState(a);
  const lowOk = low.creditUsed === 1000000 && low.overLimit === 500000 && low.utilization === 1.5;
  a.limit = 0; // a plain account
  const none = cardState(a) === null;
  a.limit = 2000000;
  return (
    lowOk &&
    none &&
    cardState(a).overLimit === 0 &&
    [accountBalance(a.id), overallBalance()].join() === before.join()
  );
});

check("Card: boundary amounts around zero, the limit and one unit beyond it", () => {
  clean();
  const a = addAccount({ opening: 100, limit: 1000 });
  const rows = [
    [100, { own: 0, used: 0, over: 0 }],
    [101, { own: 0, used: 1, over: 0 }],
    [1100, { own: 0, used: 1000, over: 0 }],
    [1101, { own: 0, used: 1000, over: 1 }],
  ];
  return rows.every(([amount, w]) => {
    clean();
    putOperation(spend(a, amount));
    const s = cardState(a);
    return s.own === w.own && s.creditUsed === w.used && s.overLimit === w.over;
  });
});

check("Card: state survives reload, backup round trip, history, CSV and reports", () => {
  clean();
  const a = addAccount({ opening: 500000, limit: 2000000 });
  const src = addAccount({ opening: 100000 });
  putOperation(spend(a, 3000000));
  putOperation(refund(a, 700000));
  putOperation(topUp(src, a, 50000));
  const expected = 500000 - 3000000 + 700000 + 50000;
  const copy = completeData(JSON.parse(JSON.stringify(dataSnapshot())));
  const reloaded = copy.accounts.find((x) => x.id === a.id);
  const balance =
    reloaded.opening +
    copy.ops.reduce(
      (s, o) =>
        s + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0),
      0,
    );
  const rows = reportRows(appData.ops.filter((o) => o.from === a.id || o.to === a.id));
  const spent = rows.filter((r) => r.reportType === "expense").reduce((s, r) => s + r.amount, 0);
  const csvLines = csvTable(appData.ops).rows.length;
  return (
    partsOk(a, expected) &&
    balance === expected &&
    reloaded.limit === 2000000 &&
    spent === 3000000 &&
    csvLines >= 3
  );
});

// ---- 2. Scheduled payments: date and time both count ----

// The clock of a check cannot move, so time passes by moving the payments `days` closer; a payment
// made for tomorrow then falls due `lag` days ago.
const pass = (days) => {
  for (const item of appData.scheduled) item.date = addDays(item.date, -days);
};
const TOMORROW = () => addDays(today(), 1);
const scheduledAt = (a, time, extra = {}) =>
  putOperation(
    { ...spend(a, 10000), date: TOMORROW(), time, recur: null, reminder: null, ...extra },
    true,
  );
// A payment for tomorrow that fell due `lag` days ago (0: it falls due today).
const dueAgo = (a, lag, time, extra) => {
  const item = scheduledAt(a, time, extra);
  pass(1 + lag);
  return item;
};
const postedOf = (item) => appData.ops.filter((o) => o.fromSchedule?.id === item.id);

check("Scheduled: nothing happens before its time, one posting at the exact minute", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  const item = scheduledAt(a, "18:30");
  const before = accountBalance(a.id);
  const pending = [accountBalance(a.id), overallBalance(), reportRows(appData.ops).length];
  postDue(today(), "23:59"); // tomorrow's payment is not due at any time of today
  const dayBefore = appData.ops.length === 0 && pending[0] === before;
  pass(1); // now it is for today
  postDue(today(), "18:29");
  const early = appData.ops.length === 0 && appData.scheduled.length === 1;
  postDue(today(), "18:30");
  postDue(today(), "18:30");
  postDue(today(), "23:59");
  return (
    dayBefore &&
    early &&
    postedOf(item).length === 1 &&
    accountBalance(a.id) === before - 10000 &&
    appData.scheduled.length === 0
  );
});

check("Scheduled: reopened days later it posts at once but keeps its own date and time", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  const item = dueAgo(a, 3, "18:30"); // set for 3 days ago at 18:30, reopened now
  const day = item.date;
  const manual = putOperation(spend(a, 500, { date: day, time: "09:00" }));
  postDue(today(), "09:00");
  const [posted] = postedOf(item);
  const order = [...appData.ops].sort(newestFirst).map((o) => o.id);
  return (
    !!posted &&
    posted.date === day &&
    posted.time === "18:30" &&
    typeof posted.fromSchedule.postedAt === "string" &&
    order[0] === posted.id &&
    order[1] === manual.id
  );
});

check("Scheduled: a daily payment caught up posts every due occurrence once, none twice", () => {
  clean();
  const a = addAccount({ opening: 1000000 });
  const recur = { every: 1, unit: "Days", remaining: null, days: [] };
  const item = dueAgo(a, 2, "12:00", { recur }); // due 2 days ago, yesterday and today at 12:00
  postDue(today(), "11:59"); // the two earlier days are due, today at 12:00 is not
  const first = postedOf(item).length;
  postDue(today(), "11:59");
  const same = postedOf(item).length === first;
  postDue(today(), "12:00");
  return (
    first === 2 && same && postedOf(item).length === 3 && accountBalance(a.id) === 1000000 - 30000
  );
});

check("Scheduled: monthly on the 31st keeps its day after a short month (leap and not)", () => {
  clean();
  const a = addAccount({ opening: 0 });
  const recur = { every: 1, unit: "Months", remaining: null, days: [] };
  appData.scheduled.push({
    ...spend(a, 100),
    date: "2024-01-31",
    time: "08:00",
    recur,
    reminder: null,
    anchorDay: 31,
  });
  const dates = [];
  const probe = (date) => {
    const item = { date, recur, anchorDay: 31 };
    return nextDate(item);
  };
  dates.push(probe("2024-01-31"), probe("2024-02-29"), probe("2025-01-31"), probe("2025-12-31"));
  return dates.join() === "2024-02-29,2024-03-31,2025-02-28,2026-01-31";
});

check("Scheduled: an archived source and an empty account still post (negative allowed)", () => {
  clean();
  const a = addAccount({ opening: 0, archived: true });
  const item = dueAgo(a, 0, "10:00");
  postDue(today(), "10:00");
  return postedOf(item).length === 1 && accountBalance(a.id) === -10000;
});

check("Scheduled: a payment that cannot be posted stays pending and does not block others", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  const bad = dueAgo(a, 0, "10:00");
  dueAgo(a, 0, "10:05");
  appData.scheduled.find((s) => s.id === bad.id).category = "__gone__";
  const log = console.error;
  console.error = () => {};
  postDue(today(), "11:00");
  console.error = log;
  return (
    appData.ops.length === 1 &&
    appData.scheduled.length === 1 &&
    appData.scheduled[0].id === bad.id &&
    accountBalance(a.id) === 90000
  );
});

check("Scheduled: pending changes nothing; cancelling pending vs reversing completed", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  const snapshot = () => [accountBalance(a.id), overallBalance(), reportRows(appData.ops).length];
  const start = snapshot();
  const item = scheduledAt(a, "10:00");
  const pending = snapshot();
  deleteOperation(item.id, true); // pending: there is nothing to undo
  const afterCancel = snapshot();
  const again = scheduledAt(a, "10:00");
  pass(1);
  postDue(today(), "10:00");
  const done = accountBalance(a.id) === 90000;
  deleteOperation(postedOf(again)[0].id); // completed: reversed exactly once
  return (
    start.join() === pending.join() &&
    start.join() === afterCancel.join() &&
    done &&
    snapshot().join() === start.join()
  );
});

check("Scheduled: editing an executed payment into a future one moves it back to pending", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  dueAgo(a, 0, "10:00");
  postDue(today(), "10:00");
  const posted = appData.ops[0];
  putOperation({ ...posted, date: addDays(today(), 5) });
  return (
    accountBalance(a.id) === 100000 &&
    appData.ops.length === 0 &&
    appData.scheduled.length === 1 &&
    !appData.scheduled[0].fromSchedule
  );
});

// ---- 3. Debt switches ----

const refRoles = (src, dst) => ({
  expense:
    src.type !== "Debt" || dst.type !== "Debt" ? dst.type === "Debt" && dst.considerExpense : false,
  income:
    src.type !== "Debt" || dst.type !== "Debt" ? src.type === "Debt" && src.considerIncome : false,
});
const KINDS = {
  regular: () => addAccount({ opening: 1000000 }),
  card: () => addAccount({ opening: 0, limit: 2000000 }),
  debt: (extra) =>
    addAccount({ type: "Debt", debt: "I owe", totalDebt: 1000000, opening: -500000, ...extra }),
};
check(
  "Debt switches: 5 account pairs x 4 switch states count as the reference says, never twice",
  () => {
    let cases = 0;
    const pairs = [
      ["regular", "debt"],
      ["debt", "regular"],
      ["debt", "debt"],
      ["card", "debt"],
      ["debt", "card"],
    ];
    for (const [from, to] of pairs)
      for (const ce of [false, true])
        for (const ci of [false, true]) {
          clean();
          const sw = { considerExpense: ce, considerIncome: ci };
          const s = KINDS[from](from === "debt" ? sw : {}),
            d = KINDS[to](to === "debt" ? sw : {});
          const before = accountBalance(s.id) + accountBalance(d.id);
          const t = putOperation(topUp(s, d, 100000));
          const rows = reportRows(appData.ops);
          const r = refRoles(s, d);
          const gotExp = rows.filter((x) => x.reportType === "expense").length;
          const gotInc = rows.filter((x) => x.reportType === "income").length;
          const net = accountBalance(s.id) + accountBalance(d.id);
          if (gotExp !== (r.expense ? 1 : 0) || gotInc !== (r.income ? 1 : 0)) return false;
          if (net !== before) return false; // a transfer conserves the net position
          deleteOperation(t.id);
          if (accountBalance(s.id) + accountBalance(d.id) !== before) return false;
          if (reportRows(appData.ops).length !== 0) return false;
          cases++;
        }
    return cases === 20;
  },
);

check("Debt switches: the classification follows the settings now, history is recalculated", () => {
  clean();
  const s = KINDS.regular(),
    d = KINDS.debt({ considerExpense: false });
  putOperation(topUp(s, d, 100000));
  const off = reportRows(appData.ops).length === 0;
  d.considerExpense = true;
  const on = reportRows(appData.ops).filter((x) => x.reportType === "expense").length === 1;
  return off && on;
});

check("Debt: partial repayment, overpayment, reversal and direction change keep the books", () => {
  clean();
  const s = KINDS.regular(),
    d = KINDS.debt();
  const p1 = putOperation(topUp(s, d, 200000)); // partial: -3000 left
  const partial = accountBalance(d.id) === -300000;
  putOperation(topUp(s, d, 300000)); // settled
  const settled = accountBalance(d.id) === 0;
  const over = putOperation(topUp(s, d, 50000)); // overpaid: they now owe me
  const overpaid = accountBalance(d.id) === 50000;
  deleteOperation(over.id);
  deleteOperation(p1.id);
  return (
    partial &&
    settled &&
    overpaid &&
    accountBalance(d.id) === -200000 &&
    accountBalance(s.id) === 1000000 - 300000
  );
});

// ---- 4. Excluded accounts ----

check("Excluded: leaves only the overall balance; operations still reach reports and CSV", () => {
  clean();
  for (const x of appData.accounts) x.include = false;
  const inc = addAccount({ opening: 100000 }),
    exc = addAccount({ opening: 70000, include: false });
  putOperation(spend(exc, 5000));
  putOperation(spend(inc, 2000));
  const total = overallBalance() === 98000;
  exc.include = true;
  const both = overallBalance() === 98000 + 65000;
  exc.include = false;
  const rows = reportRows(appData.ops);
  const csv = csvTable(appData.ops);
  return total && both && overallBalance() === 98000 && rows.length === 2 && csv.rows.length === 2;
});

check("Excluded: toggling inclusion before or after operations gives the same totals", () => {
  const run = (toggleFirst) => {
    clean();
    for (const x of appData.accounts) x.include = false;
    const a = addAccount({ opening: 100000, include: toggleFirst ? false : true });
    putOperation(spend(a, 3000));
    a.include = !toggleFirst;
    a.include = false;
    a.include = true;
    return [overallBalance(), reportRows(appData.ops).length];
  };
  return run(true).join() === run(false).join() && run(true)[0] === 97000;
});

// ---- 5. Currency and precision ----

check("Currency: conversion rounds each amount once and reversal restores the balance", () => {
  clean();
  const prev = { ...appData.rates };
  appData.rates = { ...appData.rates, EUR: 1.0333333, KGS: 0.0117 };
  const eur = addAccount({ opening: 12345, currency: "EUR" });
  const base = appData.settings.currency;
  const t0 = overallBalance();
  const o = putOperation(spend(eur, 3333));
  const converted =
    overallBalance() ===
    t0 - (convertCurrency(12345, "EUR", base) - convertCurrency(12345 - 3333, "EUR", base));
  deleteOperation(o.id);
  appData.rates = prev;
  return converted && accountBalance(eur.id) === 12345 && Number.isInteger(overallBalance());
});

check("Currency: a transfer between currencies is balanced by the entered received amount", () => {
  clean();
  const prev = { ...appData.rates };
  appData.rates = { ...appData.rates, EUR: 1.0333333 };
  const a = addAccount({ opening: 100000 }),
    e = addAccount({ opening: 0, currency: "EUR" });
  const t = putOperation({ ...topUp(a, e, 10001), receive: 9678 });
  const ok = accountBalance(a.id) === 100000 - 10001 && accountBalance(e.id) === 9678;
  deleteOperation(t.id);
  appData.rates = prev;
  return ok && accountBalance(a.id) === 100000 && accountBalance(e.id) === 0;
});

check("Atomic: a refused operation leaves every balance as it was", () => {
  clean();
  const a = addAccount({ opening: 100000 });
  const before = JSON.stringify(appData.ops) + accountBalance(a.id);
  let threw = 0;
  for (const bad of [
    spend(a, 0),
    spend(a, -5),
    { ...spend(a, 100), category: "__gone__" },
    topUp(a, { id: "__nobody__" }, 100),
  ])
    try {
      putOperation(bad);
    } catch {
      threw++;
    }
  return threw === 4 && JSON.stringify(appData.ops) + accountBalance(a.id) === before;
});
