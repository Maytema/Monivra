// Color helpers of the color picker (js/core/color.js): hue/shade arithmetic and the HEX check.
const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: readonly number[]): string => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return [h * 60, max ? delta / max : 0, max];
}


export const isHex = (text: string): boolean => /^#[0-9a-f]{6}$/i.test(text);


// ---- Shades for the row under the colour wheel ----------------------------------------------------
// Worked out in OKLab, where equal steps of lightness look equal: the hue stays, each tone keeps the
// colour's own chroma as far as the screen can show it, so the light ones do not wash out and the dark
// ones do not turn muddy.
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((v) => toLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

// The colour as linear sRGB, or null when the screen cannot show it.
function oklchToRgb(L: number, C: number, h: number): [number, number, number] | null {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb: [number, number, number] = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? rgb : null;
}

export function oklchToHex(L: number, C: number, h: number): string {
  let low = 0;
  let high = C;
  let rgb = oklchToRgb(L, C, h);
  // The most chroma the screen shows at this lightness and hue.
  for (let i = 0; i < 24 && !rgb; i++) {
    const mid = (low + high) / 2;
    const probe = oklchToRgb(L, mid, h);
    if (probe) low = mid;
    else high = mid;
    if (high - low < 1e-4) rgb = oklchToRgb(L, low, h) ?? [L, L, L];
  }
  rgb ??= oklchToRgb(L, low, h) ?? [L, L, L];
  return toHex(rgb.map((v) => Math.min(255, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))) * 255))));
}

// `count` shades of the colour from light to dark; the colour itself takes the place of the nearest one,
// so it can be found and marked in the row. No two are the same.
export function prettyShades(hex: string, count: number): string[] {
  const n = Math.max(1, Math.floor(count));
  const [L, C, h] = hexToOklch(hex);
  const lightest = 0.93;
  const darkest = 0.3;
  const tones = Array.from({ length: n }, (_, i) => (n === 1 ? L : lightest - ((lightest - darkest) * i) / (n - 1)));
  // Pale colours keep a little colour in the light tones; greys stay grey.
  const chroma = C < 0.02 ? C : Math.max(C, 0.06);
  const out = tones.map((t) => oklchToHex(t, chroma, h));
  let nearest = 0;
  tones.forEach((t, i) => {
    if (Math.abs(t - L) < Math.abs((tones[nearest] ?? 0) - L)) nearest = i;
  });
  out[nearest] = hex.toLowerCase();
  return out.filter((c, i) => out.indexOf(c) === i);
}

// How many shades fit in one row of `width`, and how large each is.
export function shadeRow(width: number, side = 20, gap = 8, smallest = 34, largest = 44): { count: number; size: number } {
  const room = Math.max(0, width - side * 2);
  const count = Math.max(1, Math.floor((room + gap) / (smallest + gap)));
  const size = Math.min(largest, (room - gap * (count - 1)) / count);
  return { count, size };
}

// What a person typed in the HEX field: 3 or 6 digits, with or without "#", any case. Null when it is not
// a colour yet.
export function parseHex(text: string): string | null {
  const digits = text.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return "#" + digits;
  if (/^[0-9a-f]{3}$/.test(digits)) return "#" + [...digits].map((c) => c + c).join("");
  return null;
}

// Keeps only what a HEX code can hold (the "#" is shown outside the field).
export const cleanHexInput = (text: string): string => text.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toLowerCase();
