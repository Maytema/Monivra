/* Built-in self checks */
import { rootView } from "./shell.js";
import { TODAY, deepClone } from "../core/constants.js";
import { appData, firstLaunch, setAppData, setFirstLaunch, uiState } from "../core/state.js";
import { parseCSV } from "../data/csv.js";
import { createSampleData } from "../data/sample.js";
import { isValidData } from "../data/storage.js";
import { applyFees } from "../domain/fees.js";
import {
  accountBalance,
  accountById,
  categoryTotal,
  convertCurrency,
  debtDirection,
  evaluateExpression,
  operationMatchesFilters,
  overallBalance,
  reportRows,
} from "../domain/finance.js";
import { typeKey } from "../domain/keypad.js";
import {
  changeAccountCurrency,
  changeMainCurrency,
  nextDate,
  reorderedList,
  validateOp,
} from "../domain/operations.js";

// Built-in regression checks on sample data; returns a list of {name, pass}. Run from the console: Monivra.runSelfChecks().
export function runSelfChecks() {
  const userData = appData,
    userFirstLaunch = firstLaunch;
  setAppData(createSampleData());
  setFirstLaunch(false);
  try {
    return checkAll();
  } finally {
    setAppData(userData);
    setFirstLaunch(userFirstLaunch);
  }
}

// The checks themselves; they work on whatever data is current.
function checkAll() {
  const results = [];
  const test = (name, fn) => {
    try {
      if (fn() === false) throw Error("Mismatch");
      results.push({ name, pass: true });
    } catch (e) {
      results.push({ name, pass: false, error: e.message });
    }
  };
  test("Arithmetic precedence", () => evaluateExpression("12+3×4") === 2400);
  test("Decimal accuracy", () => evaluateExpression("0.1+0.2") === 30);
  test("Keypad editing", () => {
    const typed = ["7", "+", "⌫", "⌫"].reduce((expr, k) => typeKey(expr, k), "0");
    return typed === "0" && typeKey("0", ".") === "0." && typeKey("12", "5", true) === "5";
  });
  test("Reject division by zero", () => {
    try {
      evaluateExpression("1/0");
      return false;
    } catch {
      return true;
    }
  });
  test("Stored schema", () => isValidData(appData));
  test("Fees apply one after another on the running amount", () => {
    const commission = { kind: "commission", percent: 3.5, value: 0, add: false };
    const tax = { kind: "tax", percent: 5, value: 0, add: false };
    const first = applyFees(50000, [commission, tax]);
    return (
      first.steps[0].delta === -1750 &&
      first.steps[1].delta === -2413 &&
      first.net === 45838 &&
      applyFees(50000, [tax, commission]).net === 45838 &&
      applyFees(1000, [{ kind: "tax", percent: 0, value: 2, add: true }]).net === 1200
    );
  });
  test("Relabeling an account currency keeps its amounts and changes the total by the rate", () => {
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
  test("Cross-currency amounts convert both ways within one minor unit", () => {
    const usd = 12345;
    const back = convertCurrency(convertCurrency(usd, "USD", "KGS"), "KGS", "USD");
    return Math.abs(back - usd) <= 1;
  });
  test("Income edit updates account and overall totals", () => {
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
        allFirst - overallBefore ===
          convertCurrency(350000, a.currency, appData.settings.currency) &&
        overallBalance() - allFirst ===
          convertCurrency(360000, a.currency, appData.settings.currency) -
            convertCurrency(350000, a.currency, appData.settings.currency)
      );
    } finally {
      appData.ops = ops;
    }
  });
  test("Deleting an account reverses linked transfer on remaining account", () => {
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
  test("Debt transfer classified once per direction with all four toggles", () => {
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
  test("Fees: the account pays in full, the category and the receiver get the rest", () => {
    const accounts = appData.accounts,
      ops = appData.ops,
      categories = appData.categories;
    try {
      const cash = {
          ...accounts[0],
          id: "__fee_cash",
          opening: 100000,
          include: true,
          archived: false,
        },
        card = { ...cash, id: "__fee_card", opening: 0 };
      const category = { ...categories.find((c) => c.type === "expense"), id: "__fee_cat" };
      appData.accounts = [...accounts, cash, card];
      appData.categories = [...categories, category];
      appData.ops = [...ops];
      const fees = [
        { kind: "commission", percent: 3.5, value: 0, add: false },
        { kind: "tax", percent: 5, value: 0, add: false },
      ];
      const expense = {
        id: "__fee_expense",
        type: "expense",
        from: cash.id,
        category: category.id,
        amount: 50000,
        fees,
        date: TODAY,
        tags: [],
      };
      const transfer = {
        id: "__fee_transfer",
        type: "transfer",
        from: cash.id,
        to: card.id,
        amount: 50000,
        fees,
        date: TODAY,
        tags: [],
      };
      validateOp(expense);
      validateOp(transfer);
      appData.ops = [...ops, expense, transfer];
      const row = reportRows([expense])[0];
      return (
        accountBalance(cash.id) === 0 &&
        accountBalance(card.id) === 45838 &&
        transfer.receive === 45838 &&
        convertCurrency(row.reportAmount, appData.settings.currency, cash.currency) === 45838
      );
    } finally {
      appData.accounts = accounts;
      appData.categories = categories;
      appData.ops = ops;
    }
  });
  test("Reordering a group of accounts keeps the other groups in place", () => {
    const list = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    return (
      reorderedList(list, ["c", "a", "e"])
        .map((x) => x.id)
        .join("") === "cbade"
    );
  });
  test("Scheduled operations do not alter current balance", () => {
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
  test("Adjustment edit and delete reconcile balances", () => {
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
  // Runs `fn` on a throwaway copy of the data and puts the real data back afterwards.
  const onCopy = (fn) => {
    const saved = appData;
    setAppData(deepClone(saved));
    try {
      return fn();
    } finally {
      setAppData(saved);
    }
  };
  const addAccount = (fields) => {
    const a = {
      id: "__t" + appData.accounts.length,
      name: "T",
      type: "Regular",
      currency: appData.settings.currency,
      opening: 0,
      include: true,
      archived: false,
      goal: 0,
      limit: 0,
      debt: "Owe me",
      ...fields,
    };
    appData.accounts.push(a);
    return a;
  };
  const transfer = (from, to, amount) =>
    appData.ops.push({
      id: "__o" + appData.ops.length,
      type: "transfer",
      from: from.id,
      to: to.id,
      amount,
      receive: amount,
      date: TODAY,
      tags: [],
      comment: "",
    });
  test("A debt shown as a category counts each direction in its own tab", () =>
    onCopy(() => {
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
    }));
  test("Paying a debt back in excess turns its direction around", () =>
    onCopy(() => {
      appData.ops = [];
      const cash = addAccount({ opening: 1000000 }),
        loan = addAccount({ type: "Debt", debt: "I owe", opening: -100000 });
      transfer(cash, loan, 100000);
      const settled = debtDirection(loan);
      transfer(cash, loan, 20000);
      return (
        settled === "I owe" && accountBalance(loan.id) === 20000 && debtDirection(loan) === "Owe me"
      );
    }));
  test("Changing an account currency converts the amounts or keeps the numbers", () =>
    onCopy(() => {
      appData.ops = [];
      const cash = addAccount({ opening: 100000 }),
        usd = addAccount({ currency: "USD", opening: 10000 });
      transfer(cash, usd, 87500);
      appData.ops.at(-1).receive = 1000;
      const balance = accountBalance(usd.id);
      changeAccountCurrency(usd.id, "EUR", false);
      const kept = accountBalance(usd.id) === balance && accountById(usd.id).currency === "EUR";
      changeAccountCurrency(usd.id, "USD", false);
      changeAccountCurrency(usd.id, "EUR", true);
      return (
        kept &&
        accountById(usd.id).opening === convertCurrency(10000, "USD", "EUR") &&
        appData.ops.at(-1).receive === convertCurrency(1000, "USD", "EUR") &&
        accountBalance(cash.id) === 100000 - 87500
      );
    }));
  test("Main currency change carries categories and budget limits along", () =>
    onCopy(() => {
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
    }));
  test("Debt switches are independent", () => {
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
  test("More root navigation", () => {
    const oldTab = uiState.tab,
      oldPages = uiState.pages;
    uiState.tab = "more";
    uiState.pages = [];
    const view = rootView();
    uiState.tab = oldTab;
    uiState.pages = oldPages;
    return view.includes("more-menu") && view.includes('class="navbar');
  });
  test("Calendar month clamping", () =>
    nextDate({
      date: "2026-01-31",
      recur: { every: 1, unit: "Months", remaining: null },
    }) === "2026-02-28");
  test("Finite recurrence", () =>
    nextDate({
      date: TODAY,
      recur: { every: 1, unit: "Days", remaining: 1 },
    }) === null);
  test("CSV escaped fields", () =>
    parseCSV(
      'type,date,amount,currency,from,to,category,comment\nexpense,2026-10-12,1,KGS,Wallet,,Food,"a,b"',
    )[0].comment === "a,b");
  return results;
}
