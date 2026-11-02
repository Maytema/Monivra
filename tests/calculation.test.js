import { check } from "./harness.js";
import { addAccount } from "./helpers.js";
import { TODAY } from "../js/core/constants.js";
import { appData } from "../js/core/state.js";
import { leadingSide } from "../js/domain/dual-amount.js";
import { applyFees } from "../js/domain/fees.js";
import {
  accountBalance,
  amountPair,
  convertCurrency,
  evaluateExpression,
  formatMoney,
  formatNumber,
  offRate,
  quoteRate,
  reportRows,
} from "../js/domain/finance.js";
import { typeKey } from "../js/domain/keypad.js";
import { validateOp } from "../js/domain/operations.js";

check("Arithmetic precedence", () => evaluateExpression("12+3×4") === 2400);

check("Decimal accuracy", () => evaluateExpression("0.1+0.2") === 30);

check("Keypad editing", () => {
  const typed = ["7", "+", "⌫", "⌫"].reduce((expr, k) => typeKey(expr, k), "0");
  return typed === "0" && typeKey("0", ".") === "0." && typeKey("12", "5", true) === "5";
});

check("Reject division by zero", () => {
  try {
    evaluateExpression("1/0");
    return false;
  } catch {
    return true;
  }
});

check("Fees apply one after another on the running amount", () => {
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

check("Fees follow the rules of the calculation help", () => {
  const pct = (percent, add) => ({ kind: "tax", percent, value: 0, add });
  const fixed = (value) => ({ kind: "commission", percent: 0, value, add: false });
  return (
    applyFees(10000, [pct(10, true), pct(20, true)]).net === 13000 &&
    applyFees(10000, [pct(10, false), pct(20, false)]).net === 7200 &&
    applyFees(1000, [fixed(50)]).net === 0 &&
    applyFees(10000, [pct(20, false), fixed(7)]).net === 7300 &&
    applyFees(10000, [fixed(7), pct(20, false)]).net === 7440
  );
});

check("Cross-currency amounts convert both ways within one minor unit", () => {
  const usd = 12345;
  const back = convertCurrency(convertCurrency(usd, "USD", "KGS"), "KGS", "USD");
  return Math.abs(back - usd) <= 1;
});

check("Fees: the account pays in full, the category and the receiver get the rest", () => {
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

check("The side typed last fills in the other one; the other side is typed freely", () => {
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

check("The rate of an operation follows from its two amounts and is flagged when it is off", () => {
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
    quoteRate("KGS", "USD", manual[1][0] / manual[0][0]).join() === "USD,KGS,16.666666666666668" &&
    amountPair({ ...op(50), category: null }) === null
  );
});

check(
  "Negative amounts use the minus sign",
  () =>
    formatNumber(-50000, "comma-dot", true, 2) === "\u2212500.00" &&
    formatNumber(123456, "space-comma", true, 0) === "1\u00a0235",
);

check("Cents are shown only when there are some, whole amounts never get zeros", () => {
  const settings = appData.settings;
  const saved = { ...settings };
  Object.assign(settings, { currency: "KGS", numberFormat: "comma-dot", groupDigits: true });
  const shown = (setting) => {
    Object.assign(settings, setting);
    return [50000, 50050, 50051, -50051].map((n) => formatMoney(n).replace(/\u2212/, "-"));
  };
  const plain = shown({ decimal: false, hideCents: false });
  const fixed = shown({ decimal: true, hideCents: false });
  const whole = shown({ decimal: true, hideCents: true });
  Object.assign(settings, saved);
  return (
    plain.join() === "500 KGS,500.5 KGS,500.51 KGS,-500.51 KGS" &&
    fixed.join() === "500 KGS,500.50 KGS,500.51 KGS,-500.51 KGS" &&
    whole.join() === "500 KGS,501 KGS,501 KGS,-501 KGS"
  );
});
