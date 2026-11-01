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
async function openApp({ height = 700, adjust = () => {} } = {}) {
  const context = await browser.newContext({
    viewport: { width: 360, height },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
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
    expect(await page.locator(".ops-compact-actions").count()).toBe(1);
    await page.locator(".calc-comment .icon-button, .calc-attachments .icon-button").nth(1).click();
    await page.keyboard.type("note");
    await page.getByText("OK", { exact: true }).click();
    expect(await page.locator(".calc-keypad").count()).toBe(1);
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
    await page.locator(".filter-choice", { hasText: "Transfers" }).click();
    await page.getByText("2 selected").waitFor();
    await confirm.click();
    await page.getByText("Expenses, Incomes").waitFor();
  },
  async "exported data is accepted again by the import"(page) {
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.getByText("Export data", { exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Complete data file (JSON)").click(),
    ]);
    expect(download.suggestedFilename()).toBe("monivra-data.json");
    const buffer = await readFile(await download.path());
    await page.getByText("Import data", { exact: true }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Import JSON file").click(),
    ]);
    await chooser.setFiles({ name: "monivra-data.json", mimeType: "application/json", buffer });
    await page.getByText("Replace existing data", { exact: false }).waitFor();
    await page.getByText("Apply", { exact: true }).click();
    await page.getByText("Data imported").waitFor();
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

const adjustments = {
  "a subcategory is chosen on a row and shows in the history": addSubcategories,
  "a subcategory has no tile of its own in the category chooser": addSubcategories,
  "an amount in another currency is edited on both sides": (data) => {
    data.categories.find((category) => category.name === "Food").currency = "USD";
  },
};
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
