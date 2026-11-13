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
  const plan = await import("/js/domain/reminder-plan.js");
  const csv = await import("/js/data/csv.js");
  const restore = await import("/js/domain/restore.js");
  const csvImport = await import("/js/data/csv-import.js");
  const reportModel = await import("/js/domain/report-model.js");
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
    // Reminders: the periodic one on weekdays and two payment reminders.
    const withReminders = clone(withSchedules);
    withReminders.settings = { ...withReminders.settings, notifications: true, periodic: true, notificationTime: "20:00", notificationFrequency: "Weekdays" };
    withReminders.scheduled = withReminders.scheduled
      .filter((s) => s.id !== "far")
      .map((s) => ({ ...s, date: s.date < "2026-11-12" ? "2026-11-14" : s.date, reminder: s.id === "daily" ? { before: 0, unit: "Days", time: "09:00" } : s.id === "monthly31" ? { before: 1, unit: "Weeks", time: "10:30" } : null }));
    const pad = (n) => String(n).padStart(2, "0");
    const reminders = plan.upcomingReminders(withReminders, new Date(), { days: 40, limit: 60 }).map((r) => ({
      key: r.key,
      day: `${r.at.getFullYear()}-${pad(r.at.getMonth() + 1)}-${pad(r.at.getDate())}`,
      time: `${pad(r.at.getHours())}:${pad(r.at.getMinutes())}`,
    }));
    // Restore plans: merging another dataset, merging a changed copy (records that differ, a category
    // of the other kind under the same id, look-alike operations), replacing without scheduled payments.
    const changed = clone(sample);
    changed.ops[0].comment = "changed in the backup";
    changed.ops[1].amount += 100;
    const lonely = changed.categories.find((c) => c.type === "expense" && !c.parent && !changed.categories.some((x) => x.parent === c.id));
    changed.ops = changed.ops.filter((o) => o.category !== lonely.id);
    changed.scheduled = changed.scheduled.filter((o) => o.category !== lonely.id);
    changed.budgets = changed.budgets.map((b) => (b.categories ? { ...b, categories: b.categories.filter((id) => id !== lonely.id) } : b)).filter((b) => b.categories === null || b.categories.length);
    lonely.type = "income";
    changed.ops.push({ ...clone(changed.ops[2]), id: "look-alike" });
    changed.tags.push("from-backup");
    const plans = [
      ["sample+report merge keep count", sample, report, { mode: "merge", scheduled: "count", conflicts: "keep" }],
      ["sample+changed merge keep count", sample, changed, { mode: "merge", scheduled: "count", conflicts: "keep" }],
      ["sample+changed merge backup none", sample, changed, { mode: "merge", scheduled: "none", conflicts: "backup" }],
      ["withSchedules+report replace none", withSchedules, report, { mode: "replace", scheduled: "none" }],
      ["sample+withSchedules replace count", sample, withSchedules, { mode: "replace", scheduled: "count" }],
    ].map(([name, current, incoming, options]) => {
      const { next, summary, problem } = restore.planRestore(clone(current), clone(incoming), options);
      const merge = summary.merge && Object.fromEntries(Object.entries(summary.merge).map(([k, r]) => [k, r.items ? { ...r, items: r.items.map((x) => x.now.id) } : r]));
      return {
        name,
        current,
        incoming,
        options,
        summary: { ...summary, merge },
        problem: problem && { what: problem.what, number: problem.number },
        next: { accounts: next.accounts.map((a) => a.id), categories: next.categories.map((c) => `${c.id}:${c.type}:${c.parent ?? ""}`), ops: next.ops.map((o) => `${o.id}:${o.amount}:${o.category ?? ""}:${o.comment}`), scheduled: next.scheduled.map((x) => x.id), budgets: next.budgets.map((b) => b.id), tags: next.tags, rates: next.rates },
      };
    });
    // CSV import: the example file, the first application's own export, and a messy bank file.
    const csvFiles = {
      example: csv.csvExample(),
      messy: [
        "Дата;Сумма;Счёт;Категория;Комментарий;Теги",
        "03.04.2026;-1 234,50;Cash;Food;обед;work| lunch",
        "04.04.2026;2 500,00;Cash;Salary;;",
        "31.04.2026;10,00;Cash;Food;bad date;",
        "05.04.2026;12,345;Cash;Food;three decimals;",
        "06.04.2026;;Cash;Food;no amount;",
        "07.04.2026;(45,00);New card;Transport / Taxi;;",
        '08.04.2026;"1.234,56";Cash;Food;"quoted; with delimiter";',
        "09.04.2026;-5,00;Cash;Food;обед;",
        "09.04.2026;-5,00;Cash;Food;обед;",
        "01.12.2026;-7,00;Cash;Food;ahead;",
      ].join("\n"),
    };
    const imports = {};
    for (const [name, text] of Object.entries(csvFiles))
      for (const base of ["sample", "empty"]) {
        st.setAppData(clone(base === "sample" ? sample : { ...sample, accounts: [], categories: [], ops: [], scheduled: [], budgets: [], tags: [] }));
        const table = csvImport.readTable(text);
        const mapping = csvImport.guessColumns(table.headers);
        const formats = csvImport.guessFormats(table, mapping);
        const records = csvImport.readRecords(table, mapping, formats);
        const refs = csvImport.referencesOf(records);
        const links = csvImport.guessLinks(refs);
        const plan = csvImport.planImport(records, links);
        const d = st.appData;
        const accountName = (id) => d.accounts.find((a) => a.id === id)?.name ?? plan.created.accounts.find((a) => a.id === id)?.name ?? "";
        const allCategories = [...d.categories, ...plan.created.categories];
        const categoryName = (id) => { const c = allCategories.find((x) => x.id === id); return c ? csvImport.categoryPath(c, allCategories) : ""; };
        imports[`${name}/${base}`] = {
          text,
          base,
          mapping,
          formats,
          problems: records.map((r) => r.problem),
          links: { accounts: Object.entries(links.accounts).map(([k, v]) => [k, v === "new" ? "new" : accountName(v)]), categories: Object.entries(links.categories).map(([k, v]) => [k, v === "new" ? "new" : categoryName(v)]) },
          plan: {
            total: plan.total, duplicates: plan.duplicates, repeated: plan.repeated, ignoredSigns: plan.ignoredSigns, future: plan.future, newTags: plan.newTags, lines: plan.lines,
            invalid: plan.invalid.map((x) => x.line),
            created: { accounts: plan.created.accounts.map((a) => `${a.name}:${a.currency}`), categories: plan.created.categories.map((c) => `${c.type}:${categoryName(c.id)}`) },
            ops: plan.ops.map((o) => [o.type, o.date, o.amount, accountName(o.from), accountName(o.to), categoryName(o.category), o.receive ?? null, o.comment, o.tags.join("|")].join(";")),
          },
        };
      }
    // Report models (numbers only; the words are the translator's).
    const reports = [];
    for (const [name, base] of [["report", report], ["sample", sample]])
      for (const period of [{ mode: "all", anchor: "2026-11-11" }, { mode: "month", anchor: "2026-10-15" }, { mode: "year", anchor: "2026-06-01" }])
        for (const filters of [st.emptyFilters(), { ...st.emptyFilters(), accounts: [base.accounts[0].id], types: ["expense", "transfer"] }]) {
          st.setAppData(clone(base));
          const sm = reportModel.summaryModel({ filters, period, sections: {} });
          const dm = reportModel.detailModel({ filters, period, parts: {} });
          reports.push({
            name, period, filters,
            summary: {
              from: sm.from, to: sm.to, end: sm.end,
              overview: sm.overview,
              flow: sm.flow.series.map((x) => [x.key, x.income, x.expense, x.net]),
              unit: sm.flow.unit,
              trend: sm.trend.map((x) => [x.key, x.value]),
              expenseCategories: sm.expenseCategories.map((x) => [x.name, x.amount]),
              incomeCategories: sm.incomeCategories.map((x) => [x.name, x.amount]),
              accounts: sm.accounts.map((a) => [a.id, a.opening, a.closing, a.counted]),
              total: sm.total,
              movements: sm.movements.map((m) => [m.count, m.amounts]),
              savings: sm.savings.map((x) => [x.balance, x.goal, x.left, x.percent]),
              debts: sm.debts.map((x) => [x.balance, x.total, x.left, x.percent]),
              budgets: sm.budgets.map((x) => [x.amount, x.used, x.left, x.percent]),
              shown: sm.shown,
              notes: sm.notes.length,
            },
            detail: { rows: dm.rows.map((r) => [r.id, r.sign]), totals: dm.totals, counts: dm.counts, columns: dm.columns.map((c) => c.key), notes: dm.notes.length },
          });
        }
    st.setAppData(clone(report));
    const csvReport = csv.csvText(st.appData.ops);
    return {
      csvReport,
      reminders,
      fixtures: { sample, report, withSchedules, withReminders },
      observations: { sample: observe(sample), report: observe(report) },
      postDue: postDue(withSchedules),
      plans,
      imports,
      reports,
    };
  } finally {
    st.setAppData(user);
  }
});
await browser.close();
server.close();

for (const [name, data] of Object.entries(result.fixtures)) await writeFile(new URL(`${name}.json`, out), JSON.stringify(data, null, 1));
await writeFile(new URL("old-reports.json", out), JSON.stringify(result.reports));
await writeFile(new URL("old-import.json", out), JSON.stringify(result.imports, null, 1));
await writeFile(new URL("old-restore.json", out), JSON.stringify(result.plans, null, 1));
await writeFile(new URL("old-observations.json", out), JSON.stringify({ now: NOW, observations: result.observations, postDue: result.postDue, reminders: result.reminders, csvReport: result.csvReport }, null, 1));
console.log("written", Object.keys(result.fixtures).join(", "), "and old-observations.json");
