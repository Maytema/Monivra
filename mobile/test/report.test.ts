// Exported reports: the numbers of the financial summary and the detailed list equal the first
// application's (test/fixtures/old-reports.json, written by test/parity/run-old.mjs), and the PDF file is
// well formed with every page and the text in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../src/application/report/job.ts";
import { detailModel, summaryModel, type ReportWords } from "../src/application/report/model.ts";
import { emptyFilters } from "../src/domain/periods.ts";
import type { Translator } from "../src/i18n/index.ts";
import { fixture, fixtureText } from "./support/helpers.ts";

const reports = JSON.parse(fixtureText("old-reports")) as Record<string, any>[];
const fill = (s: string, v: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? ""));
// English words without the tables (the words are not what is compared here).
const t = { locale: "en", t: fill, tc: (one: string, other: string, n: number) => fill(n === 1 ? one : other, { n }), day: (d: string) => d, dayMonth: (d: string) => d.slice(5), shortMonth: (i: number) => String(i + 1), monthYear: (d: string) => d.slice(0, 7), weekday: () => "", monthName: () => "", shortDate: (d: string) => d } as unknown as Translator;
const words: ReportWords = { t, periodTitle: (p) => p.mode, today: "2026-11-11", now: new Date("2026-11-11T12:00:00") };

for (const r of reports)
  test(`parity: report numbers of ${r.name}, ${r.period.mode} ${r.period.anchor}${r.filters.accounts ? ", filtered" : ""}`, () => {
    const data = fixture(r.name);
    const sm = summaryModel(words, data, { filters: r.filters, period: r.period, sections: {} });
    const mine = {
      from: sm.from,
      to: sm.to,
      end: sm.end,
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
    };
    for (const key of Object.keys(r.summary)) assert.deepEqual((mine as any)[key], r.summary[key], key);
    const dm = detailModel(words, data, { filters: r.filters, period: r.period, parts: {} });
    assert.deepEqual({ rows: dm.rows.map((x) => [x.id, x.sign]), totals: dm.totals, counts: dm.counts, columns: dm.columns.map((c) => c.key), notes: dm.notes.length }, r.detail);
  });

test("the PDF of a report is a well-formed file: header, one page object per page, cross-reference table, text that maps back to Unicode", () => {
  const data = fixture("report");
  for (const mode of ["summary", "detail"] as const) {
    const job = buildReport(data, words, { mode, filters: emptyFilters(), period: { mode: "all", anchor: "2026-11-11" }, sections: {}, parts: {} });
    const text = Buffer.from(job.bytes).toString("latin1");
    assert.ok(text.startsWith("%PDF-1.7"));
    assert.ok(text.trimEnd().endsWith("%%EOF"));
    assert.equal(text.match(/\/Type \/Page /g)?.length, job.pages.length);
    assert.match(text, new RegExp(`/Count ${job.pages.length} `));
    assert.match(text, /\/ToUnicode \d+ 0 R/);
    // Every object's offset in the cross-reference table points at that object.
    const xref = text.slice(text.lastIndexOf("xref"));
    const offsets = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((at, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, at), `object ${i + 1}`));
    assert.ok(job.name.endsWith("-all-time.pdf"));
  }
});

test("stepped report: the pages and the file made in steps equal the ones made at once, and cancelling stops it", async () => {
  const { layoutReport, pdfOfPages, wasCancelled } = await import("../src/application/report/job.ts");
  const data = fixture("sample");
  const config = { mode: "detail" as const, filters: emptyFilters(), period: { mode: "all" as const, anchor: "2026-11-11" }, sections: {}, parts: {} };
  const whole = buildReport(data, words, config);
  const progress: number[] = [];
  const pages = await layoutReport(data, words, config, (done) => progress.push(done));
  assert.deepEqual(pages.pages, whole.pages);
  const bytes = await pdfOfPages(pages, () => undefined);
  assert.deepEqual(bytes, whole.bytes);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(layoutReport(data, words, config, () => undefined, stop.signal), wasCancelled);
  await assert.rejects(pdfOfPages(pages, () => undefined, stop.signal), wasCancelled);
});
