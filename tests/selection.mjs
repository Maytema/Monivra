/* Selecting operations across periods: select all / deselect all touch only the period on the screen. */
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
      const exp = d.categories.find((c) => c.type === "expense");
      d.ops = [];
      const base = new Date(today() + "T12:00:00");
      // 4 operations this month, 3 in the month before, 2 two months before: ids m0-*, m1-*, m2-*
      [
        [0, 4],
        [1, 3],
        [2, 2],
      ].forEach(([back, n]) => {
        for (let i = 0; i < n; i++) {
          const day = new Date(base.getFullYear(), base.getMonth() - back, 1 + i);
          const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
          d.ops.push({
            id: `m${back}-${i}`,
            type: "expense",
            amount: 1000 + i,
            date: iso,
            comment: "",
            tags: [],
            from: d.accounts[0].id,
            category: exp.id,
          });
        }
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    });
    await page.reload();
    await page.waitForSelector(".navbar");
    await page.locator(".navbar").getByText("Operations", { exact: true }).click();
    await page.waitForSelector(".op-row");
    await fn(page);
    if (errors.length) throw Error(errors[0]);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await context.close();
};
const count = async (page) =>
  Number((await page.locator(".ops-selection-header strong").innerText()).match(/\d+/)[0]);
const longPressFirst = async (page) => {
  const row = page.locator(".op-row").first();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForSelector(".ops-selection-header");
};
const prev = (page) => page.getByRole("button", { name: "Previous period" }).click();
const next = (page) => page.getByRole("button", { name: "Next period" }).click();
const box = (page) => page.locator(".ops-select-period");

await test("deselecting the period on the screen keeps the selections of the other periods", async (page) => {
  await longPressFirst(page); // 1 in this month
  assert((await count(page)) === 1, "start");
  await box(page).click(); // all 4 of this month
  assert((await count(page)) === 4, `this month all: ${await count(page)}`);
  await prev(page);
  await page.waitForTimeout(300);
  await box(page).click(); // all 3 of last month
  assert((await count(page)) === 7, `two months: ${await count(page)}`);
  await prev(page);
  await page.waitForTimeout(300);
  await box(page).click(); // all 2 of the month before
  assert((await count(page)) === 9, `three months: ${await count(page)}`);
  await box(page).click(); // deselect only this period
  assert((await count(page)) === 7, `after deselect of the third month: ${await count(page)}`);
  await next(page);
  await page.waitForTimeout(300);
  assert(
    (await box(page).getAttribute("aria-checked")) === "true",
    "last month should show as fully selected",
  );
  await box(page).click(); // deselect last month
  assert((await count(page)) === 4, `after deselect of last month: ${await count(page)}`);
  await next(page);
  await page.waitForTimeout(300);
  assert(
    (await box(page).getAttribute("aria-checked")) === "true",
    "this month stays fully selected",
  );
});

await test("partial selection: the box shows 'mixed' and one tap completes the period", async (page) => {
  await longPressFirst(page);
  assert((await box(page).getAttribute("aria-checked")) === "mixed", "mixed state");
  assert((await box(page).innerText()).includes("1/4"), `counter: ${await box(page).innerText()}`);
  await box(page).click();
  assert(
    (await count(page)) === 4 && (await box(page).getAttribute("aria-checked")) === "true",
    "completed",
  );
  assert((await box(page).getAttribute("aria-label")).length > 5, "label");
});

await test("switching the period never drops a selection", async (page) => {
  await longPressFirst(page);
  await prev(page);
  await next(page);
  await prev(page);
  await next(page);
  assert((await count(page)) === 1, `count after moving: ${await count(page)}`);
});

const bulkValue = (page, label) =>
  page.locator(".bulk-row", { hasText: label }).locator(".bulk-value").innerText();

await test("bulk edit: a chosen account and a typed comment show in the summary and are saved", async (page) => {
  await longPressFirst(page);
  await box(page).click();
  await page.locator(".selection-action", { hasText: "More" }).click();
  await page.waitForSelector(".bulk-row");
  // account
  await page.locator(".bulk-row", { hasText: "Account" }).locator(".bulk-field").click();
  const cards = page.locator(".counterparty-accounts button");
  const name = (await cards.nth(1).innerText()).split("\n")[0].trim();
  await cards.nth(1).click();
  await page.waitForSelector(".bulk-row");
  const account = await bulkValue(page, "Account");
  assert(account.includes(name), `account summary "${account}" should have "${name}"`);
  // comment
  await page.locator(".bulk-row", { hasText: "Comment" }).locator(".bulk-field").click();
  await page.locator('input[aria-label="Comment"]').fill("Group note");
  await page.getByRole("button", { name: "Complete" }).click();
  const comment = await bulkValue(page, "Comment");
  assert(comment === "Group note", `comment summary "${comment}"`);
  await page.getByRole("button", { name: "Confirm" }).first().click();
  await page.getByRole("button", { name: "Confirm" }).last().click();
  await page.waitForTimeout(400);
  const saved = await page.evaluate(async () => {
    const { appData } = await import("/js/core/state.js");
    const month = appData.ops.filter((o) => o.id.startsWith("m0-"));
    return { comments: month.map((o) => o.comment), accounts: month.map((o) => o.from) };
  });
  assert(
    saved.comments.every((c) => c === "Group note"),
    "comments not saved: " + saved.comments,
  );
  assert(new Set(saved.accounts).size === 1 && saved.accounts[0] !== null, "accounts not saved");
});

await test("bulk edit: tags show as separate chips without a plus sign, the date shows its target", async (page) => {
  await longPressFirst(page);
  await box(page).click();
  await page.locator(".selection-action", { hasText: "More" }).click();
  await page.waitForSelector(".bulk-row");
  await page.evaluate(async () => {});
  await page.locator(".bulk-row", { hasText: "Date" }).locator(".bulk-field").click();
  await page.locator(".calendar-day").filter({ hasText: /^15$/ }).first().click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  const date = await bulkValue(page, "Date");
  assert(/15/.test(date) && !/→|↑|↓/.test(date), `date summary "${date}"`);
  assert(/earlier|later|same|раньше|позже/i.test(date) === false, `mixed original dates must not claim a direction: "${date}"`);
  assert(!/^\s*[+−]/.test(await bulkValue(page, "Tags")), "tags summary has a sign");
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
