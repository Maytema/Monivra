// Runs the FIRST application's own code (js/ in the repository root) in Chromium on the shared test
// fixtures, with the clock fixed, and writes what it computes to mobile/test/fixtures/. The tests of
// the new application compare their own results with these files (test/parity.test.ts).
// Run from the repository root: node mobile/test/parity/run-old.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { serveApp } from "../../../tests/server.mjs";

const NOW = "2026-11-11T12:00:00";
const out = new URL("../fixtures/", import.meta.url);
await mkdir(out, { recursive: true });

const { server, address } = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.clock.install({ time: new Date(NOW) });
await page.goto(`${address}/index.html`);

const result = await page.evaluate(async () => {
  const st = await import("/js/core/state.js");
  const fin = await import("/js/domain/finance.js");
  const budgets = await import("/js/domain/budgets.js");
  const scheduled = await import("/js/domain/scheduled.js");
  const { createSampleData } = await import("/tests/fixtures/sample-data.js");
  const { createReportFixture } = await import("/tests/report-fixture.js");
  const user = st.appData;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const periods = [
    { mode: "month", anchor: "2026-11-11" },
    { mode: "month", anchor: "2026-10-15" },
    { mode: "year", anchor: "2026-06-01" },
    { mode: "week", anchor: "2026-11-11" },
    { mode: "all", anchor: "2026-11-11" },
  ];
  const observe = (data) => {
    st.setAppData(clone(data));
    const d = st.appData;
    const accounts = d.accounts.map((a) => ({
      id: a.id,
      balance: fin.accountBalance(a.id),
      progress: fin.accountProgress(a),
      card: fin.cardState(a),
    }));
    const byPeriod = periods.map((p) => {
      st.uiState.period = p;
      st.uiState.filters = st.emptyFilters();
      const ops = fin.visibleOperations();
      return {
        period: p,
        bounds: fin.periodBounds(p),
        count: ops.length,
        income: fin.totalByType("income", ops),
        expense: fin.totalByType("expense", ops),
        categories: d.categories.map((c) => ({ id: c.id, total: fin.categoryTotal(c.id), own: fin.categoryTotalIn(c) })),
        budgets: d.budgets.map((b) => {
          const s = budgets.budgetState(b, p.anchor);
          return { id: b.id, used: s.used, left: s.left };
        }),
      };
    });
    return { overall: fin.overallBalance(), accounts, byPeriod };
  };
  const postDue = (data) => {
    st.setAppData(clone(data));
    const posted = scheduled.postDue();
    const d = st.appData;
    return {
      posted: d.ops
        .filter((o) => posted.includes(o.id))
        .map((o) => ({ schedule: o.fromSchedule.id, occurrence: o.fromSchedule.date, date: o.date, time: o.time ?? null, amount: o.amount, receive: o.receive ?? null }))
        .sort((a, b) => (a.schedule + a.occurrence).localeCompare(b.schedule + b.occurrence)),
      scheduled: d.scheduled.map((s) => ({ id: s.id, date: s.date, remaining: s.recur?.remaining ?? null })),
      balances: d.accounts.map((a) => ({ id: a.id, balance: fin.accountBalance(a.id) })),
      missed: scheduled.missedPayments().map((e) => ({ id: e.item.id, count: e.count })),
    };
  };
  try {
    const sample = createSampleData();
    const report = createReportFixture();
    // A scheduled set that exercises catch-up: daily, monthly on the 31st, weekly on two days, far behind.
    const withSchedules = clone(sample);
    const [cash, card] = withSchedules.accounts;
    const food = withSchedules.categories.find((c) => c.type === "expense").id;
    const salary = withSchedules.categories.find((c) => c.type === "income").id;
    const base = { comment: "", tags: [], reminder: null };
    withSchedules.scheduled = [
      { ...base, id: "daily", type: "expense", amount: 70000, date: "2026-11-08", from: cash.id, category: food, recur: { every: 1, unit: "Days", days: [], remaining: null } },
      { ...base, id: "monthly31", type: "income", amount: 1200000, date: "2026-08-31", to: card.id, category: salary, anchorDay: 31, recur: { every: 1, unit: "Months", days: [], remaining: 5 } },
      { ...base, id: "weekly", type: "transfer", amount: 30000, receive: 30000, date: "2026-10-26", from: cash.id, to: card.id, recur: { every: 1, unit: "Weeks", days: [1, 4], remaining: null } },
      { ...base, id: "today-late", type: "expense", amount: 1000, date: "2026-11-11", time: "18:00", from: cash.id, category: food, recur: null },
      { ...base, id: "far", type: "expense", amount: 500, date: "2025-01-01", from: cash.id, category: food, recur: { every: 1, unit: "Days", days: [], remaining: null } },
    ];
    return {
      fixtures: { sample, report, withSchedules },
      observations: { sample: observe(sample), report: observe(report) },
      postDue: postDue(withSchedules),
    };
  } finally {
    st.setAppData(user);
  }
});
await browser.close();
server.close();

for (const [name, data] of Object.entries(result.fixtures)) await writeFile(new URL(`${name}.json`, out), JSON.stringify(data, null, 1));
await writeFile(new URL("old-observations.json", out), JSON.stringify({ now: NOW, observations: result.observations, postDue: result.postDue }, null, 1));
console.log("written", Object.keys(result.fixtures).join(", "), "and old-observations.json");
