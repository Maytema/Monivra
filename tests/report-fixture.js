/* A year and a half of synthetic money for testing exports: three currencies, a card, savings, a debt,
   subcategories, Russian text, long comments, an archived account. Nothing here is real data.
   The same numbers are worked out again in the checks without the application's own report code. */
import { createEmptyData } from "../js/data/defaults.js";

// Deterministic pseudo-random numbers.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const account = (id, name, fields) => ({
  id,
  name,
  type: "Regular",
  opening: 0,
  icon: "wallet",
  color: "#5067d7",
  currency: "KGS",
  goal: 0,
  limit: 0,
  include: true,
  archived: false,
  favorite: false,
  description: "",
  debt: "Owe me",
  considerExpense: false,
  considerIncome: false,
  showExpense: false,
  showIncome: false,
  ...fields,
});
const category = (id, name, type, fields = {}) => ({
  id,
  name,
  type,
  icon: "tag",
  color: "#f57400",
  currency: "KGS",
  parent: null,
  archived: false,
  ...fields,
});

export function createReportFixture() {
  const rand = random(20260101);
  const data = createEmptyData();
  data.settings.language = "en";
  data.settings.currency = "KGS";
  data.rates.USD = 87.5;
  data.rates.EUR = 100;
  data.accounts = [
    account("cash", "Наличные", { opening: 5000000, color: "#24b5d1" }),
    account("card", "Карта Visa", { opening: 0, limit: 10000000, color: "#5067d7" }),
    account("usd", "Dollars", { currency: "USD", opening: 100000, color: "#2fb585" }),
    account("eur", "Euro", { currency: "EUR", opening: 50000, color: "#7064cc", include: false }),
    account("dream", "Отпуск мечты", { type: "Savings", goal: 50000000, color: "#8d4ed9" }),
    account("ann", "Долг Ане", {
      type: "Debt",
      debt: "Owe me",
      totalDebt: 5000000,
      considerExpense: true,
      color: "#c9528a",
    }),
    account("old", "Старый счёт", { archived: true, include: false, opening: 70000 }),
  ];
  data.categories = [
    category("food", "Еда", "expense"),
    category("market", "Market", "expense", { parent: "food", color: "#f58a00" }),
    category("cafe", "Cafe", "expense", { parent: "food", color: "#f5a000" }),
    category("transport", "Transport", "expense", { color: "#479ee2" }),
    category("home", "Home", "expense", { color: "#45585e" }),
    category("salary", "Salary", "income", { color: "#858585" }),
    category("bonus", "Бонус", "income", { color: "#ead447" }),
  ];
  const expenseCategories = ["market", "cafe", "transport", "home", "food"];
  const long =
    "Очень длинный комментарий о покупке: куплено много разных вещей для дома, дачи и поездки, чек сохранён в папке, оплата частями, проверить гарантию через два месяца. ".repeat(
      3,
    );
  let n = 0;
  const ops = [];
  const day = (i) => new Date(Date.UTC(2025, 8, 1 + i, 12)).toISOString().slice(0, 10);
  for (let i = 0; i < 430; i++) {
    const date = day(i);
    if (date > "2026-11-05") break;
    if (date.endsWith("-05")) {
      ops.push({
        id: `o${n++}`,
        type: "income",
        to: "card",
        category: "salary",
        amount: 8000000,
        date,
        comment: "",
        tags: ["work"],
      });
      ops.push({
        id: `o${n++}`,
        type: "transfer",
        from: "card",
        to: "dream",
        amount: 1000000,
        receive: 1000000,
        date,
        comment: "Откладываю",
        tags: [],
      });
    }
    if (date.endsWith("-15")) {
      const rate = 87.5;
      ops.push({
        id: `o${n++}`,
        type: "transfer",
        from: "cash",
        to: "usd",
        amount: 875000,
        receive: Math.round(875000 / rate),
        date,
        comment: "Обмен",
        tags: [],
      });
    }
    if (date === "2026-03-10")
      ops.push({
        id: `o${n++}`,
        type: "income",
        to: "usd",
        category: "bonus",
        amount: 20000,
        date,
        comment: "Bonus in dollars",
        tags: [],
      });
    if (date === "2026-04-02")
      ops.push({
        id: `o${n++}`,
        type: "transfer",
        from: "cash",
        to: "ann",
        amount: 2000000,
        receive: 2000000,
        date,
        comment: "Одолжил Ане",
        tags: ["долг"],
      });
    if (date === "2026-06-02")
      ops.push({
        id: `o${n++}`,
        type: "adjustment",
        to: "cash",
        amount: 15000,
        date,
        comment: "Нашёл в кармане",
        tags: [],
      });
    const count = Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const c = expenseCategories[Math.floor(rand() * expenseCategories.length)];
      const from = rand() < 0.2 ? "usd" : rand() < 0.5 ? "card" : "cash";
      const amount =
        Math.round((from === "usd" ? 500 + rand() * 4000 : 20000 + rand() * 500000) / 100) * 100;
      ops.push({
        id: `o${n++}`,
        type: "expense",
        from,
        category: c,
        amount,
        date,
        comment: rand() < 0.04 ? long : rand() < 0.3 ? `Покупка №${n}` : "",
        tags: rand() < 0.2 ? ["trip", "семья"] : [],
      });
    }
  }
  // Extremes: a comment of many pages, and a very long word with no place to break it.
  ops.push({
    id: `o${n++}`,
    type: "expense",
    from: "cash",
    category: "home",
    amount: 12300,
    date: "2026-07-07",
    comment: "Слово ".repeat(2000),
    tags: [],
  });
  ops.push({
    id: `o${n++}`,
    type: "expense",
    from: "cash",
    category: "home",
    amount: 45600,
    date: "2026-07-08",
    comment: `https://example.com/${"a".repeat(500)}`,
    tags: ["x".repeat(120)],
  });
  data.ops = ops;
  data.tags = ["work", "trip", "семья", "долг"];
  data.budgets = [
    {
      id: "b1",
      name: "Еда в месяц",
      amount: 4000000,
      currency: "KGS",
      period: "month",
      categories: ["food"],
    },
    { id: "b2", name: "Всё", amount: 3000000, currency: "KGS", period: "month", categories: null },
  ];
  return data;
}

// What the fixture adds up to, counted straight from its operations: per currency of the account,
// income and expenses as the statistics count them (a transfer into the debt that counts as an
// expense is one; other transfers and adjustments are neither).
export function expectedTotals(data, from = "0000-01-01", to = "9999-12-31") {
  const accountOf = (id) => data.accounts.find((a) => a.id === id);
  const totals = {};
  const add = (currency, key, amount) => {
    totals[currency] ??= { income: 0, expense: 0, count: 0 };
    totals[currency][key] += amount;
  };
  for (const o of data.ops) {
    if (o.date < from || o.date > to) continue;
    if (o.type === "income") add(accountOf(o.to).currency, "income", o.amount);
    else if (o.type === "expense") add(accountOf(o.from).currency, "expense", o.amount);
    else if (
      o.type === "transfer" &&
      accountOf(o.to).type === "Debt" &&
      accountOf(o.to).considerExpense
    )
      add(accountOf(o.from).currency, "expense", o.amount);
  }
  return totals;
}
