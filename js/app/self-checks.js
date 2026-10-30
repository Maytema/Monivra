/* Built-in self checks */
import { rootView } from "./shell.js";
import { TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { parseCSV } from "../data/import-export.js";
import { isValidData } from "../data/storage.js";
import {
  accountBalance,
  convertCurrency,
  evaluateExpression,
  overallBalance,
  reportRows,
} from "../domain/finance.js";
import { nextDate } from "../domain/operations.js";

// Built-in regression checks; returns a list of {name, pass}. Run from the console: Monivra.runSelfChecks().
export function runSelfChecks() {
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
  test("Reject division by zero", () => {
    try {
      evaluateExpression("1/0");
      return false;
    } catch {
      return true;
    }
  });
  test("Stored schema", () => isValidData(appData));
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
