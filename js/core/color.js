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
