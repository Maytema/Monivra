/* How many page pictures the preview of a long report loads when it opens, before anyone scrolls.
   Usage: node tests/pdf-preview-images.mjs [operations] */
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";
const OPS = Number(process.argv[2] || 2000);
const { server, address } = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.goto(`${address}/index.html`);
await page.waitForSelector(".welcome, .navbar");
await page.evaluate(async (ops) => {
  const { createSampleData } = await import("/tests/fixtures/sample-data.js");
  const { setAppData, setFirstLaunch } = await import("/js/core/state.js");
  const d = createSampleData();
  const exp = d.categories.find((c) => c.type === "expense");
  for (let i = 0; i < ops; i++)
    d.ops.push({ id: `p${i}`, type: "expense", amount: 100 + (i % 977), date: `202${i % 6}-0${1 + (i % 9)}-1${i % 9}`, comment: `Purchase number ${i} at the shop`, tags: [], from: d.accounts[0].id, category: exp.id });
  setAppData(d); setFirstLaunch(false);
  const { render } = await import("/js/app/shell.js"); render(true);
}, OPS);
await page.waitForSelector(".navbar");
const t0 = Date.now();
await page.evaluate(async () => { (await import("/js/screens/export.js")).openExport(); });
await page.getByRole("button", { name: /Detailed transactions/ }).click();
await page.getByRole("button", { name: "Preview" }).click();
await page.waitForSelector(".report-pages img", { timeout: 60000 });
const opened = Date.now() - t0;
await page.waitForTimeout(3000);
const stats = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll(".report-pages img")];
  return { total: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, firstHeight: Math.round(imgs[0].getBoundingClientRect().height), lastHeight: Math.round(imgs.at(-1).getBoundingClientRect().height) };
});
console.log(JSON.stringify({ ops: OPS, openedMs: opened, ...stats }));
await browser.close(); server.close();
