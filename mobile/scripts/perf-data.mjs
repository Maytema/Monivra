// A large data file for the speed checks: the accounts and categories of the test fixture with many operations
// spread over the last months (a person who has used the application for a year and a half). The same seed
// gives the same file, so two runs can be compared.
// Usage: node scripts/perf-data.mjs [operations=3000] [months=18] > perf-data.json
import { readFileSync } from "node:fs";

const count = Number(process.argv[2] ?? 3000);
const months = Number(process.argv[3] ?? 18);
const base = JSON.parse(readFileSync(new URL("../test/fixtures/sample.json", import.meta.url), "utf8"));

// A small deterministic generator (mulberry32).
let seed = 20261114;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];

const today = new Date();
const day = (back) => {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - back, 12));
  return d.toISOString().slice(0, 10);
};
const span = Math.round(months * 30.4);
const accounts = base.accounts.filter((a) => a.type !== "Debt" && !a.archived);
const expense = base.categories.filter((c) => c.type === "expense" && !c.archived);
const income = base.categories.filter((c) => c.type === "income" && !c.archived);
const tags = ["home", "work", "trip", "gift", "health"];
const comments = ["", "", "", "Lunch", "Taxi to the office", "Weekly groceries", "Paid by card", "A longer comment that takes a second line in the list of operations"];

const ops = [];
for (let i = 0; i < count; i++) {
  const kind = random();
  const date = day(Math.floor(random() * span));
  const time = `${String(7 + Math.floor(random() * 15)).padStart(2, "0")}:${String(Math.floor(random() * 60)).padStart(2, "0")}`;
  const amount = (1 + Math.floor(random() * 400)) * 1000;
  const op = { id: `p${i}`, date, time, amount, comment: pick(comments), tags: random() < 0.15 ? [pick(tags)] : [] };
  if (kind < 0.82) ops.push({ ...op, type: "expense", from: pick(accounts).id, category: pick(expense).id });
  else if (kind < 0.94) ops.push({ ...op, type: "income", to: pick(accounts).id, category: pick(income).id, amount: amount * 10 });
  else {
    const from = pick(accounts);
    const to = pick(accounts.filter((a) => a.id !== from.id && a.currency === from.currency));
    if (to) ops.push({ ...op, type: "transfer", from: from.id, to: to.id, receive: op.amount });
  }
}

process.stdout.write(JSON.stringify({ ...base, ops, tags, scheduled: [], budgets: [], backups: [] }));
