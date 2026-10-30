/* Color helpers: contrast between text and background */

// "#rrggbb" to [r, g, b] (0–255).
function channels(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// "#rrggbb" from three channels.
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// Relative luminance of a color (0 black … 1 white).
function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio of two colors (1 … 21).
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Mix of two colors; `share` of the first one (0–1).
export const mix = (first, second, share) =>
  toHex(channels(first).map((v, i) => v * share + channels(second)[i] * (1 - share)));

// Black or white text, whichever reads better on the given background.
export const textOn = (background) =>
  contrast(background, "#ffffff") >= 4.5 ? "#ffffff" : "#1d1b20";

// The color moved towards black (on light backgrounds) or white (on dark ones)
// until it reads on `background` with at least `min` contrast.
export function readableOver(color, background, min = 4.5) {
  const target = luminance(background) > 0.5 ? 0 : 255;
  const from = channels(color);
  for (let step = 0; step <= 20; step++) {
    const mixed = toHex(from.map((v) => v + ((target - v) * step) / 20));
    if (contrast(mixed, background) >= min) return mixed;
  }
  return toHex([target, target, target]);
}

// "#rrggbb" from hue (0–360), saturation and value (0–1).
export function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

// [hue 0–360, saturation 0–1, value 0–1] of "#rrggbb".
export function hexToHsv(hex) {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b),
    delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return [h * 60, max ? delta / max : 0, max];
}

// "#rrggbb" from hue (0–360), saturation and lightness (0–1).
export function hslToHex(h, s, l) {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToHex(h, v ? 2 * (1 - l / v) : 0, v);
}

// True for a complete "#rrggbb" string.
export const isHex = (text) => /^#[0-9a-f]{6}$/i.test(text);

// Seven shades of the color's hue, from light to dark.
export function shadesOf(hex) {
  const [h] = hexToHsv(hex);
  return [0.86, 0.74, 0.62, 0.5, 0.4, 0.3, 0.2].map((l) => hslToHex(h, 0.72, l));
}
