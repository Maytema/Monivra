/* The look of the system bars and the recents preview in the Android shell. In a browser these do
   nothing. */
import { native } from "./native.js";

const hex = (n) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
// A color as the browser reports it ("rgb(r, g, b)", "rgba(...)" or "color(srgb r g b)") as
// "#rrggbb"; null when it is none of those.
export function cssToHex(css) {
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
  if (rgb) return `#${hex(+rgb[1])}${hex(+rgb[2])}${hex(+rgb[3])}`;
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  return srgb ? `#${hex(+srgb[1] * 255)}${hex(+srgb[2] * 255)}${hex(+srgb[3] * 255)}` : null;
}

// The color seen at a point of the screen: the first element at that point, going outwards, that
// paints a background. The bars take what is drawn right next to them, so no seam shows.
function colorAt(y, fallback) {
  let el = document.elementFromPoint(window.innerWidth / 2, y);
  while (el) {
    const color = cssToHex(getComputedStyle(el).backgroundColor);
    if (color && !/^rgba\(.*,\s*0\)$/.test(getComputedStyle(el).backgroundColor)) return color;
    el = el.parentElement;
  }
  return fallback;
}
// Light or dark icons for a color: dark ones on a light bar.
const isDarkColor = (hexColor) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
};

let lastBars = "";
let barsFrame = 0;
// The status bar takes the color at the top of the screen and the navigation bar the color at its
// bottom (the navigation tabs when they are shown), with icons that can be read on each. Read after
// the screen is drawn, once for a burst of changes.
export function applySystemBars() {
  if (!native) return;
  cancelAnimationFrame(barsFrame);
  barsFrame = requestAnimationFrame(() => {
    const base = cssToHex(getComputedStyle(document.body).backgroundColor);
    if (!base) return;
    const color = colorAt(2, base);
    const navColor = colorAt(window.innerHeight - 2, base);
    const dark = isDarkColor(color);
    const navDark = isDarkColor(navColor);
    const key = `${color}|${navColor}|${dark}|${navDark}`;
    if (key === lastBars) return;
    lastBars = key;
    native.setSystemBars({ color, dark, navColor, navDark }).catch(() => {});
  });
}

let lastPrivacy = null;
// While on, the system hides the application in the recent-apps preview and does not allow screenshots.
export function applyPrivacyScreen(on) {
  if (!native || lastPrivacy === on) return;
  lastPrivacy = on;
  native.setPrivacyScreen({ on }).catch(() => {});
}
