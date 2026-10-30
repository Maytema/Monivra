/* Sample dataset for testing: example accounts, categories and a month of operations */
import { createEmptyData } from "./defaults.js";

// Installed only on request from More > Data > Test data.
export function createSampleData() {
  const accounts = [
    ["Wallet", "Regular", 1846700, "card", "#5067d7"],
    ["Personal", "Regular", 120000, "cash", "#24b5d1"],
    ["Rent", "Regular", 0, "home", "#435057"],
    ["For a dream", "Savings", 4720000, "spark", "#8d4ed9"],
    ["Vacation", "Savings", 4500000, "goal", "#98d8b6"],
  ].map((a, i) => ({
    id: "a" + i,
    name: a[0],
    type: a[1],
    opening: a[2],
    icon: a[3],
    color: a[4],
    currency: "KGS",
    goal: i === 4 ? 20000000 : 0,
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
  }));
  const categories = [
    ["Internet", "expense", "wifi", "#7064cc"],
    ["Transport", "expense", "bike", "#479ee2"],
    ["Rent", "expense", "home", "#45585e"],
    ["Repair", "expense", "repair", "#9614b9"],
    ["Pets", "expense", "paw", "#b520c5"],
    ["Business", "expense", "business", "#4945a2"],
    ["Other", "expense", "trend", "#a5a3c8"],
    ["Food", "expense", "pizza", "#f57400"],
    ["Job", "income", "briefcase", "#3c4e55"],
    ["Bonus", "income", "gift", "#ead447"],
    ["Tips", "income", "cash", "#5663a6"],
    ["Salary", "income", "briefcase", "#858585"],
    ["Other", "income", "trend", "#9f37a9"],
    ["Business", "income", "business", "#5846a6"],
  ].map((a, i) => ({
    id: "c" + i,
    name: a[0],
    type: a[1],
    icon: a[2],
    color: a[3],
    currency: "KGS",
    parent: null,
    archived: false,
  }));
  const ops = [
    {
      id: "o1",
      type: "income",
      to: "a0",
      category: "c8",
      amount: 260000,
      date: "2026-10-12",
      comment: "Demo income",
      tags: [],
    },
    {
      id: "o2",
      type: "expense",
      from: "a0",
      category: "c3",
      amount: 600000,
      date: "2026-10-12",
      comment: "",
      tags: [],
    },
    {
      id: "o3",
      type: "expense",
      from: "a0",
      category: "c7",
      amount: 85000,
      date: "2026-10-11",
      comment: "Demo groceries",
      tags: [],
    },
    {
      id: "o4",
      type: "expense",
      from: "a0",
      category: "c7",
      amount: 85000,
      date: "2026-10-11",
      comment: "",
      tags: [],
    },
  ];
  for (let day = 1; day <= 30; day++) {
    ops.push({
      id: "se" + day,
      type: "expense",
      from: "a0",
      category: day % 4 === 0 ? "c3" : "c7",
      amount: (day % 4 === 0 ? 400 : 150 + day * 9) * 100,
      date: "2026-09-" + String(day).padStart(2, "0"),
      comment: "",
      tags: [],
    });
    if (day % 3 === 0)
      ops.push({
        id: "si" + day,
        type: "income",
        to: "a0",
        category: "c8",
        amount: (2200 + day * 40) * 100,
        date: "2026-09-" + String(day).padStart(2, "0"),
        comment: "Demo",
        tags: [],
      });
  }
  for (const a of accounts)
    a.opening -= ops.reduce(
      (s, o) =>
        s + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0),
      0,
    );
  return { ...createEmptyData(), accounts, categories, ops };
}
