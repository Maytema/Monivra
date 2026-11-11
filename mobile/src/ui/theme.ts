// Design tokens, taken from the first application's css/base.css and core/color.js: every surface is
// derived from one accent colour, light and dark, and text colours are chosen to stay readable.

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: number[]): string => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
// Mix of two colours; `share` of the first one (0–1) — CSS color-mix in srgb.
export const mix = (first: string, second: string, share: number): string => {
  const b = channels(second);
  return toHex(channels(first).map((v, i) => v * share + (b[i] ?? 0) * (1 - share)));
};
export const textOn = (background: string): string => (contrast(background, "#ffffff") >= 4.5 ? "#ffffff" : "#1d1b20");
export function readableOver(color: string, background: string, min = 4.5): string {
  const target = luminance(background) > 0.5 ? 0 : 255;
  const from = channels(color);
  for (let step = 0; step <= 20; step++) {
    const mixed = toHex(from.map((v) => v + ((target - v) * step) / 20));
    if (contrast(mixed, background) >= min) return mixed;
  }
  return toHex([target, target, target]);
}
// The same colour with an alpha channel, as `rgba()` (CSS `color-mix(in srgb, c 18%, transparent)`).
export function alpha(color: string, share: number): string {
  const [r, g, b] = channels(color);
  return `rgba(${r}, ${g}, ${b}, ${share})`;
}

export interface Palette {
  dark: boolean;
  accent: string;
  onAccent: string;
  accentInk: string;
  bg: string;
  ink: string;
  muted: string;
  inkSoft: string;
  line: string;
  soft: string;
  sheet: string;
  dialog: string;
  key: string;
  nav: string;
  tint: string;
  positive: string;
  negative: string;
  positiveInk: string;
  negativeInk: string;
}

export function buildPalette(accent: string, dark: boolean): Palette {
  const valid = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#a000b8";
  const base = dark
    ? {
        bg: "#151417", ink: "#ececf0", muted: "#aeaab4", inkSoft: "#cfccd5", line: "#3e3b44", sheet: "#1f1d22", dialog: "#2b2830",
        nav: "#1f1d22", key: "#2a272e", soft: mix(valid, "#2a272e", 0.24), tint: mix(valid, "#2a272e", 0.32),
        positiveInk: "#58cba5", negativeInk: "#df80a3",
      }
    : {
        bg: mix(valid, "#ffffff", 0.02), ink: "#252127", muted: "#6f6873", inkSoft: "#5d5360", line: "#e4dde4",
        sheet: mix(valid, "#ffffff", 0.04), dialog: mix(valid, "#f1eff3", 0.02), nav: mix(valid, "#ffffff", 0.09),
        key: mix(valid, "#ffffff", 0.015), soft: mix(valid, "#ffffff", 0.16), tint: mix(valid, "#ffffff", 0.18),
        positiveInk: "#26725a", negativeInk: "#b93666",
      };
  const hardest = dark ? mix(valid, "#2a272e", 0.32) : mix(valid, "#ffffff", 0.18);
  return { dark, accent: valid, onAccent: textOn(valid), accentInk: readableOver(valid, hardest), positive: "#45bd96", negative: "#ce3c71", ...base };
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
export const radius = { s: 10, m: 14, l: 20, pill: 999 } as const;
export const font = { small: 13, body: 16, title: 20, hero: 32 } as const;

// Sizes of the first application's chrome (css/navbar.css, fab.css, layout.css, components.css).
// None of them is a workaround for the system bars: the system's insets are added to them by the
// components that sit at an edge of the screen (see `useSafeAreaInsets` in tab-bar.tsx, sheets.tsx).
export const chrome = {
  navPadTop: 7,
  navMinBottom: 10,
  navItem: 56,
  navPill: { width: 56, height: 32, radius: 30 },
  fab: 62,
  edgeGap: 16,
  contentSide: 11,
  sheetRadius: 30,
  dialogRadius: 28,
} as const;
