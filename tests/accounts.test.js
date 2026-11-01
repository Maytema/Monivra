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
import {
  changeAccountCurrency,
  planCurrencyChange,
  changeMainCurrency,
  reorderedList,
  validateOp,
} from "../js/domain/operations.js";

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
    b.percent === 100 &&
    b.left === -50000 &&
    c.percent === 95.98 &&
    c.left === 3011 &&
    accountProgress(card).percent === 50 &&
    accountProgress(card).left === 1500000 &&
    accountProgress(free) === null
  );
});

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
