/* Measures where the time of a long PDF report goes (model, fonts, layout, page pictures, PDF bytes),
   with the same steps as js/data/report-job.js, under an optional CPU slow-down.
   Usage: node tests/pdf-timing.mjs [operations] [cpuSlowdown] */
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const OPS = Number(process.argv[2] || 3800);
const SLOW = Number(process.argv[3] || 1);
const { server, address } = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(`${address}/index.html`);
await page.waitForSelector(".welcome, .navbar");
const client = await page.context().newCDPSession(page);
if (SLOW > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: SLOW });
const r = await page.evaluate(async (ops) => {
  const t = () => performance.now();
  const { createSampleData } = await import("/tests/fixtures/sample-data.js");
  const { setAppData, setFirstLaunch, appData } = await import("/js/core/state.js");
  const d = createSampleData();
  const exp = d.categories.find((c) => c.type === "expense");
  for (let i = 0; i < ops; i++)
    d.ops.push({ id: `p${i}`, type: "expense", amount: 100 + (i % 977), date: `202${i % 6}-0${1 + (i % 9)}-1${i % 9}`, comment: `Purchase number ${i} at the shop`, tags: [], from: d.accounts[0].id, category: exp.id });
  setAppData(d); setFirstLaunch(false);
  const { detailModel } = await import("/js/domain/report-model.js");
  const { layoutDetail } = await import("/js/data/report-layout.js");
  const { loadReportFonts } = await import("/js/platform/report-font.js");
  const { measuringContext, renderPages } = await import("/js/platform/report-render.js");
  const { buildPdf } = await import("/js/platform/pdf.js");
  const { emptyFilters } = await import("/js/core/state.js");
  const times = {};
  let s = t();
  const model = detailModel({ filters: emptyFilters(), period: { ...appData.settings, mode: "all" }, parts: { type: true, accounts: true, amount: true, comment: true, tags: true } });
  times.model = t() - s; s = t();
  const fonts = await loadReportFonts();
  times.fonts = t() - s; s = t();
  const pages = layoutDetail(model, measuringContext());
  times.layout = t() - s; s = t();
  const perPage = [];
  let last = t();
  const rendered = await renderPages(pages, () => { const n = t(); perPage.push(n - last); last = n; });
  times.render = t() - s; s = t();
  const bytes = await buildPdf(pages, fonts, { title: "t", subject: "Monivra", language: "en" });
  times.pdf = t() - s;
  const jpegBytes = rendered.reduce((a, p) => a + p.bytes.length, 0);
  perPage.sort((a, b) => a - b);
  return { pages: pages.length, commands: pages.reduce((a, p) => a + p.length, 0), times, perPageMedian: perPage[perPage.length >> 1], perPageMax: perPage.at(-1), pdfKB: Math.round(bytes.length / 1024), jpegKB: Math.round(jpegBytes / 1024) };
}, OPS);
console.log(JSON.stringify({ ops: OPS, cpuSlowdown: SLOW, ...r }, (k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v), 1));
await browser.close(); server.close();
