/* Statistics list only the categories that have money in the period. */
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const { server, address } = await serveApp();
const browser = await chromium.launch();
let failures = 0;
const assert = (c, m) => {
  if (!c) throw Error(m);
};
const test = async (name, fn) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 700 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${address}/index.html`);
    await page.evaluate(async () => {
      const { createSampleData } = await import("/tests/fixtures/sample-data.js");
      const { STORAGE_KEY, today } = await import("/js/core/constants.js");
      const d = createSampleData();
      const cats = d.categories.filter((c) => c.type === "expense" && !c.parent);
      d.ops = [];
      const iso = today();
      [cats[0], cats[1]].forEach((c, i) =>
        d.ops.push({
          id: `s${i}`,
          type: "expense",
          amount: 1000 * (i + 1),
          date: iso,
          comment: "",
          tags: [],
          from: d.accounts[0].id,
          category: c.id,
        }),
      );
      window.__expected = [cats[0].name, cats[1].name];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    });
    await page.reload();
    await page.waitForSelector(".navbar");
    await fn(page);
    if (errors.length) throw Error(errors[0]);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await context.close();
};
await test("only categories with money in the period are listed; an empty period shows the empty state", async (page) => {
  await page.locator(".navbar").getByText("Statistics", { exact: true }).click();
  await page.waitForSelector(".stats-category");
  const rows = await page.locator(".stats-category").count();
  assert(rows === 2, `expected 2 categories with money, saw ${rows}`);
  // the previous month has no operations: the empty state, no categories
  await page.locator("button[aria-label='Previous period']:visible").first().click();
  await page.waitForTimeout(400);
  assert(
    (await page.locator(".stats-category").count()) === 0,
    "categories shown in an empty period",
  );
  assert((await page.getByText("Statistics would be here").count()) === 1, "no empty state");
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
