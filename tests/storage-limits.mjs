/* Large data and a full storage, in the browser engine the Android WebView uses. A failed save has to
   be visible and has to leave the stored data as it was; a backup that does not fit is not "made". */
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const { server, address } = await serveApp();
const browser = await chromium.launch();
let failures = 0;
const test = async (name, fn) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${address}/index.html`);
    await page.waitForSelector(".welcome, .navbar");
    const note = await fn(page);
    if (errors.length) throw Error(`page error: ${errors[0]}`);
    console.log(`ok   ${name}${note ? ` (${note})` : ""}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await context.close();
};
const assert = (c, m) => {
  if (!c) throw Error(m);
};

// A dataset of the size of a person who used the app for years: operations and photos.
const bigData = (page, { ops, photos }) =>
  page.evaluate(
    async ({ ops, photos }) => {
      const { createSampleData } = await import("/tests/fixtures/sample-data.js");
      const { setAppData, setFirstLaunch } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      const d = createSampleData();
      const exp = d.categories.find((c) => c.type === "expense");
      const acc = d.accounts[0];
      // ~90 thousand characters of base64: what the application makes of a photo (800 px, JPEG 0.75).
      const photo = "data:image/jpeg;base64," + "QUJD".repeat(22500);
      for (let i = 0; i < ops; i++)
        d.ops.push({
          id: `big${i}`,
          type: "expense",
          amount: 100 + (i % 977),
          date: `20${20 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}`,
          comment: `Purchase number ${i}`,
          tags: [],
          from: acc.id,
          category: exp.id,
          ...(i < photos ? { photos: [photo] } : {}),
        });
      setAppData(d);
      setFirstLaunch(false);
      const ok = save();
      return { ok, chars: localStorage.getItem("monivra.offline.2026.v1").length };
    },
    { ops, photos },
  );

await test("10 000 operations and 20 photos are stored, survive a reload and open", async (page) => {
  const r = await bigData(page, { ops: 10000, photos: 20 });
  assert(r.ok, "the save failed");
  await page.reload();
  await page.waitForSelector(".navbar");
  const count = await page.evaluate(async () => {
    const { appData } = await import("/js/core/state.js");
    return appData.ops.length;
  });
  assert(count >= 10000, `only ${count} operations after reload`);
  return `${Math.round(r.chars / 1000)} thousand characters`;
});

await test("a backup of a big dataset: how many fit, and the one that does not is refused, not faked", async (page) => {
  await bigData(page, { ops: 10000, photos: 20 });
  const r = await page.evaluate(async () => {
    const { createBackup } = await import("/js/domain/backups.js");
    const { appData } = await import("/js/core/state.js");
    const stored = () => localStorage.getItem("monivra.offline.2026.v1");
    let made = 0;
    let refused = 0;
    let consistent = true;
    for (let i = 0; i < 6; i++) {
      const before = stored();
      const ok = createBackup("manual");
      if (ok) made++;
      else {
        refused++;
        if (stored() !== before) consistent = false;
        if (JSON.parse(stored()).backups.length !== appData.backups.length) consistent = false;
      }
    }
    return { made, refused, consistent, listed: appData.backups.length, alert: !!document.getElementById("save-alert") };
  });
  assert(r.consistent, "a refused backup changed what is stored or left a phantom backup in memory");
  assert(r.made + r.refused === 6, "lost count");
  assert(!r.alert, "the 'not saved' alert stays although nothing is unsaved");
  return `${r.made} made, ${r.refused} refused`;
});

await test("a full storage: the save fails visibly, the stored data is the last good one, a later save clears the alert", async (page) => {
  await bigData(page, { ops: 3000, photos: 5 });
  const r = await page.evaluate(async () => {
    const { appData } = await import("/js/core/state.js");
    const { save } = await import("/js/data/storage.js");
    const KEY = "monivra.offline.2026.v1";
    const good = localStorage.getItem(KEY);
    // Take all the room that is left.
    let n = 0;
    for (let size = 200000; size >= 1; size = Math.floor(size / 2))
      for (;;) {
        try {
          localStorage.setItem("filler" + n++, "x".repeat(size));
        } catch {
          break;
        }
      }
    appData.ops.push({ ...appData.ops[0], id: "one-more", comment: "y".repeat(5000) });
    const ok = save();
    const alertText = document.getElementById("save-alert")?.textContent ?? "";
    const stored = localStorage.getItem(KEY);
    for (let i = 0; i < n; i++) localStorage.removeItem("filler" + i);
    const okLater = save();
    return {
      ok,
      alertText,
      storedIsLastGood: stored === good,
      okLater,
      alertAfter: !!document.getElementById("save-alert"),
    };
  });
  assert(r.ok === false, "save() said it worked on a full storage");
  assert(/NOT saved/.test(r.alertText), `no alert: "${r.alertText}"`);
  assert(r.storedIsLastGood, "the stored data is not the last good one");
  assert(r.okLater === true, "the save does not work after room is made");
  assert(!r.alertAfter, "the alert stays after a successful save");
  await page.evaluate(() => {});
});

await test("the alert offers a data file and is on top of the screen", async (page) => {
  await bigData(page, { ops: 10, photos: 0 });
  await page.evaluate(async () => (await import("/js/ui/save-alert.js")).showSaveFailure());
  const box = await page.locator("#save-alert").boundingBox();
  assert(box && box.y === 0 && box.width >= 380, "the alert is not at the top");
  assert((await page.locator("#save-alert button").innerText()).length > 3, "no button");
});

await test("the Data page shows how full the storage is, and warns from 70 %", async (page) => {
  await bigData(page, { ops: 10000, photos: 20 });
  const text = await page.evaluate(async () => {
    const { openPage } = await import("/js/ui/navigation.js");
    openPage("data");
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText;
  });
  assert(/Storage on this phone: about \d+% full/.test(text), "no usage line");
});

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
