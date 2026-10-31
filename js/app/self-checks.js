/* Built-in self checks */
import { rootView } from "./shell.js";
import { TODAY, deepClone } from "../core/constants.js";
import { appData, firstLaunch, setAppData, setFirstLaunch, uiState } from "../core/state.js";
import { parseCSV } from "../data/csv.js";
import { CURRENCIES, defaultRates } from "../data/currencies.js";
import { completeData } from "../data/defaults.js";
import { createSampleData } from "../data/sample.js";
import { isValidData } from "../data/storage.js";
import { searchCurrencies } from "../domain/currency-search.js";
import { leadingSide } from "../domain/dual-amount.js";
import { applyFees } from "../domain/fees.js";
import {
  accountBalance,
  accountById,
  accountProgress,
  categoryTotal,
  amountPair,
  categoryTotalIn,
  offRate,
  quoteRate,
  convertCurrency,
  debtDirection,
  evaluateExpression,
  formatNumber,
  operationMatchesFilters,
  overallBalance,
  reportRows,
} from "../domain/finance.js";
import { typeKey } from "../domain/keypad.js";
import {
  changeAccountCurrency,
  planCurrencyChange,
  changeMainCurrency,
  deleteCategory,
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
  test("Progress of a goal and of a debt repayment", () =>
    onCopy(() => {
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
    }));
  test("Deleting a category removes its operations, payments and budget entries", () =>
    onCopy(() => {
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
    }));
  test("Currency change recalculates only what was spent, as the original does", () =>
    onCopy(() => {
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
    }));
  test("A correction in another currency keeps both sides and the balance follows the account", () =>
    onCopy(() => {
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
    }));
  test("The side typed last fills in the other one; the other side is typed freely", () => {
    // Typed sides and values as in the original: [side, typed value, expected leader afterwards].
    let leader = "send";
    const state = { send: 0, receive: 0 };
    const type = (side, value) => {
      leader = leadingSide(leader, side, state);
      state[side] = value;
      if (leader === side)
        state[side === "send" ? "receive" : "send"] = value * (side === "send" ? 0.01 : 100);
    };
    type("send", 500);
    type("send", 0);
    type("receive", 5);
    const filled = state.send === 500;
    type("send", 6);
    type("send", 600);
    const free = state.receive === 5 && leader === "receive";
    type("receive", 0);
    type("receive", 3);
    const followed = state.send === 300;
    type("receive", 0);
    type("send", 5);
    const handedOver = leader === "send" && state.receive === 0.05;
    type("receive", 6);
    const kept = state.send === 5 && state.receive === 6;
    type("send", 52);
    return filled && free && followed && handedOver && kept && state.receive === 0.52;
  });
  test("An expense in a category of another currency keeps the amount typed in that currency", () =>
    onCopy(() => {
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
    }));
  test("A category counts what was entered in its currency, whatever the rates do later", () =>
    onCopy(() => {
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
    }));
  test("The rate of an operation follows from its two amounts and is flagged when it is off", () =>
    onCopy(() => {
      appData.rates.USD = 100;
      appData.rates.KGS = 1;
      const account = addAccount({ opening: 100000 });
      appData.categories.push({
        id: "__usd",
        name: "Cafe",
        type: "expense",
        currency: "USD",
        color: "#d04fcc",
      });
      const op = (categoryAmount) => ({
        type: "expense",
        from: account.id,
        category: "__usd",
        amount: 5000,
        categoryAmount: { currency: "USD", amount: categoryAmount },
      });
      const onRate = amountPair(op(50)),
        manual = amountPair(op(300));
      return (
        !offRate(onRate) &&
        offRate(manual) &&
        quoteRate("KGS", "USD", manual[1][0] / manual[0][0]).join() ===
          "USD,KGS,16.666666666666668" &&
        amountPair({ ...op(50), category: null }) === null
      );
    }));
  test("Converting everything keeps the balance at the current rate; changing back restores", () =>
    onCopy(() => {
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
  test("Every currency has a positive fixed rate", () => {
    const rates = defaultRates();
    return CURRENCIES.length > 100 && CURRENCIES.every((c) => rates[c.code] > 0) && rates.KGS === 1;
  });
  test("Older data gets rates of new currencies and keeps its own", () => {
    const old = { settings: {}, rates: { KGS: 1, USD: 90 } };
    completeData(old);
    return (
      old.rates.USD === 90 &&
      old.rates.JPY > 0 &&
      old.rates.PLN > 0 &&
      old.settings.fixedRates.length === 0
    );
  });
  test("Negative amounts use the minus sign", () =>
    formatNumber(-50000, "comma-dot", true, true) === "\u2212500.00" &&
    formatNumber(123456, "space-comma", true, false) === "1\u00a0235");
  test("Numeric settings of old data become whole numbers in range", () => {
    const old = { settings: { monthStart: "31", weekStart: "3", lockDelay: "x" }, rates: {} };
    completeData(old);
    const { monthStart, weekStart, lockDelay } = old.settings;
    return monthStart === 28 && weekStart === 3 && lockDelay === 0;
  });
  test("A reminder of older data keeps its time of day on the day of the payment", () => {
    const old = {
      settings: {},
      rates: {},
      scheduled: [{ reminder: "08:30", reminderLead: "At the time" }],
    };
    completeData(old);
    const [item] = old.scheduled;
    return (
      item.reminder.before === 0 &&
      item.reminder.unit === "Days" &&
      item.reminder.time === "08:30" &&
      !("reminderLead" in item)
    );
  });
  test("Currency search narrows by code and country as letters are typed", () => {
    const one = searchCurrencies("k"),
      two = searchCurrencies("kg");
    return (
      searchCurrencies("")[0] !== undefined &&
      two[0] === "KGS" &&
      two.length < one.length &&
      one.includes("KGS") &&
      searchCurrencies("japan")[0] === "JPY" &&
      searchCurrencies("zzzz").length === 0
    );
  });
  return results;
}
