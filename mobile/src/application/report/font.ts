// The font of the reports (js/platform/report-font.js): one TrueType file measures text for the layout and
// is embedded in the PDF, so the two always agree. Widths come from the font itself (no kerning).
import { BOLD, REGULAR } from "./font-data.ts";

// Where the baseline of a line lies below its top, as a share of the size of the text.
export const ASCENT = 1854 / 2048;

export interface ReportFont {
  bytes: Uint8Array;
  unitsPerEm: number;
  box: number[];
  ascent: number;
  descent: number;
  capHeight: number;
  advances: Uint16Array;
  glyphOf(code: number): number;
  glyphs(text: string): [number, number][];
  widthOf(text: string, size: number): number;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0,
    value = 0,
    at = 0;
  for (const ch of clean) {
    value = (value << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

function readFont(bytes: Uint8Array): ReportFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables[tag] = view.getUint32(at + 8);
  }
  const t = (name: string) => tables[name] ?? 0;
  const unitsPerEm = view.getUint16(t("head") + 18);
  const box = [36, 38, 40, 42].map((o) => view.getInt16(t("head") + o));
  const metricCount = view.getUint16(t("hhea") + 34);
  const glyphCount = view.getUint16(t("maxp") + 4);
  const advances = new Uint16Array(glyphCount);
  for (let g = 0; g < glyphCount; g++) advances[g] = view.getUint16(t("hmtx") + Math.min(g, metricCount - 1) * 4);
  const cmap = new Map<number, number>();
  const count = view.getUint16(t("cmap") + 2);
  for (let i = 0; i < count; i++) {
    const record = t("cmap") + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    if (!(platform === 3 && encoding === 1) && platform !== 0) continue;
    const sub = t("cmap") + view.getUint32(record + 4);
    if (view.getUint16(sub) !== 4) continue;
    const segments = view.getUint16(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let s = 0; s < segments; s++) {
      const end = view.getUint16(ends + s * 2);
      const start = view.getUint16(starts + s * 2);
      const delta = view.getInt16(deltas + s * 2);
      const range = view.getUint16(ranges + s * 2);
      for (let code = start; code <= end && code !== 0xffff; code++) {
        let glyph: number;
        if (range === 0) glyph = (code + delta) & 0xffff;
        else {
          glyph = view.getUint16(ranges + s * 2 + range + (code - start) * 2);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) cmap.set(code, glyph);
      }
    }
    break;
  }
  const unknown = cmap.get(63) ?? 0;
  const glyphOf = (code: number) => cmap.get(code) ?? unknown;
  return {
    bytes,
    unitsPerEm,
    box,
    ascent: view.getInt16(t("hhea") + 4),
    descent: view.getInt16(t("hhea") + 6),
    capHeight: tables["OS/2"] !== undefined ? view.getInt16(t("OS/2") + 88) : view.getInt16(t("hhea") + 4),
    advances,
    glyphOf,
    glyphs: (text) => [...text].map((ch) => [ch.codePointAt(0)!, glyphOf(ch.codePointAt(0)!)]),
    widthOf: (text, size) => ([...text].reduce((n, ch) => n + (advances[glyphOf(ch.codePointAt(0)!)] ?? 0), 0) * size) / unitsPerEm,
  };
}

let fonts: { regular: ReportFont; bold: ReportFont } | null = null;
// Both fonts, read once.
export function reportFonts(): { regular: ReportFont; bold: ReportFont } {
  fonts ??= { regular: readFont(fromBase64(REGULAR)), bold: readFont(fromBase64(BOLD)) };
  return fonts;
}
