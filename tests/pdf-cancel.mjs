/* The progress dialog of a PDF report: a tap outside does not dismiss it, Cancel really stops the work
   (no more pages are drawn), nothing opens afterwards, repeated taps make one job, a new request after
   Cancel works. Pages drawn are counted through canvas.toBlob, one call for each page. */
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const { server, address } = await serveApp();
const browser = await chromium.launch();
let failures = 0;
const assert = (c, m) => {
  if (!c) throw Error(m);
};
const check = async (name, fn) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${address}/index.html`);
    await page.waitForSelector(".welcome, .navbar");
    await page.evaluate(async () => {
      const { createSampleData } = await import("/tests/fixtures/sample-data.js");
      const { setAppData, setFirstLaunch } = await import("/js/core/state.js");
      const d = createSampleData();
      const exp = d.categories.find((c) => c.type === "expense");
      for (let i = 0; i < 2500; i++)
        d.ops.push({
          id: `p${i}`,
          type: "expense",
          amount: 100 + (i % 977),
          date: `202${i % 6}-0${1 + (i % 9)}-1${i % 9}`,
          comment: `Purchase number ${i} at the shop`,
          tags: [],
          from: d.accounts[0].id,
          category: exp.id,
        });
      setAppData(d);
      setFirstLaunch(false);
      window.__pages = 0;
      const original = window.HTMLCanvasElement.prototype.toBlob;
      window.HTMLCanvasElement.prototype.toBlob = function (...args) {
        window.__pages++;
        return original.apply(this, args);
      };
      const { render } = await import("/js/app/shell.js");
      render();
    });
    await page.locator(".navbar").getByText("More", { exact: true }).click();
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Export data", { exact: true }).click();
    await page.getByRole("button", { name: /Detailed transactions/ }).click();
    // A slower processor (like a phone) so that the job lasts long enough to be tapped on.
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 10 });
    await fn(page);
    if (errors.length) throw Error(errors[0]);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await page.close();
};
const drawn = (page) => page.evaluate(() => window.__pages);
const builds = (page) =>
  page.evaluate(async () => (await import("/js/data/report-cache.js")).cacheStats.builds);

await check(
  "Cancel stops the work; a tap outside does not close the dialog; nothing opens later",
  async (page) => {
    const preview = page.locator(".page-footer button.primary");
    await preview.click();
    const dialog = page.locator(".overlay.dialog");
    await dialog.waitFor();
    // feedback is immediate: the button is busy
    assert(
      (await preview.getAttribute("aria-busy")) === "true",
      "the button gives no busy feedback",
    );
    // repeated taps (this button and another) make no second job
    await preview.click({ force: true }).catch(() => {});
    await page
      .getByRole("button", { name: "Save", exact: true })
      .click({ force: true })
      .catch(() => {});
    // a tap outside the dialog panel (on the dimmed area)
    await page.mouse.click(5, 5);
    assert(
      (await dialog.count()) === 1,
      "a tap outside dismissed the progress dialog " +
        (await drawn(page)) +
        " " +
        (await page.locator(".report-pages").count()),
    );
    assert((await builds(page)) === 1, "more than one job was started");
    const atCancel = await drawn(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForTimeout(100);
    const stopped = await drawn(page);
    await page.waitForTimeout(900);
    assert((await drawn(page)) === stopped, "pages are still drawn after Cancel");
    console.log(`     pages drawn at Cancel: ${atCancel}, after: ${stopped}`);
    assert((await page.locator(".report-pages").count()) === 0, "a preview opened after Cancel");
    assert((await preview.getAttribute("aria-busy")) === "false", "the button stays busy");
    // the same request again works from the start
    await preview.click();
    await page.locator(".report-pages img").first().waitFor({ timeout: 90000 });
    assert((await builds(page)) === 2, "the second request did not make a new job");
  },
);

await check("Back cancels the work too", async (page) => {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.locator(".overlay.dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".overlay.dialog").waitFor({ state: "detached" });
  const stopped = await drawn(page);
  await page.waitForTimeout(800);
  assert((await drawn(page)) === stopped, "pages are still drawn after Back");
  assert((await page.locator(".report-pages").count()) === 0, "a preview opened after Back");
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
