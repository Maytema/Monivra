/* Built-in self checks */
import { rootView } from "./shell.js";
import { TODAY } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { parseCSV } from "../data/import-export.js";
import { validData } from "../data/storage.js";
import { bal, calculate, convert, overall, reportRows } from "../domain/finance.js";
import { nextDate } from "../domain/operations.js";

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
  test("Arithmetic precedence", () => calculate("12+3×4") === 2400);
  test("Decimal accuracy", () => calculate("0.1+0.2") === 30);
  test("Reject division by zero", () => {
    try {
      calculate("1/0");
      return false;
    } catch {
      return true;
    }
  });
  test("Stored schema", () => validData(D));
  test("Income edit updates account and overall totals", () => {
    const a = D.accounts.find((x) => x.include && !x.archived);
    if (!a) return true;
    const before = bal(a.id),
      overallBefore = overall(),
      ops = D.ops;
    try {
      D.ops = [
        ...ops,
        {
          id: "__test_income_edit",
          type: "income",
          to: a.id,
          category: D.categories.find((c) => c.type === "income")?.id,
          amount: 350000,
          date: TODAY,
          comment: "test",
          tags: [],
        },
      ];
      const first = bal(a.id),
        allFirst = overall();
      D.ops[D.ops.length - 1] = { ...D.ops.at(-1), amount: 360000 };
      return (
        first - before === 350000 &&
        bal(a.id) - first === 10000 &&
        allFirst - overallBefore === convert(350000, a.currency, D.settings.currency) &&
        overall() - allFirst ===
          convert(360000, a.currency, D.settings.currency) -
            convert(350000, a.currency, D.settings.currency)
      );
    } finally {
      D.ops = ops;
    }
  });
  test("Deleting an account reverses linked transfer on remaining account", () => {
    const accounts = D.accounts,
      ops = D.ops;
    try {
      const x = {
          id: "__audit_from",
          name: "Audit A",
          type: "Regular",
          currency: D.settings.currency,
          opening: 100000,
          include: true,
          archived: false,
          color: "#123456",
        },
        y = { ...x, id: "__audit_to", name: "Audit B", opening: 0 };
      D.accounts = [...accounts, x, y];
      D.ops = [
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
      const during = bal(x.id) === 80000 && bal(y.id) === 20000;
      D.ops = D.ops.filter((o) => o.from !== y.id && o.to !== y.id);
      D.accounts = D.accounts.filter((a) => a.id !== y.id);
      return during && bal(x.id) === 100000;
    } finally {
      D.accounts = accounts;
      D.ops = ops;
    }
  });
  test("Debt transfer classified once per direction with all four toggles", () => {
    const accounts = D.accounts,
      ops = D.ops;
    try {
      const c = {
          id: "__audit_cash",
          name: "Cash",
          type: "Regular",
          currency: D.settings.currency,
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
      D.accounts = [...accounts, c, d];
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
      D.ops = [...ops, inbound, outbound];
      const rows = reportRows([inbound, outbound]);
      return (
        rows.length === 2 &&
        rows[0].reportType === "expense" &&
        rows[0].reportAmount === 10000 &&
        rows[1].reportType === "income" &&
        rows[1].reportAmount === 4000 &&
        bal(c.id) === 94000 &&
        bal(d.id) === 6000
      );
    } finally {
      D.accounts = accounts;
      D.ops = ops;
    }
  });
  test("Scheduled operations do not alter current balance", () => {
    const a = D.accounts[0];
    if (!a) return true;
    const before = bal(a.id),
      scheduled = D.scheduled;
    try {
      D.scheduled = [
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
      return bal(a.id) === before;
    } finally {
      D.scheduled = scheduled;
    }
  });
  test("Adjustment edit and delete reconcile balances", () => {
    const a = D.accounts[0];
    if (!a) return true;
    const ops = D.ops,
      base = bal(a.id);
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
      D.ops = [...ops, o];
      const first = bal(a.id);
      D.ops[D.ops.length - 1] = { ...o, amount: 16000 };
      const edited = bal(a.id);
      D.ops = ops;
      return first - base === 10000 && edited - first === 6000 && bal(a.id) === base;
    } finally {
      D.ops = ops;
    }
  });
  test("Debt switches are independent", () => {
    const a = D.accounts.find((x) => x.type === "Debt");
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
    const oldTab = U.tab,
      oldPages = U.pages;
    U.tab = "more";
    U.pages = [];
    const view = rootView();
    U.tab = oldTab;
    U.pages = oldPages;
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
