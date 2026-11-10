/* Setting, changing and removing the PIN in one dialog: dots in the field, one keypad. */
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
const typeDigits = async (page, digits) => {
  for (const d of digits)
    await page.locator(".overlay .key", { hasText: new RegExp(`^${d}$`) }).click();
};
const openPinDialog = async (page) => {
  await page.locator(".navbar").getByText("More", { exact: true }).click();
  await page.getByText("Settings", { exact: true }).first().click();
  await page.getByText("Security", { exact: true }).first().click();
  await page.getByText("PIN code", { exact: true }).click();
};
const stored = (page) => page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1"));

await test("set a PIN: one keypad, digits appear masked in the field, nothing in plain text", async (page) => {
  await openPinDialog(page);
  assert((await page.locator(".overlay .keypad").count()) === 1, "not exactly one keypad");
  await typeDigits(page, "4827");
  assert((await page.locator(".overlay .keypad").count()) === 1, "a second keypad opened");
  const first = await page.getByRole("button", { name: "New PIN" }).innerText();
  assert(first.includes("••••") && !/\d/.test(first), `field shows ${JSON.stringify(first)}`);
  await page.getByRole("button", { name: "Confirm PIN" }).click();
  await typeDigits(page, "4827");
  const second = await page.getByRole("button", { name: "Confirm PIN" }).innerText();
  assert(second.includes("••••") && !/\d/.test(second), "confirmation is not masked");
  assert(
    !(await page.locator(".overlay").innerText()).includes("4827"),
    "digits shown in plain text",
  );
  await page.locator(".overlay .key.ok").click();
  const data = await stored(page);
  // a bare search for the digits could meet them inside a hash or an id: look at the stored PIN itself
  const pin = JSON.parse(data).settings.pin;
  assert(
    typeof pin === "object" && !JSON.stringify(pin).includes('"4827"'),
    "the PIN is stored in plain text",
  );
  assert(data.includes('"hash"'), "the PIN is not stored as a hash");
});

await test("a wrong count and a wrong confirmation are told at once; backspace edits; nothing is saved", async (page) => {
  await openPinDialog(page);
  const error = page.locator(".overlay .field-error");
  await typeDigits(page, "123");
  await page.locator(".overlay .key[aria-label='Backspace']").click();
  const t = await page.getByRole("button", { name: "New PIN" }).innerText();
  assert(t.includes("••") && !t.includes("•••"), "backspace did not remove a digit");
  assert((await error.count()) === 0, "an error before anything was tried");
  // the confirm key with two digits: the error is there at once, the second field is not reached
  await page.locator(".overlay .key.ok").click();
  assert((await error.innerText()).includes("4 or 6"), "no error for a short PIN");
  await typeDigits(page, "34");
  assert((await error.count()) === 0, "the error stayed with four digits");
  // five digits are wrong at once, without pressing anything
  await typeDigits(page, "5");
  assert((await error.innerText()).includes("4 or 6"), "no error for five digits");
  await page.locator(".overlay .key[aria-label='Backspace']").click();
  await page.locator(".overlay .key.ok").click(); // four digits: on to the confirmation
  await typeDigits(page, "1235");
  assert(
    (await error.innerText()).includes("do not match"),
    "a different confirmation is not told",
  );
  await page.locator(".overlay .key.ok").click();
  assert(!(await stored(page)).includes('"hash"'), "a PIN was saved");
});

await test("at most six digits, digits only", async (page) => {
  await openPinDialog(page);
  await typeDigits(page, "1234567");
  const first = await page.getByRole("button", { name: "New PIN" }).innerText();
  assert((first.match(/•/g) ?? []).length === 6, `the first field holds ${first}`);
  const keys = await page.locator(".overlay .key").allInnerTexts();
  assert(!keys.some((k) => /[a-z.]/i.test(k.trim())), "a key that is not a digit");
});

await test("a six-digit PIN moves to the confirmation by itself; change and turn off need the right current PIN", async (page) => {
  await openPinDialog(page);
  await typeDigits(page, "135790");
  // the full PIN passes on: the next digits go to the confirmation
  await typeDigits(page, "135790");
  await page.locator(".overlay .key.ok").click();
  assert((await stored(page)).includes('"hash"'), "the six-digit PIN was not saved");
  // turn off: wrong, then right
  await page.getByText("PIN code", { exact: true }).click();
  await typeDigits(page, "111111");
  await page.locator(".overlay .key.ok").click();
  await page.locator("#toast", { hasText: "Incorrect PIN" }).waitFor();
  assert((await stored(page)).includes('"hash"'), "the PIN was removed by a wrong PIN");
  for (let i = 0; i < 6; i++) await page.locator(".overlay .key[aria-label='Backspace']").click();
  await typeDigits(page, "135790");
  await page.locator(".overlay .key.ok").click();
  assert(!(await stored(page)).includes('"hash"'), "the right PIN did not turn the lock off");
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
