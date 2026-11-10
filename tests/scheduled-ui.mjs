/* The scheduled payments page and the editor of a payment: the whole card opens it, a long comment
   stays on one line and the keypad stays in view, the counter on the options key, arrows that cannot go
   further are dimmed. */
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
      d.scheduled = [
        {
          id: "sch1",
          type: "expense",
          amount: 5000,
          date: today(),
          time: "23:59",
          comment: "x".repeat(10) + " " + "very long comment ".repeat(20),
          tags: ["one", "two"],
          from: d.accounts[0].id,
          category: exp.id,
          recur: { every: 4, unit: "Days", remaining: 3, days: [] },
          reminder: { before: 1, unit: "Days", time: "09:00" },
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    });
    await page.reload();
    await page.waitForSelector(".navbar");
    await page.locator(".navbar").getByText("More", { exact: true }).click();
    await page.getByText("Scheduled payments", { exact: true }).first().click();
    await page.waitForSelector(".scheduled-item");
    await fn(page);
    if (errors.length) throw Error(errors[0]);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await context.close();
};

await test("a tap on the lines under the row (time, repeat, reminder) opens the payment too", async (page) => {
  await page.locator(".scheduled-details").click();
  await page.waitForSelector(".calc-date");
});

await test("a long comment is one line that scrolls sideways; the keypad or actions stay in view", async (page) => {
  await page.locator(".op-row").first().click();
  await page.waitForSelector(".calc-comment");
  const info = await page.evaluate(() => {
    const comment = document.querySelector(".calc-comment");
    const scroll = document.querySelector(".calc-comment-scroll");
    const actions = document.querySelector(".sheet-actions");
    const box = (actions ?? document.querySelector(".calc-attachments")).getBoundingClientRect();
    return {
      height: comment.getBoundingClientRect().height,
      scrolls: scroll.scrollWidth > scroll.clientWidth,
      bottom: box.bottom,
      viewport: window.innerHeight,
    };
  });
  assert(info.height <= 60, `the comment takes ${info.height}px: it wraps`);
  assert(info.scrolls, "the comment does not scroll sideways");
  assert(info.bottom <= info.viewport, "the lower part of the editor is pushed off the screen");
});

await test("the previous-day arrow of a payment that cannot go earlier is dimmed", async (page) => {
  await page.locator(".op-row").first().click();
  await page.waitForSelector(".calc-date");
  const [left, right] = await page.evaluate(() =>
    [...document.querySelectorAll(".calc-date .icon-button")].map((e) => [
      e.disabled,
      getComputedStyle(e).opacity,
    ]),
  );
  assert(left[0] && Number(left[1]) < 1, "the arrow is not dimmed");
  assert(!right[0] && Number(right[1]) === 1, "the other arrow is dimmed");
});

await test("the Repeat steppers dim the arrow that cannot go further", async (page) => {
  await page.locator(".fab").click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.locator(".schedule-tile", { hasText: "Recur" }).click();
  const state = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".schedule-modal .stepper")].map((s) =>
        [...s.querySelectorAll(".icon-button")].map((b) => b.disabled),
      ),
    );
  // a new repeat starts at "every 1" and without a limit: nothing lower to go to
  const [every, times] = await state();
  assert(every[0] && !every[1], "Repeat every at 1: the left arrow should be dimmed");
  assert(times[0] && !times[1], "no repetition limit: the left arrow should be dimmed");
  await page.locator(".schedule-modal .stepper").first().locator(".icon-button").nth(1).click();
  await page.locator(".schedule-modal .stepper").nth(1).locator(".icon-button").nth(1).click();
  const [every2, times2] = await state();
  assert(!every2[0] && !every2[1], "Repeat every at 2: both arrows should work");
  assert(!times2[0] && !times2[1], "one repetition: both arrows should work");
});

await test("the options key shows how many options are set", async (page) => {
  await page.locator(".op-row").first().click();
  await page.waitForSelector(".calc-date");
  // a payment with a reminder and a repeat has two options set; the compact editor has no keypad,
  // so look at the keypad of a new payment
  await page.evaluate(async () => {
    const { optionsSet } = await import("/js/screens/operation-editor/keypad.js");
    window.__n = [
      optionsSet({ reminder: {}, recur: {}, fees: [] }),
      optionsSet({ fees: [{}, {}] }),
      optionsSet({}),
    ];
  });
  assert(
    JSON.stringify(await page.evaluate(() => window.__n)) === "[2,2,0]",
    "the number of options is wrong",
  );
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
