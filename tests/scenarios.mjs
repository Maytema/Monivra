// User scenarios in a phone-sized browser: node tests/scenarios.mjs
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const image = (name) => ({ name, mimeType: "image/png", buffer: PIXEL_PNG });

const { server, address } = await serveApp();
const browser = await chromium.launch();

// A fresh phone-sized page with the sample data (plus whatever `adjust` changes in it) stored.
async function openApp({ height = 700, adjust = () => {}, motion = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 360, height },
    isMobile: true,
    hasTouch: true,
    reducedMotion: motion ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.goto(`${address}/index.html`);
  const stored = await page.evaluate(async (adjustSource) => {
    const { createSampleData } = await import("/js/data/sample.js");
    const { STORAGE_KEY } = await import("/js/core/constants.js");
    const data = createSampleData();
    new Function("data", adjustSource)(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  }, `(${adjust})(data)`);
  if (!stored) throw Error("The data was not stored");
  await page.reload();
  await page.waitForSelector(".navbar");
  return page;
}
const tab = (page, name) => page.locator(".navbar").getByText(name, { exact: true }).click();
const openEditorOn = async (page, categoryName) => {
  await tab(page, "Categories");
  await page.locator(".cat-tile", { hasText: categoryName }).first().click();
  await page.waitForSelector(".calc-keypad");
};
// A swipe of `dx` pixels; with `release` off the finger stays down after `steps` of the way.
const swipe = (page, selector, dx, { steps = [0.25, 0.5, 0.75, 1], release = true } = {}) =>
  page.locator(selector).evaluate(
    (el, [shift, parts, lift]) => {
      const touch = (x) =>
        new globalThis.Touch({
          identifier: 1,
          target: el,
          clientX: x,
          clientY: 200,
          radiusX: 1,
          radiusY: 1,
        });
      const send = (type, x) =>
        el.dispatchEvent(
          new globalThis.TouchEvent(type, {
            bubbles: true,
            touches: type === "touchend" ? [] : [touch(x)],
            changedTouches: [touch(x)],
          }),
        );
      send("touchstart", 200);
      for (const step of parts) send("touchmove", 200 + shift * step);
      if (lift) send("touchend", 200 + shift * parts.at(-1));
    },
    [dx, steps, release],
  );
const typeAmountAndSave = async (page, digit) => {
  await page.locator(".calc-key", { hasText: digit }).first().click();
  await page.locator(".calc-confirm").click();
};

const scenarios = {
  async "a subcategory is chosen on a row and shows in the history"(page) {
    await openEditorOn(page, "Food");
    const chips = page.locator(".calc-sub");
    expect(await chips.count()).toBe(2);
    await chips.filter({ hasText: "Cafe" }).click();
    await typeAmountAndSave(page, "5");
    await tab(page, "Operations");
    expect(await page.locator(".op-name").first().innerText()).toBe("Food (Cafe)");
  },
  async "a subcategory has no tile of its own in the category chooser"(page) {
    await tab(page, "Operations");
    await page.getByRole("button", { name: "Add" }).click();
    expect(await page.locator(".add-item", { hasText: "Cafe" }).count()).toBe(0);
    expect(await page.locator(".add-item", { hasText: "Food" }).count()).toBe(1);
  },
  async "photos are listed under the buttons, limited, and removable"(page) {
    await openEditorOn(page, "Food");
    for (let n = 0; n < 5; n++) {
      await page.getByLabel("Attachment").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Choose from gallery").click(),
      ]);
      await chooser.setFiles(image(`photo${n}.png`));
      await page.locator(".calc-photo").nth(n).waitFor();
    }
    expect(await page.locator(".calc-photo").count()).toBe(5);
    // All five thumbnails fit in one row without scrolling.
    expect(
      await page.locator(".calc-photos").evaluate((row) => row.scrollWidth <= row.clientWidth),
    ).toBe(true);
    const strip = await page.locator(".calc-photos").boundingBox();
    const keypad = await page.locator(".calc-keypad").boundingBox();
    expect(strip.y + strip.height <= keypad.y + 1).toBe(true);
    await page.getByLabel("Attachment").click();
    expect(await page.locator(".photo-menu").count()).toBe(0);
    await page.locator(".calc-photo .icon-button").first().click();
    expect(await page.locator(".calc-photo").count()).toBe(4);
  },
  async "the photo viewer closes on a tap outside the picture"(page) {
    await openEditorOn(page, "Food");
    await page.getByLabel("Attachment").click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Choose from gallery").click(),
    ]);
    await chooser.setFiles(image("photo.png"));
    await page.locator(".calc-photo-open").click();
    await page.locator(".photo-viewer").waitFor();
    await page.mouse.click(10, 400);
    expect(await page.locator(".photo-viewer").count()).toBe(0);
  },
  async "an opened operation offers saving as soon as it is changed"(page) {
    await openEditorOn(page, "Food");
    await typeAmountAndSave(page, "5");
    await tab(page, "Operations");
    await page.locator(".op-name").first().click();
    expect(await page.locator(".ops-compact-editor .sheet-actions").count()).toBe(1);
    await page.locator(".calc-comment .icon-button, .calc-attachments .icon-button").nth(1).click();
    await page.keyboard.type("note");
    await page.getByText("OK", { exact: true }).click();
    expect(await page.locator(".calc-keypad").count()).toBe(1);
  },
  async "an opened operation has the same sizes on a short and on a tall screen"(page) {
    const measure = async () => {
      await page.locator(".op-name").first().click();
      await page.locator(".ops-compact-editor").waitFor();
      const sizes = await page.evaluate(() => {
        const height = (selector) =>
          document.querySelector(selector).getBoundingClientRect().height;
        return [".calc-date", ".calc-tile", ".sheet-action-icon"].map(height);
      });
      await page.mouse.click(180, 8);
      await page.locator(".ops-compact-editor").waitFor({ state: "detached" });
      return sizes;
    };
    await openEditorOn(page, "Food");
    await typeAmountAndSave(page, "5");
    await tab(page, "Operations");
    await page.setViewportSize({ width: 360, height: 800 });
    const tall = await measure();
    await page.setViewportSize({ width: 360, height: 640 });
    const short = await measure();
    expect(short.join()).toBe(tall.join());
    expect(tall[2]).toBe(56);
  },
  async "a long press selects an operation without moving the list"(page) {
    await tab(page, "Operations");
    await page.locator(".op-row").first().waitFor();
    const row = page.locator(".op-row").nth(2);
    await page.locator("#base .content").evaluate((el) => (el.scrollTop = 150));
    await row.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch" });
    await page.locator(".op-row.selected").waitFor();
    expect(await page.locator("#base .content").evaluate((el) => el.scrollTop > 0)).toBe(true);
  },
  async "the chosen period comes back from the operations of an account and of a category"(page) {
    const label = async () => (await page.locator("#base .period .label").textContent()).trim();
    await tab(page, "Statistics");
    const chosen = await label();
    await page.locator(".account-group, .navbar").first().waitFor();
    await tab(page, "Accounts");
    await page.locator(".account-group button").first().click();
    await page.locator(".sheet-action", { hasText: "Operations" }).click();
    expect(await label()).toBe("All time");
    await page.getByLabel("Back").click();
    await tab(page, "Statistics");
    expect(await label()).toBe(chosen);
    await page.locator(".stats-category").first().click();
    await page.locator(".sheet-action", { hasText: "Operations" }).click();
    await page.locator(".period-arrows").getByLabel("Previous period").click();
    expect((await label()) === chosen).toBe(false);
    await page.getByLabel("Back").click();
    expect(await label()).toBe(chosen);
  },
  async "the comment field opens with the caret after the text"(page) {
    await openEditorOn(page, "Food");
    await page.getByLabel("Comment").first().click();
    await page.keyboard.type("hello");
    await page.getByText("OK", { exact: true }).click();
    await page.locator(".calc-comment-text").click();
    const caret = await page.evaluate(() => document.activeElement.selectionStart);
    expect(caret).toBe(5);
  },
  async "a page keeps its scroll position when the next page is closed"(page) {
    await tab(page, "More");
    await page.getByText("Settings", { exact: true }).first().click();
    await page.waitForSelector(".content");
    await page.evaluate(() => (document.querySelector(".content").scrollTop = 40));
    await page.getByText("Exchange rates").first().dispatchEvent("click");
    await page.getByLabel("Back").first().click();
    expect(await page.evaluate(() => document.querySelector(".content").scrollTop)).toBe(40);
  },
  async "a photo that cannot be used is refused with a plain message"(page) {
    await openEditorOn(page, "Food");
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(40),
    ]);
    const refused = {
      "not fully on the phone": Buffer.alloc(0),
      "format is not supported": heif,
      "is damaged": Buffer.from("this is not an image"),
    };
    for (const [message, buffer] of Object.entries(refused)) {
      await page.getByLabel("Attachment").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Choose from gallery").click(),
      ]);
      await chooser.setFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer });
      const toast = page.locator("#toast");
      await page.getByText(message, { exact: false }).waitFor();
      expect(await toast.innerText()).toMatch(/^[^()]*$/);
      expect(await page.locator(".calc-photo").count()).toBe(0);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
  },
  async "a photo cut short is attached as far as it goes, and a turned one is straightened"(page) {
    await openEditorOn(page, "Food");
    // A wide picture; its end is missing, and a second copy says it must be turned a quarter.
    const [cut, turned] = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 100;
      const context = canvas.getContext("2d");
      context.fillStyle = "#3a7";
      context.fillRect(0, 0, 200, 100);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const exif = [0xff, 0xe1, 0, 34, ...[..."Exif"].map((c) => c.charCodeAt(0)), 0, 0];
      exif.push(0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0);
      exif.push(0, 0, 0, 0);
      return [
        [...bytes.slice(0, bytes.length - 40)],
        [...bytes.slice(0, 2), ...exif, ...bytes.slice(2)],
      ];
    });
    for (const [index, bytes] of [cut, turned].entries()) {
      await page.getByLabel("Attachment").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Choose from gallery").click(),
      ]);
      await chooser.setFiles({
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(bytes),
      });
      await page.locator(".calc-photo").nth(index).waitFor();
    }
    const sizes = await page
      .locator(".calc-photo img")
      .evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight]));
    expect(sizes[0].join("x")).toBe("200x100");
    expect(sizes[1].join("x")).toBe("100x200");
  },
  async "the calculator adds up and the check saves the result"(page) {
    await openEditorOn(page, "Food");
    await page.getByLabel("Additionally").dblclick();
    for (const key of ["2", "+", "3"])
      await page.locator(".calc-key", { hasText: key }).first().click();
    await page.locator(".calc-confirm").click();
    expect(await page.locator(".calc-number input").inputValue()).toBe("5");
    await page.locator(".calc-confirm").click();
    await tab(page, "Operations");
    expect(await page.locator(".op-amount").first().innerText()).toMatch(/5/);
  },
  async "an amount in another currency is edited on both sides"(page) {
    await openEditorOn(page, "Food");
    expect(await page.locator(".dual-number").count()).toBe(2);
    await page.locator(".dual-number.dual-receive .dual-value").click();
    expect(await page.locator(".dual-active").getAttribute("class")).toMatch(/dual-receive/);
    await page.locator(".calc-key", { hasText: "7" }).first().click();
    expect(await page.locator(".dual-receive .dual-value").innerText()).toMatch(/^7 USD/);
    await page.locator(".calc-confirm").click();
    await tab(page, "Operations");
    expect(await page.locator(".op-name").first().innerText()).toBe("Food");
  },
  async "a bulk edit writes one comment on the selected operations"(page) {
    await openEditorOn(page, "Food");
    await typeAmountAndSave(page, "5");
    await tab(page, "Operations");
    const box = await page.locator(".op-row").first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.locator(".selection-action", { hasText: "More" }).click();
    await page.locator(".bulk-field", { hasText: "Comment" }).click();
    await page.getByRole("textbox", { name: "Comment" }).fill("shared");
    await page.getByText("Complete", { exact: true }).click();
    await page.getByText("Confirm", { exact: true }).click();
    await page.getByText("Confirm", { exact: true }).last().click();
    await page.getByText("Operations updated").waitFor();
    expect(await page.locator(".op-comment").first().innerText()).toBe("shared");
  },
  async "a new account is created from the form and keeps the typed name"(page) {
    await tab(page, "Accounts");
    await page.getByLabel("New account").first().click();
    await page.locator(".account-type-choice", { hasText: "Savings" }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("Holiday fund");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Account saved").waitFor();
    expect(await page.getByText("Holiday fund").count()).toBe(1);
  },
  async "an account without a name is refused"(page) {
    await tab(page, "Accounts");
    await page.getByLabel("New account").first().click();
    await page.locator(".account-type-choice", { hasText: "Regular" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Enter a name").waitFor();
    expect(await page.locator(".account-editor-bottom").count()).toBe(1);
  },
  async "a filter list keeps its buttons in view and applies the choice"(page) {
    await tab(page, "Operations");
    await page.getByLabel("Operation search").first().click();
    await page.locator("[aria-label=Filters]").first().click();
    await page.locator(".panel .field", { hasText: "Type" }).first().click();
    const confirm = page.locator(".sheet-footer").getByRole("button", { name: "Confirm" }).last();
    const box = await confirm.boundingBox();
    expect(box.y + box.height <= page.viewportSize().height).toBe(true);
    // The bar ends where the sheet ends: nothing that scrolls shows under it.
    const sheetBottom = await page
      .locator(".overlay .panel")
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const footerBottom = await page
      .locator(".sheet-footer")
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    expect(Math.round(footerBottom)).toBe(Math.round(sheetBottom));
    await page.locator(".filter-choice", { hasText: "Transfers" }).click();
    await page.getByText("2 selected").waitFor();
    await confirm.click();
    await page.getByText("Expenses, Incomes").waitFor();
  },
  async "a payment that came due is posted on its own and the notice leads to the operations"(
    page,
  ) {
    await page.getByText("scheduled payment was added", { exact: false }).click();
    await page.locator(".op-row").first().waitFor();
    expect(await page.getByText("was added", { exact: false }).count()).toBe(0);
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem("monivra.offline.2026.v1")).scheduled.length,
    );
    expect(stored).toBe(0);
  },
  async "an operation moved to a future day becomes a scheduled payment"(page) {
    await tab(page, "Operations");
    await page.locator(".op-row").first().click();
    await page.getByLabel("Next day").click();
    await page.locator(".calc-confirm").click();
    await page.getByText("Payment scheduled").waitFor();
    const [operations, scheduled] = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("monivra.offline.2026.v1"));
      return [data.ops.some((o) => o.id === "today"), data.scheduled.some((o) => o.id === "today")];
    });
    expect(operations).toBe(false);
    expect(scheduled).toBe(true);
  },
  async "operations of scheduled payments are marked and can be shown alone or left out"(page) {
    await tab(page, "Operations");
    await page.getByLabel("Operation search").first().click();
    const choose = async (...clicks) => {
      await page.locator("[aria-label=Filters]").first().click();
      await page.locator(".panel .field", { hasText: "How added" }).first().click();
      for (const name of clicks) await page.locator(".filter-choice", { hasText: name }).click();
      await page.locator(".sheet-footer").last().getByRole("button", { name: "Confirm" }).click();
      await page.locator(".sheet-footer").last().getByRole("button", { name: "Apply" }).click();
    };
    const shown = () => page.locator(".op-row").count();
    await page.locator(".op-row").first().waitFor();
    const all = await shown();
    expect(await page.locator(".op-schedule").count()).toBe(3);
    expect(await page.locator(".op-schedule", { hasText: "by hand" }).count()).toBe(1);
    // Both are chosen at first: a tap takes one away.
    await choose("By hand");
    expect(await shown()).toBe(3);
    await choose("By hand", "By schedule");
    expect(await shown()).toBe(all - 3);
  },
  async "a budget card shows its operations, the pencil opens the editor, deleting returns to the list"(
    page,
  ) {
    await tab(page, "More");
    await page.getByText("Budgets", { exact: true }).first().click();
    await page.locator(".budget-card").click();
    await page.locator(".op-row").first().waitFor();
    expect(await page.locator(".op-row").count()).toBe(2);
    await page.locator(".period-arrows").getByLabel("Previous period").click();
    expect(await page.locator(".op-row").count()).toBe(0);
    await page.getByLabel("Edit budget").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await page.getByText("Budget deleted").waitFor();
    expect(await page.getByText("Budgets will be here").count()).toBe(1);
  },
  async "a daily budget shows one day, and the arrows move it by a day"(page) {
    await tab(page, "More");
    await page.getByText("Budgets", { exact: true }).first().click();
    await page.locator(".budget-card").click();
    await page.locator(".op-row").first().waitFor();
    const title = async () => (await page.locator(".period .label").first().innerText()).trim();
    const today = await title();
    expect(await page.locator(".op-row").count()).toBe(2);
    await page.locator(".period-arrows").getByLabel("Previous period").click();
    expect(await page.locator(".op-row").count()).toBe(1);
    expect((await title()) === today).toBe(false);
    await page.locator(".period-arrows").getByLabel("Next period").click();
    expect(await page.locator(".op-row").count()).toBe(2);
    expect((await title()) === today).toBe(true);
  },
  async "a long press on a budget card offers to edit or delete it"(page) {
    await tab(page, "More");
    await page.getByText("Budgets", { exact: true }).first().click();
    const card = page.locator(".budget-card").first();
    const box = await card.boundingBox();
    await card.dispatchEvent("pointerdown", {
      pointerId: 1,
      clientX: box.x + 40,
      clientY: box.y + 30,
      pointerType: "touch",
    });
    await page.locator(".popup-item", { hasText: "Edit" }).waitFor();
    await page.locator(".popup-item", { hasText: "Delete" }).waitFor();
    await page.locator(".popup-item", { hasText: "Edit" }).click();
    await page.getByLabel("Title").waitFor();
    await page.getByLabel("Back").click();
    expect(await page.locator(".budget-card").count()).toBe(1);
  },
  async "a payment far behind is asked about: adding posts what was missed, skipping does not"(
    page,
  ) {
    await page.getByText("Missed payments", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("scheduled payments were added", { exact: false }).waitFor();
    expect(await page.getByText("Missed payments", { exact: true }).count()).toBe(0);
    const [added, left] = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("monivra.offline.2026.v1"));
      return [data.ops.filter((o) => o.fromSchedule?.id === "old").length, data.scheduled.length];
    });
    expect(added >= 41).toBe(true);
    expect(left).toBe(1);
  },
  async "skipping the missed payments adds nothing"(page) {
    await page.getByText("Missed payments", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    expect(await page.getByText("Missed payments", { exact: true }).count()).toBe(0);
    const added = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("monivra.offline.2026.v1")).ops.filter(
          (o) => o.fromSchedule?.id === "old",
        ).length,
    );
    expect(added).toBe(0);
  },
  async "a date more than a year away is confirmed before saving"(page) {
    await openEditorOn(page, "Food");
    await page.locator(".calc-key", { hasText: "5" }).first().click();
    for (let i = 0; i < 366; i++) await page.getByLabel("Next day").click();
    await page.locator(".calc-confirm").click();
    await page.getByText("Check the date", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Payment scheduled").waitFor();
  },
  async "a scheduled payment can start tomorrow at the earliest, today and the past are dimmed"(
    page,
  ) {
    await tab(page, "More");
    await page.getByText("Scheduled payments", { exact: true }).first().click();
    await page.locator(".fab-add, .empty-state button").first().click();
    await page.locator(".calendar-day.today").waitFor();
    expect(await page.locator(".calendar-day.today").isDisabled()).toBe(true);
    expect(await page.getByRole("button", { name: "Today", exact: true }).count()).toBe(0);
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await page.locator(".add-item").first().click();
    expect(await page.getByLabel("Previous day").isDisabled()).toBe(true);
  },
  async "a payment scheduled for the future shows a notice with an arrow that opens the scheduled payments"(
    page,
  ) {
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem("monivra.offline.2026.v1")).scheduled.length,
    );
    await tab(page, "Operations");
    await page.getByLabel("Add").first().click();
    await page.locator(".add-item").first().click();
    await page.locator(".calc-key", { hasText: "5" }).first().click();
    await page.getByLabel("Next day").click();
    await page.locator(".calc-confirm").click();
    const notice = page.locator("#notice.tappable");
    await notice.getByText("Payment scheduled").waitFor();
    expect(await notice.locator("svg").count()).toBe(2);
    await notice.click();
    await page.getByText("Scheduled payments", { exact: true }).first().waitFor();
    expect(await page.locator(".scheduled-item").count()).toBe(before + 1);
  },
  async "the notice about a scheduled payment shows the payment itself, flashed"(page) {
    await tab(page, "Operations");
    await page.getByLabel("Add").first().click();
    await page.locator(".add-item").first().click();
    await page.locator(".calc-key", { hasText: "5" }).first().click();
    await page.getByLabel("Next day").click();
    await page.locator(".calc-confirm").click();
    await page.locator("#notice.tappable").click();
    const flashed = page.locator(".scheduled-item.spot");
    await flashed.waitFor();
    expect(await flashed.count()).toBe(1);
  },
  async "the period chosen stays after a reload"(page) {
    await tab(page, "Operations");
    expect(/All time/.test(await page.locator(".period .label").first().innerText())).toBe(false);
    await page.locator(".period .label").first().click();
    await page.getByText("All time", { exact: true }).first().click();
    await page.reload();
    await page.waitForSelector(".navbar");
    await tab(page, "Operations");
    expect(await page.locator(".period .label").first().innerText()).toMatch(/All time/);
  },
  async "with motion: the digits of the balance roll and the plain text comes back"(page) {
    // The balance rolls once when the application opens.
    await page.waitForFunction(() => !document.querySelector(".hero .balance .reel"));
    const text = await page.locator(".hero .balance").textContent();
    const rolling = await page.evaluate(async () => {
      const { rollNumber } = await import("/js/ui/reel.js");
      const element = document.querySelector(".hero .balance");
      rollNumber(element, null, true);
      return element.querySelectorAll(".reel").length;
    });
    expect(rolling > 0).toBe(true);
    await page.waitForFunction(() => !document.querySelector(".hero .balance .reel"));
    expect(await page.locator(".hero .balance").textContent()).toBe(text);
  },
  async "with motion: dragging the categories without turning the page does not replay the amounts"(
    page,
  ) {
    await tab(page, "Categories");
    await page.waitForFunction(
      () =>
        !document
          .getAnimations()
          .some((a) => a.animationName === "money-in" && a.playState === "running"),
    );
    await swipe(page, "#base > .swipe-pane", -150, { steps: [0.3, 0.6], release: false });
    expect(await page.locator(".pager-viewport").count()).toBe(1);
    expect(await page.locator(".pager-viewport .money-in").count()).toBe(0);
  },
  async "with motion: the amounts of the category tiles settle in when the tab opens"(page) {
    await tab(page, "Categories");
    expect((await page.locator(".cat-tile .money.money-in").count()) > 0).toBe(true);
  },
  async "partial deletion removes the records and keeps the settings, deleting local data starts from scratch"(
    page,
  ) {
    const stored = () =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("monivra.offline.2026.v1"));
        return [data.accounts.length, data.ops.length, data.settings.accent];
      });
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Delete my data", { exact: true }).click();
    await page.getByText("Partial deletion", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Data deleted").waitFor();
    expect((await stored()).join()).toBe("0,0,#0b6aa8");
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Delete my data", { exact: true }).click();
    await page.getByText("Delete local data", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Data deleted").waitFor();
    expect((await stored())[2]).toBe("#a000b8");
  },
  async "the button of a support page is pinned under the scrolling text"(page) {
    await tab(page, "More");
    await page.getByText("Support", { exact: true }).click();
    await page.getByText("Report a bug", { exact: true }).click();
    expect(await page.locator(".content .page-footer, .content button.primary").count()).toBe(0);
    expect(await page.locator(".page-footer button", { hasText: "Continue" }).count()).toBe(1);
  },
  async "the figures of a budget stay above the scrolling operations"(page) {
    await tab(page, "More");
    await page.getByText("Budgets", { exact: true }).first().click();
    await page.locator(".budget-card").click();
    expect(await page.locator(".content .budget-card").count()).toBe(0);
    expect(await page.locator(".budget-pinned .budget-card").count()).toBe(1);
  },
  async "the interface mode and the colour change the whole application"(page) {
    await tab(page, "More");
    await page.getByText("Settings", { exact: true }).first().click();
    await page.getByText("Styles and elements").click();
    await page.getByText("Global").click();
    await page.getByText("Interface mode").click();
    await page.getByText("Dark", { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      true,
    );
    await page.getByText("Color theme").click();
    await page.getByLabel("#0b6aa8").click();
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent")),
    ).toBe("#0b6aa8");
  },
  async "a swipe in the calendar moves by a month"(page) {
    await tab(page, "Operations");
    await page.locator(".period .label").first().click();
    await page.getByText("Choose a day", { exact: true }).click();
    const title = page.locator(".calendar-title");
    const before = await title.innerText();
    await swipe(page, ".panel:has(.calendar-head)", -150);
    const next = await title.innerText();
    await swipe(page, ".panel:has(.calendar-head)", 150);
    expect(next === before).toBe(false);
    expect(await title.innerText()).toBe(before);
  },
  async "a saved operation shows a notice with an arrow that leads to it, highlighted"(page) {
    await openEditorOn(page, "Food");
    await typeAmountAndSave(page, "5");
    const notice = page.locator("#notice.tappable");
    await notice.getByText("Operation saved").waitFor();
    expect(await notice.locator("svg").count()).toBe(2);
    await notice.click();
    await page.locator(".op-row.spot").waitFor();
    expect(await page.locator(".op-row.spot").count()).toBe(1);
  },
  async "an operation saved on the list that shows it is only highlighted, there is no notice"(
    page,
  ) {
    await tab(page, "Operations");
    await page.getByLabel("Add").first().click();
    await page.locator(".add-item").first().click();
    await page.locator(".calc-key", { hasText: "5" }).first().click();
    await page.locator(".calc-confirm").click();
    await page.locator(".op-row.spot").waitFor();
    expect(await page.locator("#notice.show").count()).toBe(0);
  },
  async "a quiet notice for an operation seen elsewhere, an important one for a payment that stays longer"(
    page,
  ) {
    await tab(page, "Categories");
    const save = async (nextDay) => {
      await page.locator(".cat-tile").first().click();
      await page.locator(".calc-key", { hasText: "5" }).first().click();
      if (nextDay) await page.getByLabel("Next day").click();
      await page.locator(".calc-confirm").click();
      await page.locator("#notice.show").waitFor();
    };
    const place = () =>
      page.evaluate(() => {
        const box = document.querySelector("#notice").getBoundingClientRect();
        const bar = document.querySelector(".navbar").getBoundingClientRect();
        const balance = document.querySelector("#base .hero").getBoundingClientRect();
        return {
          aboveBar: box.bottom <= bar.top,
          belowBalance: box.top > balance.bottom,
          height: box.height,
        };
      });
    await save(false);
    expect(await page.locator("#notice.quiet").count()).toBe(1);
    const quiet = await place();
    expect(quiet.aboveBar && quiet.belowBalance).toBe(true);
    // As small as a plain message.
    expect(quiet.height < 46).toBe(true);
    await page.waitForFunction(
      () => !document.querySelector("#notice").classList.contains("show"),
      null,
      { timeout: 4000 },
    );
    await save(true);
    expect(await page.locator("#notice.important .notice-detail").count()).toBe(1);
    const important = await place();
    expect(important.aboveBar && important.belowBalance).toBe(true);
    // Still there when a quiet one would have gone.
    await page.waitForTimeout(3600);
    expect(await page.locator("#notice.show").count()).toBe(1);
    // It leads to the payment.
    await page.locator("#notice.show").click();
    await page.locator(".scheduled-item.spot").waitFor();
  },
  async "the period of a filtered page is changed by a swipe"(page) {
    await page.evaluate(async () => {
      const { openFilteredOperations } = await import("/js/screens/operations/list.js");
      openFilteredOperations({ types: ["expense"] });
    });
    const title = page.locator(".swipe-pane .period .label");
    const before = await title.innerText();
    await swipe(page, "#base > .swipe-pane", 160);
    await page.waitForFunction(
      (t) => document.querySelector(".swipe-pane .period .label").innerText !== t,
      before,
    );
  },
  async "the budgets look at one month: the title opens the calendar and leaving restores the period"(
    page,
  ) {
    await tab(page, "Operations");
    await page.locator(".period .label").first().click();
    await page.getByText("All time", { exact: true }).first().click();
    await tab(page, "More");
    await page.getByText("Budgets", { exact: true }).first().click();
    const title = page.locator(".swipe-pane .period .label");
    expect(/All time/.test(await title.innerText())).toBe(false);
    await title.click();
    await page.getByText("Select date", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByLabel("Back").click();
    await tab(page, "Operations");
    expect(await page.locator(".period .label").first().innerText()).toMatch(/All time/);
  },
  async "the arrows of the period are dimmed on All time"(page) {
    await tab(page, "Operations");
    const arrows = page.locator(".period-arrows .icon-button");
    expect(await arrows.first().isDisabled()).toBe(false);
    await page.locator(".period .label").first().click();
    await page.getByText("All time", { exact: true }).first().click();
    await page.locator(".op-row").first().waitFor();
    expect(await arrows.count()).toBe(2);
    expect(await arrows.first().isDisabled()).toBe(true);
    expect(await arrows.last().isDisabled()).toBe(true);
  },
  async "a subcategory can be left out of the category filter and all can be folded"(page) {
    await tab(page, "Operations");
    await page.getByLabel("Operation search").first().click();
    await page.locator(".op-row").first().waitFor();
    const before = await page.locator(".op-row").count();
    await page.locator("[aria-label=Filters]").first().click();
    await page.locator(".panel .field", { hasText: "Categories" }).first().click();
    await page.getByLabel("Collapse all").click();
    expect(await page.locator(".filter-parent-row").count()).toBe(0);
    await page.getByLabel("Expand all").click();
    await page.locator(".filter-child-row", { hasText: "Cafe" }).getByRole("button").click();
    expect(
      await page.locator(".filter-child-row", { hasText: "Without subcategory" }).count(),
    ).toBe(1);
    await page.locator(".sheet-footer").last().getByRole("button", { name: "Confirm" }).click();
    await page.locator(".sheet-footer").last().getByRole("button", { name: "Apply" }).click();
    expect(await page.locator(".op-row").count()).toBe(before - 1);
  },
  async "exported data is accepted again by the import"(page) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Data file", { exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export and save" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("monivra-data.json");
    const buffer = await readFile(await download.path());
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore from file" }).click(),
    ]);
    await chooser.setFiles({ name: "monivra-data.json", mimeType: "application/json", buffer });
    await page.getByText("Replace existing data", { exact: false }).waitFor();
    await page.getByText("Apply", { exact: true }).click();
    await page.getByText("Data imported").waitFor();
  },
  async "the CSV export leaves out what is turned off and the whole file is accepted by the import"(
    page,
  ) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Export data", { exact: true }).click();
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    const save = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Export and save" }).click(),
      ]);
      return readFile(await download.path(), "utf8");
    };
    await page.locator(".export-option", { hasText: "Comment" }).click();
    const without = await save();
    expect(without.split("\r\n")[0].includes("comment")).toBe(false);
    await page.locator(".export-option", { hasText: "Comment" }).click();
    const whole = await save();
    expect(whole.split("\r\n")[0].includes("comment")).toBe(true);
    await page.getByLabel("Back").click();
    await page.getByText("Import data", { exact: true }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Select CSV file" }).click(),
    ]);
    await chooser.setFiles({
      name: "operations.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(whole),
    });
    await page.getByText("Apply", { exact: true }).click();
    await page.getByText("CSV imported").waitFor();
  },
  async "a saved backup is made on its page and brought back by merging or replacing"(page) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Saved backups", { exact: true }).click();
    await page.getByRole("button", { name: "Create a backup" }).click();
    await page.getByText("Backup saved").waitFor();
    await page.locator(".backup-card").click();
    await page.getByRole("button", { name: "Merge data" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Backup restored").waitFor();
  },
  async "a list ends without a line after its last row and without space after it"(page) {
    const ending = () =>
      page.evaluate(() => {
        const content = document.querySelector("#base .content.flush");
        const last = content.lastElementChild;
        return [
          getComputedStyle(last).borderBottomWidth,
          getComputedStyle(content).paddingBottom,
        ].join();
      });
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    expect(await ending()).toBe("0px,0px");
    await page.locator(".icon-button[title=Back]").click();
    await page.getByText("Settings", { exact: true }).first().click();
    expect(await ending()).toBe("0px,0px");
    await page.getByText("Formatting").click();
    expect(await ending()).toBe("0px,0px");
  },
  async "an account list that is empty offers to create the first account"(page) {
    expect(await page.locator(".empty-state .empty-art").count()).toBe(1);
    await page.locator(".empty-state").getByRole("button", { name: "Create" }).click();
    await page.getByLabel("Back").waitFor();
  },
  async "empty categories show an illustration with a button that creates the first one"(page) {
    await tab(page, "Categories");
    expect(await page.locator(".empty-state .empty-art").count()).toBe(1);
    await page.locator(".empty-state").getByRole("button", { name: "Create" }).click();
    expect((await page.locator(".calc-keypad, input").count()) > 0).toBe(true);
  },
  async "each way on the deletion page shows how much it deletes"(page) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Delete my data", { exact: true }).click();
    expect(await page.locator(".row .sub").nth(1).textContent()).toMatch(/\d+ accounts/);
    expect(await page.locator("#base .row").count()).toBe(4);
    await page.getByText("Delete operations", { exact: true }).click();
    expect(await page.locator(".confirm-message").textContent()).toMatch(/^\d+ operations will be/);
  },
  async "a whole amount never gets zero cents, even with two decimal places turned on"(page) {
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      appData.settings.decimal = true;
      appData.settings.hideCents = false;
    });
    const { formatted } = await page.evaluate(async () => {
      const { formatMoney } = await import("/js/domain/finance.js");
      return { formatted: [0, 50000, 50050].map((n) => formatMoney(n, "KGS")).join(" | ") };
    });
    expect(formatted).toBe("0 KGS | 500 KGS | 500.50 KGS");
  },
  async "the report holds the parts that are chosen"(page) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Export data", { exact: true }).click();
    await page.evaluate(() => (window.print = () => {}));
    await page.locator(".export-option", { hasText: "Accounts" }).first().click();
    await page.getByRole("button", { name: "Save as PDF" }).click();
    const report = await page.locator("#printout").innerHTML();
    expect(report.includes("<th>Date</th>")).toBe(true);
    expect(report.includes("<th>Balance</th>")).toBe(false);
  },
};

const expect = (actual) => ({
  toBe(expected) {
    if (actual !== expected) throw Error(`expected ${expected}, got ${actual}`);
  },
  toMatch(pattern) {
    if (!pattern.test(actual)) throw Error(`expected ${actual} to match ${pattern}`);
  },
});

const withoutRecords = (data) => {
  data.accounts = [];
  data.categories = [];
};
const adjustments = {
  "an account list that is empty offers to create the first account": withoutRecords,
  "empty categories show an illustration with a button that creates the first one": withoutRecords,
  "a subcategory can be left out of the category filter and all can be folded": (data) => {
    const food = data.categories.find((category) => category.name === "Food");
    for (const name of ["Market", "Cafe"])
      data.categories.push({ ...food, id: `sub-${name}`, name, parent: food.id });
    const base = data.ops.find((op) => op.type === "expense");
    const day = new Date().toLocaleDateString("en-CA");
    data.ops.push({ ...base, id: "cafe", date: day, category: "sub-Cafe" });
    data.ops.push({ ...base, id: "market", date: day, category: "sub-Market" });
    data.ops.push({ ...base, id: "plain", date: day, category: food.id });
  },
  "an operation moved to a future day becomes a scheduled payment": (data) => {
    const base = data.ops.find((op) => op.type === "expense");
    const day = new Date().toLocaleDateString("en-CA");
    data.ops.push({ ...base, id: "today", date: day });
  },
  "operations of scheduled payments are marked and can be shown alone or left out": (data) => {
    const base = data.ops.find((op) => op.type === "expense");
    const day = new Date().toLocaleDateString("en-CA");
    data.ops.push(
      { ...base, id: "plan-a", date: day, fromSchedule: { id: "plan", date: day } },
      { ...base, id: "plan-b", date: day, fromSchedule: { id: "plan", date: day } },
      { ...base, id: "plan-c", date: day, fromSchedule: { id: "plan2", date: day, byHand: true } },
    );
  },
  "a long press selects an operation without moving the list": manyOperationsToday,
  "the chosen period comes back from the operations of an account and of a category":
    manyOperationsToday,
  "the figures of a budget stay above the scrolling operations": budgetWithOperations,
  "partial deletion removes the records and keeps the settings, deleting local data starts from scratch":
    (data) => {
      data.settings.accent = "#0b6aa8";
    },
  "a budget card shows its operations, the pencil opens the editor, deleting returns to the list":
    budgetWithOperations,
  "a daily budget shows one day, and the arrows move it by a day": dailyBudgetWithOperations,
  "a long press on a budget card offers to edit or delete it": budgetWithOperations,
  "a payment far behind is asked about: adding posts what was missed, skipping does not":
    addOverdue,
  "skipping the missed payments adds nothing": addOverdue,
  "a payment that came due is posted on its own and the notice leads to the operations": (data) => {
    const base = data.ops.find((op) => op.type === "expense");
    const dueDate = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    data.scheduled.push({ ...base, id: "due", date: dueDate, recur: null, reminder: null });
  },
  "a subcategory is chosen on a row and shows in the history": addSubcategories,
  "a subcategory has no tile of its own in the category chooser": addSubcategories,
  "an amount in another currency is edited on both sides": (data) => {
    data.categories.find((category) => category.name === "Food").currency = "USD";
  },
};
// Twelve expenses today, so the month has enough to scroll and to show in the statistics.
function manyOperationsToday(data) {
  const base = data.ops.find((op) => op.type === "expense");
  const day = new Date().toLocaleDateString("en-CA");
  data.ops = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `many-${i}`, date: day }));
}
// A budget with two of the three operations of the month in its category.
function budgetWithOperations(data) {
  const base = data.ops.find((op) => op.type === "expense");
  const day = new Date().toLocaleDateString("en-CA");
  const elsewhere = data.categories.find((c) => c.type === "expense" && c.id !== base.category);
  data.ops = [
    { ...base, id: "t1", date: day },
    { ...base, id: "t2", date: day },
    { ...base, id: "t3", date: day, category: elsewhere.id },
  ];
  data.budgets.push({
    id: "one",
    name: "Only one",
    currency: data.settings.currency,
    amount: 100000000,
    period: "month",
    categories: [base.category],
  });
}
// A budget of one day with two operations today and one yesterday in its category.
function dailyBudgetWithOperations(data) {
  const base = data.ops.find((op) => op.type === "expense");
  const day = (back) => new Date(Date.now() - back * 86400000).toLocaleDateString("en-CA");
  data.ops = [
    { ...base, id: "t1", date: day(0) },
    { ...base, id: "t2", date: day(0) },
    { ...base, id: "t3", date: day(1) },
  ];
  data.budgets.push({
    id: "daily",
    name: "Daily",
    currency: data.settings.currency,
    amount: 100000000,
    period: "day",
    categories: [base.category],
  });
}
// A daily payment that was last due forty days ago: too far behind to be added without asking.
function addOverdue(data) {
  const base = data.ops.find((op) => op.type === "expense");
  const since = new Date(Date.now() - 40 * 86400000).toLocaleDateString("en-CA");
  data.scheduled.push({
    ...base,
    id: "old",
    date: since,
    recur: { every: 1, unit: "Days", remaining: null, days: [] },
    reminder: null,
  });
}
function addSubcategories(data) {
  const food = data.categories.find((category) => category.name === "Food");
  for (const name of ["Market", "Cafe"])
    data.categories.push({ ...food, id: `sub-${name}`, name, parent: food.id });
}

const SHORT_SCREEN = ["photos", "a page keeps"];
let failures = 0;
for (const [name, scenario] of Object.entries(scenarios)) {
  const page = await openApp({
    height: SHORT_SCREEN.some((start) => name.startsWith(start)) ? 540 : 700,
    motion: name.startsWith("with motion"),
    adjust: adjustments[name] ?? (() => {}),
  });
  try {
    await scenario(page);
    if (page.errors.length) throw Error(`page error: ${page.errors[0]}`);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await page.context().close();
}
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
