// An inventory of the first application: starting from one tab, every button of every window is
// pressed (each path replayed from a fresh start with the same data), and every new window is
// photographed with the list of its buttons and texts. The result is the list of windows the new
// application has to have, with what each looks like.
//
//   NODE_PATH=$(npm root -g) node tools/tour/crawl-old.mjs <tab label> <out dir> [depth] [max windows]
//
// The first application is served from the repository root (python3 -m http.server 8765).
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [tab = "Accounts", out = "tour-old", depthArg = "3", maxArg = "120"] = process.argv.slice(2);
const DEPTH = Number(depthArg);
const MAX = Number(maxArg);
const APP = "http://localhost:8765/index.html";
const seed = readFileSync(new URL("./seed.json", import.meta.url), "utf8");
mkdirSync(out, { recursive: true });

// Buttons of the window on top (the last overlay, or the page), outside the navigation bar.
const VISIBLE_BUTTONS = () => {
  const layers = [...document.querySelectorAll(".overlay")];
  const root = layers.length ? layers[layers.length - 1] : document.body;
  const label = (b) => (b.getAttribute("aria-label") || (b.innerText || "").split("\n").map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) || b.title || "").trim().slice(0, 60);
  return [...root.querySelectorAll("button, [role=button], [role=tab], [role=switch], input[type=checkbox]")]
    .filter((b) => !b.closest(".navbar") && !b.disabled && b.offsetParent !== null)
    .map((b) => label(b))
    .filter(Boolean);
};
const SIGNATURE = () => {
  const layers = [...document.querySelectorAll(".overlay")];
  const top = layers[layers.length - 1];
  const page = document.querySelector(".topbar h1")?.innerText.trim() || document.querySelector(".navbar [aria-current=page], .navbar .active")?.innerText.trim() || "";
  const root = top || document.body;
  const tab = [...root.querySelectorAll(".tabs .active, .sum-tabs .active, [role=tab][aria-selected=true], .segmented .active")].map((x) => x.innerText.trim().split("\n")[0]).join("/");
  const layer = top ? `${top.className.replace("overlay", "").trim()}:${top.querySelector("[aria-label]")?.getAttribute("aria-label") || ""}:${top.querySelector("h2")?.innerText.trim() || ""}` : "";
  return [page, tab, layer].join(" | ");
};
const TEXTS = () => {
  const layers = [...document.querySelectorAll(".overlay")];
  const root = layers.length ? layers[layers.length - 1] : document.body;
  return root.innerText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 80);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 411, height: 914 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript((data) => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.clear();
    localStorage.setItem("monivra.offline.2026.v1", data);
    sessionStorage.setItem("seeded", "1");
  }
}, seed);
const page = await context.newPage();
page.on("dialog", (d) => d.dismiss());

async function fresh() {
  await page.evaluate(() => sessionStorage.removeItem("seeded")).catch(() => undefined);
  await page.goto(APP);
  await page.waitForTimeout(700);
  await clickLabel({ label: tab, index: 0 }, true);
}
async function clickLabel(step, nav = false) {
  const handle = await page.evaluateHandle(
    ({ label, index, nav }) => {
      const layers = [...document.querySelectorAll(".overlay")];
      const root = nav ? document.querySelector(".navbar") : layers.length ? layers[layers.length - 1] : document.body;
      const name = (b) => (b.getAttribute("aria-label") || (b.innerText || "").split("\n").map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) || b.title || "").trim().slice(0, 60);
      const all = [...root.querySelectorAll("button, [role=button], [role=tab], [role=switch], input[type=checkbox]")].filter((b) => (nav || !b.closest(".navbar")) && !b.disabled && b.offsetParent !== null && name(b) === label);
      return all[index] || null;
    },
    { ...step, nav },
  );
  const element = handle.asElement();
  if (!element) return false;
  await element.click({ timeout: 2000 }).catch(() => undefined);
  await page.waitForTimeout(450);
  return true;
}

const seen = new Map();
const queue = [[]];
let shot = 0;
while (queue.length && seen.size < MAX) {
  const path = queue.shift();
  await fresh();
  let ok = true;
  for (const step of path) if (!(await clickLabel(step))) ok = false;
  if (!ok) continue;
  const signature = await page.evaluate(SIGNATURE);
  if (seen.has(signature)) continue;
  const name = String(++shot).padStart(3, "0");
  await page.screenshot({ path: `${out}/${name}.png` });
  const buttons = await page.evaluate(VISIBLE_BUTTONS);
  const texts = await page.evaluate(TEXTS);
  seen.set(signature, { name, path: path.map((s) => s.label + (s.index ? `#${s.index}` : "")), buttons, texts });
  console.log(name, signature, "←", path.map((s) => s.label).join(" › "));
  if (path.length >= DEPTH) continue;
  const counts = new Map();
  for (const label of buttons) {
    const index = counts.get(label) ?? 0;
    counts.set(label, index + 1);
    queue.push([...path, { label, index }]);
  }
}
writeFileSync(`${out}/inventory.json`, JSON.stringify([...seen].map(([signature, v]) => ({ signature, ...v })), null, 1));
await browser.close();
console.log("windows:", seen.size, "left in queue:", queue.length);
