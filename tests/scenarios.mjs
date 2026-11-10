// User scenarios in a phone-sized browser: node tests/scenarios.mjs (ONLY=text for some of them)
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
async function openApp({ width = 360, height = 700, adjust = () => {}, motion = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
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
  await page.waitForSelector(".navbar, .pin");
  return page;
}
const tab = (page, name) => page.locator(".navbar").getByText(name, { exact: true }).click();
// Opens a page of the Data section from any tab.
const openData = async (page, name) => {
  await tab(page, "More");
  await page.getByText("Data", { exact: true }).first().click();
  await page.getByText(name, { exact: true }).click();
};
// The downloads the page has started so far: a way to check that something was not saved.
const watchDownloads = (page) => {
  const seen = [];
  page.on("download", (download) => seen.push(download.suggestedFilename()));
  return seen;
};
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
    await page.getByLabel("Confirmation word").fill("DELETE");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Data deleted").waitFor();
    expect((await stored())[2]).toBe("#a000b8");
  },
  async "a deletion offers a copy and a file first, and deleting everything asks for a word"(page) {
    const downloads = watchDownloads(page);
    const stored = () =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("monivra.offline.2026.v1"));
        return [data.accounts.length, data.ops.length, data.backups.length];
      });
    await openData(page, "Delete my data");
    await page.getByText("Partial deletion", { exact: true }).click();
    // What it does to the rest is told, a copy in the backups is on, a data file can be saved first.
    expect(await page.locator(".confirm-message").textContent()).toMatch(/backups stay/);
    expect(
      await page
        .getByRole("checkbox", { name: "Create a backup first" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(await page.getByLabel("Confirmation word").count()).toBe(0);
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save a data file first" }).click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^monivra-backup-/);
    expect(downloads.length).toBe(1);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Data deleted").waitFor();
    expect(await stored()).toEqual([0, 0, 1]);
    // The copy made before the deletion brings the data back.
    await openData(page, "Saved backups");
    await page.locator(".backup-card").click();
    await page.getByRole("button", { name: "Replace data" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Backup restored").waitFor();
    expect((await stored())[1] > 0).toBe(true);
    // Everything: the button waits for the word, and the backups go too.
    await openData(page, "Delete my data");
    await page.getByText("Delete local data", { exact: true }).click();
    // Short and plain: internal backups go too, files outside the app stay; no backup is offered
    // because the deletion would erase it.
    expect(await page.locator(".confirm-message").textContent()).toBe(
      "All local app data, including internal backups, will be permanently deleted.",
    );
    expect(await page.locator(".confirm-aside").textContent()).toMatch(/outside the app/);
    expect(await page.getByRole("checkbox", { name: "Create a backup first" }).count()).toBe(0);
    const remove = page.getByRole("button", { name: "Delete", exact: true });
    expect(await remove.isDisabled()).toBe(true);
    await page.getByLabel("Confirmation word").fill("remove");
    expect(await remove.isDisabled()).toBe(true);
    await page.getByLabel("Confirmation word").fill("delete");
    expect(await remove.isDisabled()).toBe(false);
    await remove.click();
    await page.getByText("Data deleted").waitFor();
    expect(await stored()).toEqual([0, 0, 0]);
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
  async "the data file is saved with a dated name and brought back from the file"(page) {
    const downloads = watchDownloads(page);
    await openData(page, "Data file");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^monivra-backup-\d{4}-\d\d-\d\d\.json$/);
    const buffer = await readFile(await download.path());
    const file = JSON.parse(buffer.toString("utf8"));
    expect(file.schema).toBe(1);
    expect(file.meta.app).toBe("Monivra");
    expect(file.accounts.length > 0 && file.ops.length > 0).toBe(true);
    expect(downloads.length).toBe(1);
    // The file is looked at before anything changes: what it holds and the two ways to bring it back.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore from file" }).click(),
    ]);
    await chooser.setFiles({ name: "data.json", mimeType: "application/json", buffer });
    await page.getByText("Replace data", { exact: true }).first().waitFor();
    expect(await page.locator(".restore-facts").textContent()).toMatch(/Operations/);
    await page.getByRole("button", { name: "Replace data" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Backup restored").waitFor();
    expect(downloads.length).toBe(1);
  },
  async "a file that is not a data file is refused with a sentence and nothing changes"(page) {
    await openData(page, "Data file");
    const before = await page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1"));
    for (const [text, message] of [
      ["not json at all", /damaged|not a JSON/],
      ['{"schema":1,"accounts":[]}', /missing or damaged/],
      ['{"schema":9}', /newer version/],
    ]) {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Restore from file" }).click(),
      ]);
      await chooser.setFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
      await page.locator(".overlay").getByText(message).waitFor();
      await page.locator(".overlay").getByRole("button", { name: "OK" }).click();
    }
    expect(await page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1"))).toBe(before);
  },
  async "sharing opens the share sheet with the file and saves nothing; without it nothing is saved until asked"(
    page,
  ) {
    const downloads = watchDownloads(page);
    await page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        value: async ({ files }) => {
          window.__shared.push(
            ...files.map((file) => `${file.name}:${file.type}:${file.size > 100}`),
          );
        },
        configurable: true,
      });
    });
    await openData(page, "Data file");
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByText("File shared").waitFor();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.length).toBe(1);
    expect(shared[0]).toMatch(/^monivra-backup-.*\.json:application\/json:true$/);
    expect(downloads.length).toBe(0);
    // Chrome does not hand JSON to the share sheet: nothing is renamed or turned into text, nothing is
    // downloaded; the person is told and can save the real .json file.
    await page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, "canShare", {
        value: ({ files }) => files.every((file) => file.type !== "application/json"),
        configurable: true,
      });
    });
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByText("Sharing is not available").waitFor();
    expect((await page.evaluate(() => window.__shared)).length).toBe(0);
    expect(downloads.length).toBe(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    // The browser cannot send files: the person is told, and the file is saved only on the answer.
    await page.evaluate(() =>
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByText("Sharing is not available").waitFor();
    expect(await page.locator(".confirm-message").textContent()).toMatch(
      /Save the \.json file, then share it from your phone's Files app/,
    );
    expect(downloads.length).toBe(0);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save file" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(downloads.length).toBe(1);
  },
  async "a PDF report is previewed in the application, then saved as a real PDF, and printing is not saving"(
    page,
  ) {
    const downloads = watchDownloads(page);
    await page.evaluate(() => {
      window.__printed = [];
      new MutationObserver((records) => {
        for (const node of records.flatMap((r) => [...r.addedNodes]))
          if (node.tagName === "IFRAME")
            node.contentWindow.print = () =>
              window.__printed.push(node.contentDocument.images.length);
      }).observe(document.body, { childList: true });
    });
    await openData(page, "Export data");
    for (const [mode, name] of [
      ["Financial summary", /^monivra-financial-summary-all-time\.pdf$/],
      ["Detailed transactions", /^monivra-transactions-all-time\.pdf$/],
    ]) {
      const started = downloads.length;
      await page.getByRole("button", { name: new RegExp(mode) }).click();
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.locator(".report-pages img").first().waitFor();
      const pages = await page.locator(".report-pages img").count();
      expect(pages > 0).toBe(true);
      expect(downloads.length).toBe(started);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Save", exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(name);
      const bytes = await readFile(await download.path());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1").includes("%%EOF")).toBe(true);
      expect((bytes.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(pages);
      // Real text, not pictures: the file holds fonts with a map back to Unicode and no image at all.
      const text = bytes.toString("latin1");
      expect(text.includes("/ToUnicode")).toBe(true);
      expect(text.includes("/Subtype /Image")).toBe(false);
      expect(text.includes("/FontFile2")).toBe(true);
      const before = downloads.length;
      await page.getByRole("button", { name: "Print", exact: true }).click();
      await page.waitForFunction(() => window.__printed.length > 0);
      expect((await page.evaluate(() => window.__printed.at(-1))) > 0).toBe(true);
      expect(downloads.length).toBe(before);
      await page.locator(".icon-button[title=Back]").click();
    }
  },
  async "a large report is real searchable text: names, Cyrillic, amounts and a huge comment are all found"(
    page,
  ) {
    const result = await page.evaluate(async () => {
      const { createReportFixture } = await import("/tests/report-fixture.js");
      const state = await import("/js/core/state.js");
      const { buildReportJob } = await import("/js/data/report-job.js");
      Object.assign(state.appData, createReportFixture());
      const huge = `${"Очень длинный комментарий. ".repeat(900)}КОНЕЦ-ТЕКСТА`;
      state.appData.ops[3].comment = huge;
      const started = performance.now();
      const job = await buildReportJob({ mode: "detail", filters: {}, period: { mode: "all" } });
      const bytes = new Uint8Array(await job.file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { base64: btoa(binary), pages: job.pageCount, ms: performance.now() - started };
    });
    const file = join(await mkdtemp(join(tmpdir(), "monivra-pdf-")), "big.pdf");
    await writeFile(file, Buffer.from(result.base64, "base64"));
    const size = Buffer.from(result.base64, "base64").length;
    expect(size < 1_000_000).toBe(true);
    let text;
    try {
      text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
    } catch {
      console.log("skip pdftotext is not installed; text extraction not checked");
      return;
    }
    for (const word of ["Наличные", "Карта Visa", "Dollars", "КОНЕЦ-ТЕКСТА", "Page 1 of"])
      expect(text.includes(word)).toBe(true);
    // The huge comment is complete in the appendix, not cut.
    expect((text.match(/Очень длинный комментарий\./g) || []).length >= 900).toBe(true);
    expect(text.includes("?")).toBe(false);
    console.log(`     ${result.pages} pages, ${size} bytes, ${Math.round(result.ms)} ms`);
  },
  async "the CSV export leaves out what is turned off, previews without a download and imports back"(
    page,
  ) {
    const downloads = watchDownloads(page);
    await openData(page, "Export data");
    await page.getByRole("button", { name: /CSV file/ }).click();
    // Settings of the other kinds of export are not shown.
    expect(await page.getByText("Include in report").count()).toBe(0);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.locator(".csv-preview table").waitFor();
    expect(downloads.length).toBe(0);
    const headings = await page.locator(".csv-preview th").allTextContents();
    expect(headings.some((h) => h === "Commentcomment")).toBe(true); // its name, and the one in the file
    await page.locator(".icon-button[title=Back]").click();
    const save = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Save", exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("monivra-operations-all-time.csv");
      return readFile(await download.path(), "utf8");
    };
    await page.locator(".export-option", { hasText: "Comment" }).click();
    const without = await save();
    expect(without.split("\r\n")[0].includes("comment")).toBe(false);
    await page.locator(".export-option", { hasText: "Comment" }).click();
    const whole = await save();
    expect(whole.startsWith("\ufeff")).toBe(true);
    expect(whole.split("\r\n")[0].includes("comment")).toBe(true);
    await page.locator(".icon-button[title=Back]").click();
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
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    // The file written by the application is all in the data already: nothing would be added.
    await page.getByRole("button", { name: "Import 0 operations" }).waitFor();
    expect(await page.getByRole("button", { name: "Import 0 operations" }).isDisabled()).toBe(true);
  },
  async "a CSV file is matched, looked at and added once, and importing it again adds nothing"(
    page,
  ) {
    const example = await page.evaluate(async () => (await import("/js/data/csv.js")).csvExample());
    const count = () =>
      page.evaluate(async () => (await import("/js/core/state.js")).appData.ops.length);
    const start = await count();
    const choose = async () => {
      await page.getByText("Import data", { exact: true }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Select CSV file" }).click(),
      ]);
      await chooser.setFiles({
        name: "bank.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(example),
      });
    };
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    // The example is in the application, with the rules, and nothing is added by looking at it.
    await page.getByText("Import data", { exact: true }).click();
    await page.getByRole("button", { name: "View example" }).click();
    await page.getByText("Example of a CSV file").waitFor();
    await page.locator(".icon-button[title=Back]").click();
    await page.locator(".icon-button[title=Back]").click();
    expect(await count()).toBe(start);
    await choose();
    await page.getByText("Match columns").waitFor();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Accounts and categories").first().waitFor();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Import 6 operations" }).click();
    expect(await count()).toBe(start);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByText("Import finished").waitFor();
    expect(await count()).toBe(start + 6);
    await page.locator(".icon-button[title=Back]").click();
    await page.locator(".icon-button[title=Back]").click();
    await choose();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    expect(await page.getByRole("button", { name: "Import 0 operations" }).isDisabled()).toBe(true);
    expect(await count()).toBe(start + 6);
  },
  async "the screen for data that cannot be read speaks the language that was chosen"(page) {
    const damaged = '{"schema":1,"settings":{"language":"ru"},"accounts":"broken"';
    await page.evaluate((text) => localStorage.setItem("monivra.offline.2026.v1", text), damaged);
    await page.reload();
    await page.getByText("Не удалось прочитать данные").waitFor();
    expect(await page.getByRole("button", { name: "Сохранить копию данных" }).count()).toBe(1);
  },
  async "data the application cannot read is kept, and the person chooses what to do with it"(
    page,
  ) {
    const downloads = watchDownloads(page);
    const garbage = '{"schema":1,"accounts":"broken"';
    await page.evaluate((text) => localStorage.setItem("monivra.offline.2026.v1", text), garbage);
    await page.reload();
    await page.getByText("Your data could not be read").waitFor();
    expect(await page.locator(".navbar").count()).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1"))).toBe(
      garbage,
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save a copy of the data" }).click(),
    ]);
    expect((await readFile(await download.path(), "utf8")) === garbage).toBe(true);
    expect(downloads.length).toBe(1);
    await page.getByRole("button", { name: "Start with empty data" }).click();
    await page.getByRole("button", { name: "Start empty" }).click();
    await page.getByText("Your data could not be read").waitFor({ state: "detached" });
    // What was there is not lost: a copy stays in the storage of the browser.
    expect(await page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1.damaged"))).toBe(
      garbage,
    );
  },
  async "a PIN of an earlier version is stored as a hash, unlocks the app, and guessing is slowed down"(
    page,
  ) {
    const stored = await page.evaluate(() => localStorage.getItem("monivra.offline.2026.v1"));
    expect(stored.includes('"pin":"1234"')).toBe(false);
    expect(stored.includes('"hash"')).toBe(true);
    await page.waitForSelector(".pin");
    const type = async (digits) => {
      for (const digit of digits)
        await page.locator(".key", { hasText: new RegExp(`^${digit}$`) }).click();
      await page.waitForTimeout(450);
    };
    await type("9999");
    await page.getByText("Incorrect PIN").waitFor();
    await type("1234");
    await page.waitForSelector(".navbar");
    // Locked again by hand, then five wrong PINs in a row make the keys wait, even for the right one.
    await page.evaluate(async () => {
      const state = await import("/js/core/state.js");
      state.setLocked(true);
      state.setPinEntry("");
      (await import("/js/app/shell.js")).render();
    });
    for (let i = 0; i < 5; i++) await type("0000");
    await page.getByText(/Too many attempts/).waitFor();
    await type("1234");
    expect(await page.locator(".navbar").count()).toBe(0);
  },
  async "the Total tab counts only the accounts of the overall balance and says how many are left out"(
    page,
  ) {
    await tab(page, "Accounts");
    await page.locator(".tabs button", { hasText: "Total" }).click();
    const shown = await page.locator(".converted-total").first().textContent();
    const expected = await page.evaluate(async () => {
      const finance = await import("/js/domain/finance.js");
      const state = await import("/js/core/state.js");
      return finance.formatAmountText(finance.overallBalance(), state.appData.settings.currency);
    });
    expect(shown.replace(/\s/g, "")).toBe(expected.replace(/\s/g, ""));
    await page.getByText(/not counted here/).waitFor();
  },
  async "notifications: blocked in the browser they stay honest and show reminders inside the app"(
    page,
  ) {
    // Headless Chromium reports the permission as denied: the real fallback path runs here.
    await tab(page, "More");
    await page.getByText("Settings", { exact: true }).first().click();
    await page.getByText("Notifications", { exact: true }).first().click();
    await page.getByText(/Blocked in the browser settings/).waitFor();
    await page.getByRole("switch", { name: "Notifications" }).click();
    expect(
      await page.getByRole("switch", { name: "Notifications" }).getAttribute("aria-checked"),
    ).toBe("true");
    await page.getByText("Test notification", { exact: true }).click();
    // No fake success: the reminder is shown inside the app instead.
    await page.locator("#toast.show", { hasText: "Enter today’s operations" }).waitFor();
    expect(await page.getByText("Notification sent").count()).toBe(0);
  },
  async "notifications: when the browser allows them the system API is called (mock, not a device)"(
    page,
  ) {
    // A mock proves only that the API is invoked with the reminder; delivery on a device is unverified.
    await page.evaluate(() => {
      window.__notified = [];
      Object.defineProperty(Notification, "permission", { get: () => "granted" });
      globalThis.ServiceWorkerRegistration.prototype.showNotification = async function (
        title,
        options,
      ) {
        window.__notified.push([title, options.body]);
      };
    });
    await tab(page, "More");
    await page.getByText("Settings", { exact: true }).first().click();
    await page.getByText("Notifications", { exact: true }).first().click();
    await page.getByText(/Allowed: reminders come/).waitFor();
    await page.getByText("Test notification", { exact: true }).click();
    await page.getByText("Notification sent").waitFor();
    expect(await page.evaluate(() => window.__notified.length)).toBe(1);
  },
  async "a merge keeps the version on this device of a record that differs, unless the backup's is chosen"(
    page,
  ) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Saved backups", { exact: true }).click();
    await page.getByRole("button", { name: "Create a backup" }).click();
    await page.getByText("Backup saved").waitFor();
    await page.evaluate(async () => {
      const state = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      state.appData.ops[0].comment = "edited after the backup";
      save();
    });
    await page.locator(".backup-card").click();
    await page.getByText("Keep the version on this device").waitFor();
    await page
      .getByText(/differ and stay as they are here/)
      .first()
      .waitFor();
    await page.getByRole("button", { name: "Merge data" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Backup restored").waitFor();
    const comment = await page.evaluate(async () => {
      const state = await import("/js/core/state.js");
      return state.appData.ops.some((o) => o.comment === "edited after the backup");
    });
    expect(comment).toBe(true);
  },
  async "at 320 px the amounts in the tiles of the category chooser fit whole"(page) {
    await tab(page, "Categories");
    await page.locator(".cat-tile").first().click();
    await page.waitForSelector(".calc-keypad");
    await page.locator(".calc-parties button").nth(1).click();
    await page.waitForSelector(".counterparty-categories .cat-tile .money");
    const clipped = await page
      .locator(".counterparty-categories .cat-tile .money")
      .evaluateAll((items) =>
        items.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
      );
    expect(clipped.length).toBe(0);
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
    expect(await page.locator(".confirm-message").textContent()).toMatch(/^All operations will be/);
    await page.locator(".overlay details summary").click();
    expect(await page.locator(".overlay details").textContent()).toMatch(/\d+ operations/);
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
  async "in Russian the buttons to share, save and print fit the screen, and so does the page"(
    page,
  ) {
    await tab(page, "Ещё");
    await page.getByText("Данные", { exact: true }).first().click();
    await page.getByText("Экспорт данных", { exact: true }).click();
    const fits = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        buttons: [...document.querySelectorAll(".file-action")].every((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && b.scrollWidth <= b.clientWidth;
        }),
        count: document.querySelectorAll(".file-action").length,
      }));
    expect(await fits()).toEqual({ page: true, buttons: true, count: 3 });
    await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
    await page.locator(".report-pages img").first().waitFor();
    expect(await fits()).toEqual({ page: true, buttons: true, count: 3 });
  },
  async "the summary leaves out the parts that are turned off, so its page count changes"(page) {
    await openData(page, "Export data");
    const pagesOf = async () => {
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.locator(".report-pages img").first().waitFor();
      const n = await page.locator(".report-pages img").count();
      await page.locator(".icon-button[title=Back]").click();
      return n;
    };
    const all = await pagesOf();
    for (const part of ["Charts and trends", "Accounts", "Savings", "Debts", "Budgets"])
      await page.locator(".export-part", { hasText: part }).click();
    const least = await pagesOf();
    expect(least <= all).toBe(true);
    expect(least > 0).toBe(true);
  },
  // ---- Data section: reliability and layout (see docs/DATA_UX_REPORT.md) ----
  async "repeated taps on Print make one print dialog, and leaving the page cancels a pending one"(
    page,
  ) {
    await page.evaluate(async () => {
      window.__printed = 0;
      new MutationObserver((records) => {
        for (const node of records.flatMap((r) => [...r.addedNodes]))
          if (node.tagName === "IFRAME")
            node.contentWindow.print = () => {
              window.__printed++;
              setTimeout(() => node.contentWindow.dispatchEvent(new Event("afterprint")), 50);
            };
      }).observe(document.body, { childList: true });
      // A slow report: every page takes a moment to make.
      const toBlob = globalThis.HTMLCanvasElement.prototype.toBlob;
      globalThis.HTMLCanvasElement.prototype.toBlob = function (...args) {
        setTimeout(() => toBlob.apply(this, args), 120);
      };
    });
    await openData(page, "Export data");
    await page.getByRole("button", { name: /Detailed transactions/ }).click();
    const tapPrint = () =>
      page.evaluate(() => {
        const button = [...document.querySelectorAll(".file-action")].at(-1);
        for (let n = 0; n < 6; n++) button.click();
      });
    await tapPrint();
    await page.waitForFunction(() => window.__printed > 0);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    const builds = await page.evaluate(
      async () => (await import("/js/data/report-cache.js")).cacheStats.builds,
    );
    expect(builds).toBe(1);
    // The button is free again; a new request uses the report made before.
    await tapPrint();
    await page.waitForFunction(() => window.__printed === 2);
    expect(
      await page.evaluate(async () => (await import("/js/data/report-cache.js")).cacheStats.builds),
    ).toBe(1);
    // Leaving the page while a different report is being made: no dialog appears afterwards.
    await page.getByRole("button", { name: /Financial summary/ }).click();
    await tapPrint();
    await page.evaluate(() => document.querySelector(".icon-button[title=Back]").click());
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => window.__printed)).toBe(2);
    expect(await page.locator("iframe").count()).toBe(0);
    // Changing a choice while the report is being made drops the request in the same way.
    await page.getByText("Export data", { exact: true }).click();
    await tapPrint();
    await page.evaluate(() => document.querySelector(".export-part").click());
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => window.__printed)).toBe(2);
  },
  async "a prepared report is used again, made again after a change, and waited for when asked twice"(
    page,
  ) {
    const stats = () =>
      page.evaluate(async () => ({ ...(await import("/js/data/report-cache.js")).cacheStats }));
    await openData(page, "Export data");
    const started = Date.now();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.locator(".report-pages img").first().waitFor();
    const first = Date.now() - started;
    expect((await stats()).builds).toBe(1);
    await page.locator(".icon-button[title=Back]").click();
    const again = Date.now();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.locator(".report-pages img").first().waitFor();
    const second = Date.now() - again;
    const used = await stats();
    expect([used.builds, used.hits]).toEqual([1, 1]);
    console.log(`     first preview ${first} ms, second (prepared) ${second} ms`);
    await page.locator(".icon-button[title=Back]").click();
    // Saving uses the same prepared file.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect((await stats()).builds).toBe(1);
    // A choice of the report makes it again; the change of the data does too.
    await page.locator(".export-part").first().click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.locator(".report-pages img").first().waitFor();
    expect((await stats()).builds).toBe(2);
    await page.locator(".icon-button[title=Back]").click();
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.accounts[0].name += "!";
      save();
    });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.locator(".report-pages img").first().waitFor();
    expect((await stats()).builds).toBe(3);
    // Two requests at once for the same report make one.
    const joined = await page.evaluate(async () => {
      const cache = await import("/js/data/report-cache.js");
      const { emptyFilters } = await import("/js/core/state.js");
      const config = {
        mode: "detail",
        filters: emptyFilters(),
        period: { mode: "all" },
        sections: {},
        parts: { type: true, accounts: true, amount: true, comment: true, tags: true },
      };
      const before = cache.cacheStats.builds;
      const [a, b] = await Promise.all([cache.preparedJob(config), cache.preparedJob(config)]);
      return [a === b, cache.cacheStats.builds - before];
    });
    expect(joined).toEqual([true, 1]);
  },
  async "sharing: a second tap while the sheet is open does nothing, a refused tap is told, a missing share is never a download"(
    page,
  ) {
    const downloads = watchDownloads(page);
    await page.evaluate(() => {
      window.__shares = 0;
      window.__mode = "slow";
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        value: async () => {
          window.__shares++;
          if (window.__mode === "blocked")
            throw new globalThis.DOMException("no activation", "NotAllowedError");
          await new Promise((done) => setTimeout(done, 600));
        },
        configurable: true,
      });
    });
    await openData(page, "Data file");
    await page.evaluate(() => {
      const button = [...document.querySelectorAll(".file-action")][0];
      button.click();
      button.click();
      button.click();
    });
    await page.getByText("File shared").waitFor();
    expect(await page.evaluate(() => window.__shares)).toBe(1);
    // The browser asks for a new tap: said once, nothing saved.
    await page.evaluate(() => (window.__mode = "blocked"));
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByRole("heading", { name: "Tap Share again" }).waitFor();
    await page.getByRole("button", { name: "OK" }).click();
    expect(downloads.length).toBe(0);
    // Rejected by the system (it cannot open): told, nothing saved.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", {
        value: async () => {
          throw new globalThis.DOMException("broken", "DataError");
        },
        configurable: true,
      });
    });
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByText("The share sheet could not be opened").waitFor();
    expect(downloads.length).toBe(0);
  },
  async "the checkboxes of the export keep their size and place when they are turned off"(page) {
    await openData(page, "Export data");
    const measure = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".export-option")].map((row) => {
          const r = row.getBoundingClientRect();
          const c = row.querySelector(".checkbox").getBoundingClientRect();
          return [r.width, r.height, c.x - r.x, c.width, c.height].map((n) => Math.round(n * 10));
        }),
      );
    const before = await measure();
    for (const row of await page.locator(".export-option").all()) await row.click();
    expect(await measure()).toEqual(before);
    expect(await page.locator(".export-option.on").count()).toBe(0);
    await page.getByRole("button", { name: /CSV file/ }).click();
    const csvBefore = await measure();
    for (const row of await page.locator(".export-option").all()) await row.click();
    expect(await measure()).toEqual(csvBefore);
  },
  async "at 320 the footer of the export keeps its height and place when the format changes"(page) {
    await openData(page, "Export data");
    const footer = () =>
      page.evaluate(() => {
        const box = document.querySelector(".page-footer").getBoundingClientRect();
        const preview = [
          ...document.querySelectorAll(".page-footer button"),
        ][0].getBoundingClientRect();
        return [
          box.y,
          box.height,
          preview.y,
          preview.height,
          document.documentElement.scrollWidth <= innerWidth,
        ].map((n) => (typeof n === "number" ? Math.round(n) : n));
      });
    const pdf = await footer();
    await page.getByRole("button", { name: /CSV file/ }).click();
    expect(await footer()).toEqual(pdf);
    await page.getByRole("button", { name: /Detailed transactions/ }).click();
    expect(await footer()).toEqual(pdf);
    expect(pdf[4]).toBe(true);
  },
  async "the CSV import starts with two buttons and one download offers the example or the blank file"(
    page,
  ) {
    const downloads = watchDownloads(page);
    await openData(page, "Import data");
    expect(await page.locator(".page-footer button").allTextContents()).toEqual([
      "Select CSV file",
      "View example",
    ]);
    await page.getByRole("button", { name: "View example" }).click();
    expect(await page.locator(".page-footer button").allTextContents()).toEqual(["Download CSV"]);
    expect(await page.locator(".content .csv-preview th").first().textContent()).toBe("Typetype");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const [example] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".overlay .row", { hasText: "Example with sample rows" }).click(),
    ]);
    expect(example.suggestedFilename()).toBe("monivra-import-example.csv");
    expect((await readFile(await example.path(), "utf8")).split("\r\n").length > 3).toBe(true);
    expect(downloads.length).toBe(1);
    await page.getByRole("button", { name: "Download CSV" }).click();
    const [blank] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".overlay .row", { hasText: "Blank template" }).click(),
    ]);
    expect(blank.suggestedFilename()).toBe("monivra-import-template.csv");
    const text = (await readFile(await blank.path(), "utf8")).replace("﻿", "");
    expect(text).toBe(
      "type,date,amount,currency,from,to,category,comment,tags,to_amount,to_currency,counted_as",
    );
    expect(downloads.length).toBe(2);
  },
  async "on the data file page Restore is the main button and Share and Save sit side by side"(
    page,
  ) {
    await openData(page, "Data file");
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll(".page-footer button")].map((b) => {
        const r = b.getBoundingClientRect();
        return [b.textContent.trim(), Math.round(r.x), Math.round(r.y), Math.round(r.height)];
      }),
    );
    const [restore, share, save] = boxes;
    expect(restore[0]).toBe("Restore from file");
    expect(share[2]).toBe(save[2]); // the same row
    expect(share[1] < save[1]).toBe(true);
    expect(share[3] >= 48 && restore[3] >= 48).toBe(true);
    expect(restore[2] < share[2]).toBe(true);
  },
  async "a backup whose category clashes with one here is merged with its own category; a broken file is refused with a reason"(
    page,
  ) {
    const file = await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { backupFileText } = await import("/js/data/backup-file.js");
      const category = appData.categories.find((c) => c.type === "expense" && !c.parent);
      const copy = JSON.parse(backupFileText());
      copy.categories = copy.categories
        .filter((c) => c.parent !== category.id)
        .map((c) => (c.id === category.id ? { ...c, type: "income", name: "Bonus" } : c));
      copy.ops = copy.ops
        .filter(
          (o) =>
            o.category !== category.id &&
            !appData.categories.some((c) => c.parent === category.id && c.id === o.category),
        )
        .concat({
          id: "clash-op",
          type: "income",
          amount: 12345,
          date: "2026-01-02",
          comment: "from backup",
          tags: [],
          to: copy.accounts[0].id,
          category: category.id,
        });
      return JSON.stringify(copy);
    });
    await openData(page, "Data file");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore from file" }).click(),
    ]);
    await chooser.setFiles({
      name: "clash.json",
      mimeType: "application/json",
      buffer: Buffer.from(file),
    });
    await page.getByText("Merge data", { exact: true }).first().waitFor();
    expect(await page.getByText(/same id as categories here/).count()).toBe(1);
    expect(await page.getByRole("button", { name: "Merge data" }).isDisabled()).toBe(false);
    await page.getByRole("button", { name: "Merge data" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Backup restored").waitFor();
    const result = await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const added = appData.ops.find((o) => o.id === "clash-op");
      const category = appData.categories.find((c) => c.id === added.category);
      return [added.type, added.amount, category.type, category.id.includes("~")];
    });
    expect(result).toEqual(["income", 12345, "income", true]);
    // A file that is wrong in itself is refused when it is opened, with the reason in a sentence.
    const broken = JSON.parse(file);
    broken.ops.find((o) => o.id === "clash-op").type = "expense";
    await page.evaluate(() => document.querySelector(".icon-button[title=Back]")?.click());
    await openData(page, "Data file").catch(() => {});
    const [second] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore from file" }).click(),
    ]);
    await second.setFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(broken)),
    });
    await page
      .locator(".overlay")
      .getByText(/does not fit the type/)
      .waitFor();
    await page.locator(".overlay").getByRole("button", { name: "OK" }).click();
  },
  async "a merge that cannot be done says why in plain words, keeps Replace and looks disabled"(
    page,
  ) {
    // The backup is sound on its own, but with the backup's version of "Food" (a subcategory there)
    // the subcategories of "Food" here would hang under a subcategory.
    const file = await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { backupFileText } = await import("/js/data/backup-file.js");
      const food = appData.categories.find((c) => c.name === "Food" && !c.parent);
      const other = appData.categories.find(
        (c) => c.type === "expense" && !c.parent && c.id !== food.id,
      );
      const copy = JSON.parse(backupFileText());
      const subs = copy.categories.filter((c) => c.parent === food.id).map((c) => c.id);
      copy.categories = copy.categories
        .filter((c) => !subs.includes(c.id))
        .map((c) => (c.id === food.id ? { ...c, parent: other.id } : c));
      copy.ops = copy.ops.filter((o) => !subs.includes(o.category));
      copy.scheduled = copy.scheduled.filter((o) => !subs.includes(o.category));
      copy.budgets = copy.budgets.map((b) => ({
        ...b,
        categories: b.categories && b.categories.filter((id) => !subs.includes(id)),
      }));
      return JSON.stringify(copy);
    });
    await openData(page, "Data file");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore from file" }).click(),
    ]);
    await chooser.setFiles({
      name: "odd.json",
      mimeType: "application/json",
      buffer: Buffer.from(file),
    });
    await page.getByText("Merge data", { exact: true }).first().waitFor();
    // Keeping the version here, the merge is possible; taking the backup's version is not.
    expect(await page.getByRole("button", { name: "Merge data" }).isDisabled()).toBe(false);
    await page.getByText("Keep the version on this device").click();
    await page.locator(".overlay .row", { hasText: "Use the backup's version" }).click();
    await page.getByText(/This backup cannot be merged/).waitFor();
    const merge = page.getByRole("button", { name: "Merge data" });
    expect(await merge.isDisabled()).toBe(true);
    expect(await merge.evaluate((b) => Number(getComputedStyle(b).opacity) < 1)).toBe(true);
    expect(await page.getByRole("button", { name: "Replace data" }).isDisabled()).toBe(false);
    await page.locator(".restore-way details summary").first().click();
    expect(await page.locator(".restore-way details").first().textContent()).toMatch(
      /parent category/,
    );
  },
  async "in Russian at 320 the new Data screens fit and the partial deletion dialog is short"(
    page,
  ) {
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.settings.language = "ru";
      save();
    });
    await page.reload();
    await page.waitForSelector(".navbar");
    const fits = () =>
      page.evaluate(
        () => `${document.documentElement.scrollWidth}/${document.body.scrollWidth}/${innerWidth}`,
      );
    const wide = async (label) => {
      const [root, body, inner] = (await fits()).split("/").map(Number);
      if (root > inner || body > inner)
        throw Error(`${label}: ${root}/${body} wider than ${inner}`);
    };
    await tab(page, "Ещё");
    await page.getByText("Данные", { exact: true }).first().click();
    await page.getByText("Файл данных", { exact: true }).click();
    await wide("data file");
    await page.locator(".icon-button[title=Назад]").click();
    await page.getByText("Импорт данных", { exact: true }).click();
    await wide("import");
    await page.getByRole("button", { name: "Посмотреть пример" }).click();
    await wide("example");
    await page.locator(".icon-button[title=Назад]").click();
    await page.locator(".icon-button[title=Назад]").click();
    await page.getByText("Удалить мои данные", { exact: true }).click();
    await page.getByText("Частичное удаление", { exact: true }).click();
    const sheet = await page.locator(".overlay.dialog .panel").boundingBox();
    if (sheet.height >= 560) throw Error(`the dialog is ${sheet.height}px tall`);
    await wide("deletion dialog");
  },
};

const expect = (actual) => ({
  toBe(expected) {
    if (actual !== expected) throw Error(`expected ${expected}, got ${actual}`);
  },
  toMatch(pattern) {
    if (!pattern.test(actual)) throw Error(`expected ${actual} to match ${pattern}`);
  },
  toContain(item) {
    if (!actual.includes(item)) throw Error(`expected ${actual} to contain ${item}`);
  },
  toEqual(expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
});

// No accounts and no categories, and nothing that would point at them.
const withoutRecords = (data) => {
  data.accounts = [];
  data.categories = [];
  data.ops = [];
  data.scheduled = [];
  data.budgets = [];
};
const adjustments = {
  "a merge that cannot be done says why in plain words, keeps Replace and looks disabled":
    addSubcategories,
  "in Russian the buttons to share, save and print fit the screen, and so does the page": (
    data,
  ) => {
    data.settings.language = "ru";
  },
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
  "a PIN of an earlier version is stored as a hash, unlocks the app, and guessing is slowed down": (
    data,
  ) => {
    data.settings.pin = "1234";
  },
  "the Total tab counts only the accounts of the overall balance and says how many are left out": (
    data,
  ) => {
    data.accounts[0].include = false;
  },
  "at 320 px the amounts in the tiles of the category chooser fit whole": (data) => {
    // Amounts like 8,800 KGS in every category of the month.
    const base = data.ops.find((op) => op.type === "expense");
    const day = new Date().toLocaleDateString("en-CA");
    data.ops = data.categories
      .filter((c) => c.type === "expense")
      .map((c, i) => ({ ...base, id: `wide-${i}`, category: c.id, amount: 880000, date: day }));
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

const NARROW_SCREEN = ["at 320", "in Russian at 320"];
const SHORT_SCREEN = ["photos", "a page keeps"];
// ONLY=text node tests/scenarios.mjs runs the scenarios whose names have the text.
const only = process.env.ONLY;
let failures = 0;
for (const [name, scenario] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const page = await openApp({
    width: NARROW_SCREEN.some((start) => name.startsWith(start)) ? 320 : 360,
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
