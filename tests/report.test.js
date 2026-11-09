import { check } from "./harness.js";
import { createReportFixture, expectedTotals } from "./report-fixture.js";
import { appData, setAppData } from "../js/core/state.js";
import { csvLines, csvTable, csvText } from "../js/data/csv.js";
import { detailModel, scopeOperations, summaryModel } from "../js/domain/report-model.js";

const NONE = { accounts: null, categories: null, types: null, tags: null, comment: "" };
const PERIODS = [
  [{ mode: "all" }, "0000-01-01", "9999-12-31"],
  [{ mode: "year", anchor: "2026-06-01" }, "2026-01-01", "2026-12-31"],
  [{ mode: "month", anchor: "2026-03-10" }, "2026-03-01", "2026-03-31"],
  [
    { mode: "range", from: "2025-12-15", to: "2026-02-20", anchor: "2025-12-15" },
    "2025-12-15",
    "2026-02-20",
  ],
];

// A reader of CSV text written separately from the application's own, to check the file from outside.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const flowOf = (rows) =>
  Object.fromEntries(rows.map((r) => [r.currency, { income: r.income, expense: r.expense }]));
const sameFlow = (a, b) =>
  Object.keys({ ...a, ...b }).every(
    (k) =>
      (a[k]?.income || 0) === (b[k]?.income || 0) && (a[k]?.expense || 0) === (b[k]?.expense || 0),
  );

check("The fixture is valid data and holds what the checks of the reports rely on", () => {
  setAppData(createReportFixture());
  const types = new Set(appData.ops.map((o) => o.type));
  const currencies = new Set(appData.accounts.map((a) => a.currency));
  return (
    appData.ops.length > 300 &&
    ["income", "expense", "transfer", "adjustment"].every((t) => types.has(t)) &&
    currencies.size === 3 &&
    appData.accounts.some((a) => a.limit > 0) &&
    appData.accounts.some((a) => a.type === "Savings") &&
    appData.accounts.some((a) => a.type === "Debt") &&
    appData.accounts.some((a) => a.archived)
  );
});

check(
  "Income and expenses of the summary and of the detailed report equal a separate count",
  () => {
    setAppData(createReportFixture());
    return PERIODS.every(([period, from, to]) => {
      const want = expectedTotals(appData, from, to);
      const summary = summaryModel({ filters: NONE, period, sections: {} });
      const detail = detailModel({ filters: NONE, period, parts: {} });
      return (
        sameFlow(want, flowOf(summary.overview.byCurrency)) && sameFlow(want, flowOf(detail.totals))
      );
    });
  },
);

check("Currencies are never added together without saying so", () => {
  setAppData(createReportFixture());
  const summary = summaryModel({ filters: NONE, period: { mode: "all" }, sections: {} });
  const codes = summary.overview.byCurrency.map((r) => r.currency);
  return codes.join() === "KGS,USD" && summary.overview.converted === true;
});

check("A report of nothing has no figures made up", () => {
  setAppData(createReportFixture());
  const period = { mode: "range", from: "2001-01-01", to: "2001-01-31", anchor: "2001-01-01" };
  const summary = summaryModel({ filters: NONE, period, sections: {} });
  const detail = detailModel({ filters: NONE, period, parts: {} });
  return (
    summary.overview.byCurrency.length === 0 &&
    summary.overview.counts.all === 0 &&
    detail.rows.length === 0 &&
    detail.totals.length === 0
  );
});

check("The detailed report lists every operation of the scope once", () => {
  setAppData(createReportFixture());
  const [period] = PERIODS[1];
  const ids = scopeOperations(NONE, period).map((o) => o.id);
  const detail = detailModel({ filters: NONE, period, parts: {} });
  return (
    detail.rows.length === ids.length &&
    new Set(detail.rows.map((r) => r.id)).size === ids.length &&
    detail.rows.every((r, i) => r.id === ids[i] && r.cells.amount)
  );
});

check("The parts that are turned off leave their columns out of the detailed report", () => {
  setAppData(createReportFixture());
  const keys = (parts) =>
    detailModel({ filters: NONE, period: { mode: "all" }, parts }).columns.map((c) => c.key);
  return (
    keys({}).join() === "date,type,subject,comment,tags,amount" &&
    keys({ comment: false, tags: false }).join() === "date,type,subject,amount" &&
    keys({ amount: false }).includes("amount") === false
  );
});

check(
  "A transfer between own accounts changes neither income nor expenses, whatever is chosen",
  () => {
    setAppData(createReportFixture());
    const period = { mode: "all" };
    const [x, y] = ["cash", "usd"].map((id) => appData.accounts.find((a) => a.id === id));
    const outside = appData.accounts.find((a) => a.id === "old");
    const choices = {
      all: {},
      both: { accounts: [x.id, y.id] },
      one: { accounts: [x.id] },
      neither: { accounts: [outside.id] },
    };
    const read = () =>
      Object.fromEntries(
        Object.entries(choices).map(([name, chosen]) => {
          const m = summaryModel({ filters: { ...NONE, ...chosen }, period, sections: {} });
          return [name, { flow: JSON.stringify(m.overview.byCurrency), moved: m.movements }];
        }),
      );
    const before = read();
    appData.ops.push({
      id: "__between",
      type: "transfer",
      from: x.id,
      to: y.id,
      amount: 123400,
      receive: 1410,
      date: "2026-02-02",
      comment: "",
      tags: [],
    });
    const after = read();
    const flowSame = Object.keys(choices).every((k) => before[k].flow === after[k].flow);
    const count = (list, label) => list.find((m) => m.label === label)?.count || 0;
    const across = "Transfers across the chosen accounts";
    const inside = "Transfers between your accounts";
    return (
      flowSame &&
      // With both accounts the money moved inside, with one it crossed the edge of the scope, with
      // none of them the transfer is not in the report at all.
      count(after.both.moved, inside) === count(before.both.moved, inside) + 1 &&
      count(after.one.moved, across) === count(before.one.moved, across) + 1 &&
      JSON.stringify(after.neither.moved) === JSON.stringify(before.neither.moved)
    );
  },
);

check("Money paid into a debt account that counts as an expense is an expense once", () => {
  setAppData(createReportFixture());
  const period = { mode: "all" };
  const debt = appData.accounts.find((a) => a.id === "ann");
  const paid = appData.ops.filter((o) => o.type === "transfer" && o.to === debt.id);
  const total = paid.reduce((n, o) => n + o.amount, 0);
  const cash = summaryModel({ filters: NONE, period, sections: {} }).overview.byCurrency.find(
    (r) => r.currency === "KGS",
  );
  const without = { ...appData, ops: appData.ops.filter((o) => !paid.includes(o)) };
  const wanted = expectedTotals(without).KGS.expense + total;
  return total > 0 && cash.expense === wanted;
});

check("The CSV file is read back by a separate reader as the same operations", () => {
  setAppData(createReportFixture());
  const rows = parseCsv(csvText(appData.ops));
  const header = rows[0];
  const body = rows.slice(1);
  const at = (name) => header.indexOf(name);
  const wantLong = appData.ops.find((o) => o.comment?.length > 1000);
  return (
    header.join() ===
      "type,date,amount,currency,from,to,category,comment,tags,to_amount,to_currency,counted_as" &&
    body.length === appData.ops.length &&
    body.every((r) => r.length === header.length) &&
    body.some((r) => r[at("comment")] === wantLong.comment) &&
    body.some((r) => /[Ѐ-ӿ]/.test(r[at("from")] + r[at("to")] + r[at("category")]))
  );
});

check("A cell that a spreadsheet would run as a formula is written as text", () => {
  setAppData(createReportFixture());
  const dangerous = ['=HYPERLINK("http://x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"];
  const lines = csvLines(dangerous.map((text) => [text, "plain"]));
  const rows = parseCsv(lines);
  return (
    rows.length === dangerous.length &&
    rows.every(([cell], i) => cell === `'${dangerous[i]}` && !/^[=+\-@\t\r]/.test(cell))
  );
});

check("The CSV of the chosen parts has only those columns, and the date always", () => {
  setAppData(createReportFixture());
  const columns = (parts) => csvTable(appData.ops.slice(0, 2), parts).columns.join();
  return (
    columns({ comment: false, tags: false }) ===
      "type,date,amount,currency,from,to,category,to_amount,to_currency,counted_as" &&
    columns({ type: false, accounts: false, amount: false, comment: false, tags: false }) === "date"
  );
});

check(
  "The totals of the detailed report are the sums of the CSV rows, read with the counted_as column",
  () => {
    setAppData(createReportFixture());
    const rows = parseCsv(csvText(appData.ops));
    const [header, ...body] = rows;
    const col = (r, name) => r[header.indexOf(name)];
    const sums = { income: {}, expense: {} };
    for (const r of body) {
      const kind = r[header.indexOf("type")] === "transfer" ? col(r, "counted_as") : col(r, "type");
      if (kind !== "income" && kind !== "expense") continue;
      const currency = col(r, "currency");
      sums[kind][currency] =
        (sums[kind][currency] || 0) + Math.round(Number(col(r, "amount")) * 100);
    }
    const model = detailModel({ filters: {}, period: { mode: "all" } });
    const same = model.totals.every(
      (t) =>
        (sums.income[t.currency] || 0) === t.income &&
        (sums.expense[t.currency] || 0) === t.expense,
    );
    // The debt transfer is named in the type column of the report and counted in the file.
    const marked = model.rows.some((r) => /counted as expense/.test(r.cells.type));
    const flagged = body.some(
      (r) => col(r, "type") === "transfer" && col(r, "counted_as") === "expense",
    );
    return model.totals.length > 0 && same && marked && flagged;
  },
);
