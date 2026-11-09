import { chromium } from "playwright";
import { serveApp } from "./server.mjs";
const { server, address } = await serveApp();
const b = await chromium.launch();
const W = Number(process.env.W || 320);
const c = await b.newContext({
  colorScheme: process.env.DARK ? "dark" : "light",
  viewport: { width: W, height: 700 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const p = await c.newPage();
await p.goto(`${address}/index.html`);
await p.evaluate(async (lang) => {
  const { createSampleData } = await import("/js/data/sample.js");
  const { STORAGE_KEY } = await import("/js/core/constants.js");
  const d = createSampleData();
  d.settings.language = lang;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}, process.env.L || "en");
await p.reload();
await p.waitForSelector(".navbar");
const measure = () =>
  p.evaluate(() => {
    const out = { overflow: [], clipped: [], small: [], contrast: [] };
    const parse = (c) => {
      const m = c.match(/[\d.e-]+/g).map(Number);
      const k = c.startsWith("color(") ? 255 : 1;
      return { r: m[0] * k, g: m[1] * k, b: m[2] * k, a: m[3] ?? 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      let layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 1) break;
      }
      let base = { r: 255, g: 255, b: 255 };
      for (const c of layers.reverse())
        base = {
          r: c.r * c.a + base.r * (1 - c.a),
          g: c.g * c.a + base.g * (1 - c.a),
          b: c.b * c.a + base.b * (1 - c.a),
        };
      return base;
    };
    const vw = innerWidth;
    const name = (el) =>
      (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40) || el.className;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none") continue;
      // hidden off-canvas panes
      if (r.left >= vw || r.right <= 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        if (!el.closest(".swipe-pane, .sheet, .toast"))
          out.overflow.push(
            `${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)} "${name(el)}"`,
          );
      }
      if (
        (st.textOverflow === "ellipsis" || st.overflow === "hidden") &&
        el.scrollWidth > el.clientWidth + 1 &&
        el.textContent.trim() &&
        el.children.length === 0
      )
        out.clipped.push(
          `"${name(el)}" ${el.scrollWidth}>${el.clientWidth} ${el.tagName}.${String(el.className)} fs=${st.fontSize} ls=${st.letterSpacing}`,
        );
      if (
        el.children.length === 0 &&
        el.textContent.trim().length > 0 &&
        !el.closest("[disabled]")
      ) {
        const fg = parse(st.color);
        const bg = bgOf(el);
        const mixed = {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        };
        const l1 = lum(mixed),
          l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const big =
          parseFloat(st.fontSize) >= 24 ||
          (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
        if (ratio < (big ? 3 : 4.5))
          out.contrast.push(
            `${ratio.toFixed(2)} ${st.fontSize} "${name(el)}" .${String(el.className).slice(0, 25)}`,
          );
      }
      if (
        /^(BUTTON|A|INPUT|SELECT)$/.test(el.tagName) &&
        el.type !== "hidden" &&
        (r.height < 32 || r.width < 32)
      )
        out.small.push(
          `${el.tagName}.${String(el.className).slice(0, 25)} ${Math.round(r.width)}x${Math.round(r.height)} "${name(el)}"`,
        );
    }
    return out;
  });
const seen = {};
const record = async (label) => {
  const m = await measure();
  seen[label] = m;
};
for (const t of ["Accounts", "Categories", "Statistics", "Operations", "More"]) {
  await p
    .locator(".navbar")
    .getByText(t, { exact: true })
    .click()
    .catch(() => {});
  await p.waitForTimeout(250);
  await record(t);
}
for (const [label, steps] of Object.entries({
  Settings: ["More", "Settings"],
  Notifications: ["More", "Settings", "Notifications"],
  Security: ["More", "Settings", "Security"],
  Data: ["More", "Data"],
  Export: ["More", "Data", "Export data"],
  Privacy: ["More", "Settings", "Privacy"],
  Formatting: ["More", "Settings", "Formatting"],
})) {
  await p.reload();
  await p.waitForSelector(".navbar");
  for (const s of steps) {
    await p.getByText(s, { exact: true }).first().click();
    await p.waitForTimeout(250);
  }
  await record(label);
}
const scenes = {
  Editor: async () => {
    await p.locator(".navbar").getByText("Categories", { exact: true }).click();
    await p.locator(".cat-tile").first().click();
    await p.waitForSelector(".calc-keypad");
  },
  "Editor-account": async () => {
    await p.locator(".navbar").getByText("Categories", { exact: true }).click();
    await p.locator(".cat-tile").first().click();
    await p.waitForSelector(".calc-keypad");
    await p.locator(".calc-parties button").first().click();
  },
  "Editor-category": async () => {
    await p.locator(".navbar").getByText("Categories", { exact: true }).click();
    await p.locator(".cat-tile").first().click();
    await p.waitForSelector(".calc-keypad");
    await p.locator(".calc-parties button").nth(1).click();
  },
  Period: async () => {
    await p.locator(".navbar").getByText("Statistics", { exact: true }).click();
    await p
      .locator(".period-title, .period-bar button")
      .nth(1)
      .click()
      .catch(() => {});
  },
};
for (const [label, go] of Object.entries(scenes)) {
  await p.reload();
  await p.waitForSelector(".navbar");
  await go();
  await p.waitForTimeout(300);
  await record(label);
}
const all = {};
for (const [k, v] of Object.entries(seen))
  for (const [kind, list] of Object.entries(v))
    for (const x of list) (all[kind] ??= new Map()).set(x, [...(all[kind].get(x) || []), k]);
for (const [kind, map] of Object.entries(all)) {
  console.log(`## ${kind} (${map.size})`);
  for (const [x, where] of [...map].slice(0, 40))
    console.log(" ", x, "←", [...new Set(where)].join(","));
}
await b.close();
server.close();
