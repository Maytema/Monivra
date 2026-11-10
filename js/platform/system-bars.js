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

let lastBars = "";
// The bars take the color of the screen behind them, with light or dark icons to match.
export function applySystemBars(dark) {
  if (!native) return;
  const color = cssToHex(getComputedStyle(document.body).backgroundColor);
  const key = `${color}|${dark}`;
  if (!color || key === lastBars) return;
  lastBars = key;
  native.setSystemBars({ color, dark }).catch(() => {});
}

let lastPrivacy = null;
// While on, the system hides the application in the recent-apps preview and does not allow screenshots.
export function applyPrivacyScreen(on) {
  if (!native || lastPrivacy === on) return;
  lastPrivacy = on;
  native.setPrivacyScreen({ on }).catch(() => {});
}
