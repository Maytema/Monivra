/* The font of the reports: Liberation Sans (Latin and Cyrillic), as small TrueType files kept with the
   application. The same file measures text for the layout, draws the preview and is embedded in the
   PDF, so the three always agree. The widths are read from the font itself (no kerning). */
export const FAMILY = "MonivraReport";
// Where the baseline of a line lies below its top, as a share of the size of the text.
export const ASCENT = 1854 / 2048;

const FILES = {
  regular: ["Report-Regular.ttf", "400"],
  bold: ["Report-Bold.ttf", "700"],
};

// A reader of the parts of a TrueType file that a PDF needs.
function readFont(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables[tag] = view.getUint32(at + 8);
  }
  const unitsPerEm = view.getUint16(tables.head + 18);
  const box = [36, 38, 40, 42].map((o) => view.getInt16(tables.head + o));
  const metricCount = view.getUint16(tables.hhea + 34);
  const glyphCount = view.getUint16(tables.maxp + 4);
  const advances = new Uint16Array(glyphCount);
  for (let g = 0; g < glyphCount; g++)
    advances[g] = view.getUint16(tables.hmtx + Math.min(g, metricCount - 1) * 4);
  // The map of characters to glyphs: format 4 of the Unicode table.
  const cmap = new Map();
  const count = view.getUint16(tables.cmap + 2);
  for (let i = 0; i < count; i++) {
    const record = tables.cmap + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    if (!(platform === 3 && encoding === 1) && platform !== 0) continue;
    const sub = tables.cmap + view.getUint32(record + 4);
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
        let glyph;
        if (range === 0) glyph = (code + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + range + (code - start) * 2;
          glyph = view.getUint16(at);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) cmap.set(code, glyph);
      }
    }
    break;
  }
  return {
    bytes,
    unitsPerEm,
    box,
    ascent: view.getInt16(tables.hhea + 4),
    descent: view.getInt16(tables.hhea + 6),
    capHeight: tables["OS/2"] ? view.getInt16(tables["OS/2"] + 88) : view.getInt16(tables.hhea + 4),
    advances,
    cmap,
  };
}

// A font for the PDF writer: glyphs of a text and its width.
function describe(parsed) {
  const unknown = parsed.cmap.get(63) ?? 0;
  const glyphOf = (code) => parsed.cmap.get(code) ?? unknown;
  return {
    ...parsed,
    glyphOf,
    // The characters of the text as [code, glyph] pairs; one for every character, so nothing is dropped.
    glyphs: (text) => [...text].map((ch) => [ch.codePointAt(0), glyphOf(ch.codePointAt(0))]),
    widthOf: (text, size) =>
      ([...text].reduce((n, ch) => n + parsed.advances[glyphOf(ch.codePointAt(0))], 0) * size) /
      parsed.unitsPerEm,
  };
}

let loading = null;

// Loads both fonts once, makes them known to the page (for measuring and drawing) and resolves with
// { regular, bold } for the PDF.
export function loadReportFonts() {
  loading ??= (async () => {
    const result = {};
    for (const [key, [file, weight]] of Object.entries(FILES)) {
      const url = new URL(`../../assets/fonts/${file}`, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw Error(`The font ${file} could not be loaded`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const face = new FontFace(FAMILY, bytes.slice().buffer, { weight });
      await face.load();
      document.fonts.add(face);
      result[key] = describe(readFont(bytes));
    }
    return result;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
