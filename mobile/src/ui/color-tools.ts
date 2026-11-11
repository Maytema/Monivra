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

const hslToHex = (h: number, s: number, l: number): string => {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToHex(h, v ? 2 * (1 - l / v) : 0, v);
};

export const isHex = (text: string): boolean => /^#[0-9a-f]{6}$/i.test(text);

// Seven shades of the color's hue, from light to dark.
export function shadesOf(hex: string): string[] {
  const [h] = hexToHsv(hex);
  return [0.86, 0.74, 0.62, 0.5, 0.4, 0.3, 0.2].map((l) => hslToHex(h, 0.72, l));
}
