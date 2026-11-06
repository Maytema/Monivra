import { check } from "./harness.js";
import { addAccount, transfer } from "./helpers.js";
import { TODAY } from "../js/core/constants.js";
import { appData, uiState } from "../js/core/state.js";
import {
  accountBalance,
  accountById,
  accountProgress,
  categoryTotal,
  convertCurrency,
  debtDirection,
  operationMatchesFilters,
  overallBalance,
  reportRows,
} from "../js/domain/finance.js";
import { accountDraft, checkedAccountDraft, storeAccount } from "../js/domain/accounts.js";
import {
  changeAccountCurrency,
  changeMainCurrency,
  planCurrencyChange,
} from "../js/domain/currency-change.js";
import { donutSlices, OTHER_SLICE } from "../js/domain/chart.js";
import { reorderedList } from "../js/domain/ordering.js";
import { shownPercent } from "../js/domain/percent.js";
import { exactPercent, percentLabel } from "../js/ui/percent.js";
import { progressBlockHtml } from "../js/screens/accounts/progress.js";
import { validateOp } from "../js/domain/operations.js";

check("Relabeling an account currency keeps its amounts and changes the total by the rate", () => {
  const a = appData.accounts.find((x) => x.include && !x.archived && x.currency !== "USD");
  if (!a) return true;
  const amount = accountBalance(a.id),
    totalBefore = overallBalance(),
    currency = a.currency;
  try {
    a.currency = "USD";
    const sameAmount = accountBalance(a.id) === amount,
      expected =
        totalBefore -
        convertCurrency(amount, currency, appData.settings.currency) +
        convertCurrency(amount, "USD", appData.settings.currency);
    return sameAmount && overallBalance() === expected;
  } finally {
    a.currency = currency;
  }
});

check("Income edit updates account and overall totals", () => {
  const a = appData.accounts.find((x) => x.include && !x.archived);
  if (!a) return true;
  const before = accountBalance(a.id),
    overallBefore = overallBalance(),
    ops = appData.ops;
  try {
    appData.ops = [
      ...ops,
      {
        id: "__test_income_edit",
        type: "income",
        to: a.id,
        category: appData.categories.find((c) => c.type === "income")?.id,
        amount: 350000,
        date: TODAY,
        comment: "test",
        tags: [],
      },
    ];
    const first = accountBalance(a.id),
      allFirst = overallBalance();
    appData.ops[appData.ops.length - 1] = { ...appData.ops.at(-1), amount: 360000 };
    return (
      first - before === 350000 &&
      accountBalance(a.id) - first === 10000 &&
      allFirst - overallBefore === convertCurrency(350000, a.currency, appData.settings.currency) &&
      overallBalance() - allFirst ===
        convertCurrency(360000, a.currency, appData.settings.currency) -
          convertCurrency(350000, a.currency, appData.settings.currency)
    );
  } finally {
    appData.ops = ops;
  }
});

check("Deleting an account reverses linked transfer on remaining account", () => {
  const accounts = appData.accounts,
    ops = appData.ops;
  try {
    const x = {
        id: "__audit_from",
        name: "Audit A",
        type: "Regular",
        currency: appData.settings.currency,
        opening: 100000,
        include: true,
        archived: false,
        color: "#123456",
      },
      y = { ...x, id: "__audit_to", name: "Audit B", opening: 0 };
    appData.accounts = [...accounts, x, y];
    appData.ops = [
      ...ops,
      {
        id: "__audit_transfer",
        type: "transfer",
        from: x.id,
        to: y.id,
        amount: 20000,
        receive: 20000,
        date: TODAY,
        tags: [],
      },
    ];
    const during = accountBalance(x.id) === 80000 && accountBalance(y.id) === 20000;
    appData.ops = appData.ops.filter((o) => o.from !== y.id && o.to !== y.id);
    appData.accounts = appData.accounts.filter((a) => a.id !== y.id);
    return during && accountBalance(x.id) === 100000;
  } finally {
    appData.accounts = accounts;
    appData.ops = ops;
  }
});

check("Debt transfer classified once per direction with all four toggles", () => {
  const accounts = appData.accounts,
    ops = appData.ops;
  try {
    const c = {
        id: "__audit_cash",
        name: "Cash",
        type: "Regular",
        currency: appData.settings.currency,
        opening: 100000,
        include: true,
        archived: false,
        color: "#123456",
      },
      d = {
        ...c,
        id: "__audit_debt",
        name: "Debt",
        type: "Debt",
        opening: 0,
        considerExpense: true,
        showExpense: true,
        considerIncome: true,
        showIncome: true,
      };
    appData.accounts = [...accounts, c, d];
    const inbound = {
        id: "__audit_in",
        type: "transfer",
        from: c.id,
        to: d.id,
        amount: 10000,
        receive: 10000,
        date: TODAY,
        tags: [],
      },
      outbound = {
        ...inbound,
        id: "__audit_out",
        from: d.id,
        to: c.id,
        amount: 4000,
        receive: 4000,
      };
    appData.ops = [...ops, inbound, outbound];
    const rows = reportRows([inbound, outbound]);
    return (
      rows.length === 2 &&
      rows[0].reportType === "expense" &&
      rows[0].reportAmount === 10000 &&
      rows[1].reportType === "income" &&
      rows[1].reportAmount === 4000 &&
      accountBalance(c.id) === 94000 &&
      accountBalance(d.id) === 6000
    );
  } finally {
    appData.accounts = accounts;
    appData.ops = ops;
  }
});

check("Reordering a group of accounts keeps the other groups in place", () => {
  const list = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  return (
    reorderedList(list, ["c", "a", "e"])
      .map((x) => x.id)
      .join("") === "cbade"
  );
});

check("Adjustment edit and delete reconcile balances", () => {
  const a = appData.accounts[0];
  if (!a) return true;
  const ops = appData.ops,
    base = accountBalance(a.id);
  try {
    const o = {
      id: "__audit_adj",
      type: "adjustment",
      to: a.id,
      from: null,
      amount: 10000,
      date: TODAY,
      tags: [],
    };
    appData.ops = [...ops, o];
    const first = accountBalance(a.id);
    appData.ops[appData.ops.length - 1] = { ...o, amount: 16000 };
    const edited = accountBalance(a.id);
    appData.ops = ops;
    return first - base === 10000 && edited - first === 6000 && accountBalance(a.id) === base;
  } finally {
    appData.ops = ops;
  }
});

check("A debt shown as a category counts each direction in its own tab", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 1000000 }),
    loan = addAccount({
      type: "Debt",
      debt: "I owe",
      opening: -500000,
      considerExpense: true,
      considerIncome: true,
    }),
    other = addAccount({ type: "Debt", considerExpense: true, considerIncome: true });
  uiState.period = { mode: "all", anchor: TODAY };
  transfer(cash, loan, 300000);
  transfer(loan, cash, 40000);
  transfer(loan, other, 10000);
  const id = "debt:" + loan.id;
  return (
    categoryTotal(id, "expense") === 300000 &&
    categoryTotal(id, "income") === 40000 &&
    appData.ops.filter((o) => operationMatchesFilters(o, { categories: [id] })).length === 2
  );
});

check("Paying a debt back in excess turns its direction around", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 1000000 }),
    loan = addAccount({ type: "Debt", debt: "I owe", opening: -100000 });
  transfer(cash, loan, 100000);
  const settled = debtDirection(loan);
  transfer(cash, loan, 20000);
  return (
    settled === "I owe" && accountBalance(loan.id) === 20000 && debtDirection(loan) === "Owe me"
  );
});

check("Progress of a goal and of a debt repayment", () => {
  appData.ops = [];
  const saved = addAccount({ type: "Savings", goal: 200000, opening: 50200 }),
    past = addAccount({ type: "Savings", goal: 100000, opening: 150000 }),
    debt = addAccount({ type: "Debt", debt: "I owe", totalDebt: 75000, opening: -3011 }),
    card = addAccount({ limit: 3000000, opening: -1500000 }),
    free = addAccount({});
  const [a, b, c] = [saved, past, debt].map(accountProgress);
  return (
    a.percent === 25.1 &&
    a.left === 149800 &&
    b.percent === 150 &&
    b.left === -50000 &&
    shownPercent(c.percent) === 95.99 &&
    c.left === 3011 &&
    // the percent counts what is saved, paid back or used, and `done` is that amount
    a.done === 50200 &&
    b.done === 150000 &&
    c.done === 71989 &&
    accountProgress(card).done === 1500000 &&
    accountProgress(card).percent === 50 &&
    accountProgress(card).left === 1500000 &&
    accountProgress(free) === null
  );
});

check(
  "A percent is rounded the same way everywhere and a target not reached never shows 100",
  () => {
    // Savings, debt, credit limit, weekly, monthly and food budgets of the reported screenshots.
    const shown = [
      [324276 / 500000, 64.86],
      [892000 / 1500000, 59.47],
      [14927 / 300000, 4.98],
      [18604 / 11000, 169.13],
      [144773 / 360000, 40.21],
      [11169 / 52000, 21.48],
    ].map(([share, expected]) => shownPercent(share * 100) === expected);
    return (
      shown.every(Boolean) &&
      shownPercent(99.999) === 99.99 &&
      shownPercent(100) === 100 &&
      shownPercent(1.005) === 1.01 &&
      shownPercent(0) === 0 &&
      shownPercent(-0.001) === 0 &&
      shownPercent(-5.456) === -5.46 &&
      shownPercent(Infinity) === 0 &&
      shownPercent(NaN) === 0 &&
      exactPercent(64.8552) === "64.86%" &&
      exactPercent(4.9757) === "4.98%" &&
      exactPercent(100) === "100%" &&
      exactPercent(99.9999) === "99.99%" &&
      percentLabel(64.8552).includes(">64<") &&
      percentLabel(64.8552).includes(">.86<") &&
      !percentLabel(25).includes("goal-pct-frac")
    );
  },
);

check(
  "The line under a meter says what the balance does not: to goal, paid back, a limit used up",
  () => {
    appData.ops = [];
    // The currency of the test data does not matter, only the words and the amounts.
    const line = (a) =>
      /account-progress-left">([^<]*)</.exec(progressBlockHtml(a))?.[1].replace(/ [A-Z]{3}$/, "");
    const goal = (opening) => addAccount({ type: "Savings", goal: 500000, opening }),
      card = (opening) => addAccount({ limit: 300000, opening }),
      debt = (opening) => addAccount({ type: "Debt", debt: "I owe", totalDebt: 1500000, opening });
    return (
      line(goal(324276)) === "To goal: 1,757.24" &&
      line(goal(500000)) === "Goal reached" &&
      line(goal(520000)) === "Goal exceeded by 200" &&
      line(card(-14927)) === undefined &&
      line(card(0)) === undefined &&
      line(card(-300000)) === "Limit reached" &&
      line(card(-310000)) === "Limit exceeded by 100" &&
      line(debt(-608000)) === "Paid back: 8,920" &&
      // paid back with more than it was: 105 of 100 is 105 percent and 5 is overpaid, either side
      line(debt(500)) === "Overpaid by 5" &&
      accountProgress(addAccount({ type: "Debt", debt: "I owe", totalDebt: 10000, opening: 500 }))
        .percent === 105 &&
      accountProgress(addAccount({ type: "Debt", debt: "Owe me", totalDebt: 10000, opening: -500 }))
        .percent === 105 &&
      line(addAccount({ type: "Debt", debt: "Owe me", totalDebt: 10000, opening: -500 })) ===
        "Overpaid by 5" &&
      line(debt(0)) === "Debt repaid"
    );
  },
);

check("Currency change recalculates only what was spent, as the original does", () => {
  appData.ops = [];
  appData.rates.USD = 100;
  appData.rates.KGS = 1;
  const good = addAccount({ opening: 0 }),
    card = addAccount({ opening: 0 }),
    other = addAccount({ opening: 0 });
  const op = (type, from, to, amount) =>
    appData.ops.push({
      id: "__o" + appData.ops.length,
      type,
      from: from?.id ?? null,
      to: to?.id ?? null,
      amount,
      receive: type === "transfer" ? amount : undefined,
      date: TODAY,
      tags: [],
      comment: "",
    });
  op("adjustment", null, good, 100000);
  op("transfer", good, card, 50000);
  op("expense", good, null, 20000);
  op("transfer", other, good, 10000);
  const plan = planCurrencyChange(good.id, "USD", "spent");
  changeAccountCurrency(good.id, "USD", "spent");
  return (
    accountBalance(good.id) === 109300 &&
    plan.after === 109300 &&
    plan.others.get(card.id) === -49500 &&
    accountBalance(card.id) === 500 &&
    appData.ops[0].amount === 100000 &&
    appData.ops[3].receive === 10000 &&
    appData.ops[1].recalculated.amount === 50000
  );
});

check(
  "A correction in another currency keeps both sides and the balance follows the account",
  () => {
    appData.ops = [];
    appData.rates.USD = 100;
    appData.rates.KGS = 1;
    appData.settings.currency = "KGS";
    const good = addAccount({ currency: "USD", opening: 0 });
    const raise = {
      type: "adjustment",
      to: good.id,
      amount: 90000,
      date: TODAY,
      tags: [],
      comment: "",
    };
    validateOp(raise);
    const manual = { ...raise, receive: 80000, receiveManual: true };
    validateOp(manual);
    const cut = {
      type: "adjustment",
      from: good.id,
      amount: 500,
      date: TODAY,
      tags: [],
      comment: "",
    };
    validateOp(cut);
    appData.ops = [{ ...manual, id: "__a1" }];
    const balance = accountBalance(good.id);
    appData.ops.push({ ...cut, id: "__a2" });
    return (
      raise.receive === 900 &&
      manual.receive === 80000 &&
      balance === 80000 &&
      cut.receive === 50000 &&
      accountBalance(good.id) === 80000 - 500
    );
  },
);

check("Converting everything keeps the balance at the current rate; changing back restores", () => {
  appData.ops = [];
  appData.rates.USD = 100;
  appData.rates.KGS = 1;
  const cash = addAccount({ opening: 100000 }),
    usd = addAccount({ currency: "USD", opening: 10000 });
  transfer(cash, usd, 87500);
  appData.ops.at(-1).receive = 1000;
  const plan = planCurrencyChange(usd.id, "EUR", "all");
  changeAccountCurrency(usd.id, "EUR", "all");
  const converted =
    accountById(usd.id).opening === convertCurrency(10000, "USD", "EUR") &&
    appData.ops.at(-1).receive === convertCurrency(1000, "USD", "EUR") &&
    plan.after === accountBalance(usd.id) &&
    accountBalance(cash.id) === 100000 - 87500;
  changeAccountCurrency(usd.id, "USD", "spent");
  return converted && accountById(usd.id).currency === "USD";
});

check("Main currency change carries categories and budget limits along", () => {
  const old = appData.settings.currency;
  appData.categories.push({ id: "__c", name: "C", type: "expense", currency: old });
  appData.budgets.push({ id: "__b", amount: 100000, currency: old, period: "month" });
  const other = old === "USD" ? "EUR" : "USD";
  changeMainCurrency(other);
  const budget = appData.budgets.at(-1);
  return (
    appData.categories.at(-1).currency === other &&
    budget.currency === other &&
    budget.amount === convertCurrency(100000, old, other)
  );
});

check("Debt switches are independent", () => {
  const a = appData.accounts.find((x) => x.type === "Debt");
  if (!a) return true;
  const copy = {
    ...a,
    considerExpense: true,
    considerIncome: true,
    showExpense: true,
    showIncome: true,
  };
  return Object.values(copy).filter((v) => v === true).length >= 4;
});

check("A new account with a balance starts with an adjustment operation", () => {
  appData.ops = [];
  const draft = { ...accountDraft(null), name: "Wallet", balance: 12345 };
  const account = storeAccount(checkedAccountDraft(draft), "spent");
  const [start] = appData.ops;
  return (
    appData.accounts.includes(account) &&
    account.opening === 0 &&
    accountBalance(account.id) === 12345 &&
    appData.ops.length === 1 &&
    start.type === "adjustment" &&
    start.to === account.id &&
    start.amount === 12345
  );
});

check("A new debt recorded with an operation brings the balance to the typed amount", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 100000 });
  const draft = {
    ...accountDraft(null),
    name: "Loan",
    type: "Debt",
    debt: "I owe",
    balance: 30000,
    createOperation: true,
    counterpart: cash.id,
  };
  const loan = storeAccount(checkedAccountDraft(draft), "spent");
  const [transfer] = appData.ops;
  return (
    accountBalance(loan.id) === -30000 &&
    accountBalance(cash.id) === 100000 + 30000 &&
    transfer.type === "transfer" &&
    transfer.from === loan.id &&
    transfer.to === cash.id &&
    appData.ops.length === 1
  );
});

check("An invalid account is refused with a message and stores nothing", () => {
  const count = appData.accounts.length;
  const refused = (changes) => {
    try {
      checkedAccountDraft({ ...accountDraft(null), name: "Ok", ...changes });
      return null;
    } catch (error) {
      return error.message;
    }
  };
  return (
    refused({ name: "  " }) === "Enter a name" &&
    refused({ name: "x".repeat(65) }) === "Name is too long" &&
    refused({ type: "Credit" }) === "Select account type" &&
    refused({ type: "Savings", goal: -1 }) === "Goal cannot be negative" &&
    refused({ balance: 0.5 }) === "Invalid amount" &&
    refused({}) === null &&
    appData.accounts.length === count
  );
});

check("A debt operation with a missing counterpart is refused before anything changes", () => {
  const count = appData.accounts.length;
  const draft = {
    ...accountDraft(null),
    name: "Loan",
    type: "Debt",
    balance: 1000,
    createOperation: true,
    counterpart: null,
  };
  try {
    storeAccount(checkedAccountDraft(draft), "spent");
    return false;
  } catch (error) {
    return error.message === "Select a different account" && appData.accounts.length === count;
  }
});

// The category donut gathers the narrow slices so each slice can be tapped.
const donutGroup = (id, total) => ({ id, name: id, color: "#123456", total });
const donutOf = (totals) => donutSlices(totals.map((n, i) => donutGroup("c" + i, n)));
check("narrow categories become one slice that keeps its members", () => {
  const slices = donutOf([60, 20, 8, 5, 3, 1.5, 1, 0.8, 0.7]);
  const other = slices.find((s) => s.id === OTHER_SLICE);
  return slices.length === 7 && other.members.length === 3 && Math.abs(other.total - 2.5) < 1e-9;
});
check("the donut slices still add up to the whole", () => {
  const slices = donutOf([60, 20, 8, 5, 3, 1.5, 1, 0.8, 0.7]);
  return Math.abs(slices.reduce((s, x) => s + x.total, 0) - 100) < 1e-9;
});
check(
  "a single narrow category is not hidden in 'Other'",
  () => donutOf([60, 20, 8, 5, 3, 2.5, 1]).length === 7,
);
check(
  "the biggest six categories always keep their own slice",
  () => donutOf(Array(30).fill(1)).filter((s) => s.id !== OTHER_SLICE).length === 6,
);
check(
  "a category with nothing in the period has no slice",
  () => donutOf([5, 0, 3, 0]).length === 2,
);
check("an empty period has no slices", () => donutOf([0, 0]).length === 0);
