/* A PDF document written by hand from the drawing commands of a report: no library, nothing sent
   anywhere. Text is real text (an embedded font, with a map back to Unicode, so it can be selected,
   searched and copied); boxes, lines and charts are vector drawing. */
import { PAGE } from "../data/report-layout.js";
import { ASCENT } from "./report-font.js";

const encoder = new TextEncoder();
const num = (n) => String(Math.round(n * 100) / 100);

// Compresses bytes the way PDF calls FlateDecode.
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// A text string of a PDF: UTF-16 with a byte order mark, so any language can be in the title.
function pdfText(text) {
  const hex = [...text]
    .flatMap((ch) => {
      const code = ch.codePointAt(0);
      if (code < 0x10000) return [code];
      const c = code - 0x10000;
      return [0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff)];
    })
    .map((u) => u.toString(16).padStart(4, "0"))
    .join("");
  return `<feff${hex}>`;
}
const utf16 = (code) => {
  if (code < 0x10000) return code.toString(16).padStart(4, "0");
  const c = code - 0x10000;
  return ((0xd800 + (c >> 10)) * 65536 + 0xdc00 + (c & 0x3ff)).toString(16).padStart(8, "0");
};

// "#rrggbb" or "rgba(r, g, b, a)" as the operands of a PDF color and its opacity.
function colorOf(css) {
  if (css.startsWith("#")) {
    const part = (i) => num(parseInt(css.slice(1 + i * 2, 3 + i * 2), 16) / 255);
    return { rgb: `${part(0)} ${part(1)} ${part(2)}`, alpha: 1 };
  }
  const [r, g, b, a = 1] = css.match(/[\d.]+/g).map(Number);
  return { rgb: `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`, alpha: a };
}

// Points of an arc of a circle as Bezier curves, from angle `from` to `to` (canvas angles).
function arcCurves(cx, cy, r, from, to) {
  const parts = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 2)));
  const step = (to - from) / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const out = [];
  for (let i = 0; i < parts; i++) {
    const a = from + i * step;
    const b = a + step;
    const p = (angle, d) => [
      cx + r * Math.cos(angle) - d * r * Math.sin(angle),
      cy + r * Math.sin(angle) + d * r * Math.cos(angle),
    ];
    out.push([p(a, k), p(b, -k), p(b, 0)]);
  }
  return out;
}

// The commands of one page as the content stream of a PDF page. `used` collects the glyphs of each font.
function pageContent(commands, fonts, used) {
  const height = PAGE.height;
  const X = (x) => num(x);
  const Y = (y) => num(height - y);
  const ops = [];
  const alphas = new Map();
  const fill = (css) => {
    const { rgb, alpha } = colorOf(css);
    if (alpha !== 1) {
      if (!alphas.has(alpha)) alphas.set(alpha, `G${alphas.size + 1}`);
      ops.push(`/${alphas.get(alpha)} gs`);
    }
    ops.push(`${rgb} rg`);
  };
  const stroke = (css) => ops.push(`${colorOf(css).rgb} RG`);
  const roundedRect = (x, y, w, h, radius) => {
    const r = Math.min(radius, w / 2, h / 2);
    if (!r) return ops.push(`${X(x)} ${Y(y + h)} ${num(w)} ${num(h)} re`);
    const k = r * 0.5523;
    const [x2, y2] = [x + w, y + h];
    ops.push(
      `${X(x + r)} ${Y(y)} m`,
      `${X(x2 - r)} ${Y(y)} l`,
      `${X(x2 - r + k)} ${Y(y)} ${X(x2)} ${Y(y + r - k)} ${X(x2)} ${Y(y + r)} c`,
      `${X(x2)} ${Y(y2 - r)} l`,
      `${X(x2)} ${Y(y2 - r + k)} ${X(x2 - r + k)} ${Y(y2)} ${X(x2 - r)} ${Y(y2)} c`,
      `${X(x + r)} ${Y(y2)} l`,
      `${X(x + r - k)} ${Y(y2)} ${X(x)} ${Y(y2 - r + k)} ${X(x)} ${Y(y2 - r)} c`,
      `${X(x)} ${Y(y + r)} l`,
      `${X(x)} ${Y(y + r - k)} ${X(x + r - k)} ${Y(y)} ${X(x + r)} ${Y(y)} c`,
      "h",
    );
  };
  const curves = (list) =>
    list.map(([a, b, c]) => `${X(a[0])} ${Y(a[1])} ${X(b[0])} ${Y(b[1])} ${X(c[0])} ${Y(c[1])} c`);

  for (const c of commands) {
    ops.push("q");
    if (c.t === "text") {
      const [, weight, size] = /^(\d+) ([\d.]+)px/.exec(c.font);
      const key = Number(weight) >= 600 ? "bold" : "regular";
      const font = fonts[key];
      const glyphs = font.glyphs(c.s);
      const wide = font.widthOf(c.s, Number(size));
      const x = c.align === "right" ? c.x - wide : c.align === "center" ? c.x - wide / 2 : c.x;
      for (const [code, glyph] of glyphs) used[key].set(glyph, code);
      fill(c.color);
      const hex = glyphs.map(([, g]) => g.toString(16).padStart(4, "0")).join("");
      ops.push(
        "BT",
        `/${key === "bold" ? "F2" : "F1"} ${num(size)} Tf`,
        `1 0 0 1 ${X(x)} ${Y(c.y + Number(size) * ASCENT)} Tm`,
        `<${hex}> Tj`,
        "ET",
      );
    } else if (c.t === "rect") {
      roundedRect(c.x, c.y, c.w, c.h, c.radius || 0);
      if (c.fill) fill(c.fill);
      if (c.stroke) {
        stroke(c.stroke);
        ops.push("0.8 w", c.fill ? "B" : "S");
      } else ops.push(c.fill ? "f" : "n");
    } else if (c.t === "line") {
      stroke(c.color);
      ops.push(`${num(c.width)} w`, `${X(c.x1)} ${Y(c.y1)} m`, `${X(c.x2)} ${Y(c.y2)} l`, "S");
    } else if (c.t === "path") {
      if (c.area) {
        fill(c.area.fill);
        ops.push(`${X(c.points[0][0])} ${Y(c.area.baseline)} m`);
        for (const [x, y] of c.points) ops.push(`${X(x)} ${Y(y)} l`);
        ops.push(`${X(c.points.at(-1)[0])} ${Y(c.area.baseline)} l`, "h", "f");
      }
      stroke(c.color);
      ops.push(`${num(c.width)} w`, "1 j", "1 J");
      c.points.forEach(([x, y], i) => ops.push(`${X(x)} ${Y(y)} ${i ? "l" : "m"}`));
      ops.push("S");
    } else if (c.t === "dot") {
      fill(c.color);
      ops.push(
        `${X(c.x + c.r)} ${Y(c.y)} m`,
        ...curves(arcCurves(c.x, c.y, c.r, 0, Math.PI * 2)),
        "f",
      );
    } else if (c.t === "arc") {
      fill(c.color);
      stroke("#ffffff");
      const start = [c.x + c.r * Math.cos(c.from), c.y + c.r * Math.sin(c.from)];
      ops.push(
        `${X(start[0])} ${Y(start[1])} m`,
        ...curves(arcCurves(c.x, c.y, c.r, c.from, c.to)),
        `${X(c.x + c.inner * Math.cos(c.to))} ${Y(c.y + c.inner * Math.sin(c.to))} l`,
        ...curves(arcCurves(c.x, c.y, c.inner, c.to, c.from)),
        "h",
        "1 w",
        "B",
      );
    }
    ops.push("Q");
  }
  return { text: ops.join("\n"), alphas };
}

// The objects of one embedded font; returns the number of the font object. `add` stores an object.
async function fontObjects(font, key, used, add) {
  const tag = key === "bold" ? "Bold" : "Regular";
  const name = `${key === "bold" ? "BAAAAA" : "AAAAAA"}+LiberationSans-${tag}`;
  const scale = 1000 / font.unitsPerEm;
  const file = await deflate(font.bytes);
  const fileId = add([
    `<< /Filter /FlateDecode /Length ${file.length} /Length1 ${font.bytes.length} >>\nstream\n`,
    file,
    "\nendstream",
  ]);
  const descriptor = add([
    `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${font.box.map((v) => Math.round(v * scale)).join(" ")}] /ItalicAngle 0 /Ascent ${Math.round(font.ascent * scale)} /Descent ${Math.round(font.descent * scale)} /CapHeight ${Math.round(font.capHeight * scale)} /StemV ${key === "bold" ? 140 : 80} /FontFile2 ${fileId} 0 R >>`,
  ]);
  const glyphs = [...used.keys()].sort((a, b) => a - b);
  const widths = glyphs.map((g) => `${g} [${Math.round(font.advances[g] * scale)}]`).join(" ");
  const cid = add([
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /DW 500 /W [${widths}] >>`,
  ]);
  // The map back to Unicode is what lets a reader select, copy and search the text.
  const chunks = [];
  for (let i = 0; i < glyphs.length; i += 100)
    chunks.push(
      `${Math.min(100, glyphs.length - i)} beginbfchar\n${glyphs
        .slice(i, i + 100)
        .map((g) => `<${g.toString(16).padStart(4, "0")}> <${utf16(used.get(g))}>`)
        .join("\n")}\nendbfchar`,
    );
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const mapBytes = await deflate(encoder.encode(cmap));
  const toUnicode = add([
    `<< /Filter /FlateDecode /Length ${mapBytes.length} >>\nstream\n`,
    mapBytes,
    "\nendstream",
  ]);
  return add([
    `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
  ]);
}

// The PDF file for the pages (lists of drawing commands) with the fonts of `loadReportFonts`.
// `language` is the language tag of the text, `title` and `subject` are shown by readers.
export async function buildPdf(pages, fonts, { title, subject = "", language = "en" }) {
  const objects = [];
  const add = (parts) => objects.push(parts) && objects.length;
  const used = { regular: new Map(), bold: new Map() };
  // Numbers 1 to 3 are the catalog, the page tree and the information.
  add([""]);
  add([""]);
  add([""]);
  const contents = pages.map((commands) => pageContent(commands, fonts, used));
  const fontIds = {
    F1: await fontObjects(fonts.regular, "regular", used.regular, add),
    F2: await fontObjects(fonts.bold, "bold", used.bold, add),
  };
  const pageIds = [];
  for (const { text, alphas } of contents) {
    const body = await deflate(encoder.encode(text));
    const stream = add([
      `<< /Filter /FlateDecode /Length ${body.length} >>\nstream\n`,
      body,
      "\nendstream",
    ]);
    const states = [...alphas].map(([a, name]) => `/${name} << /ca ${a} >>`).join(" ");
    pageIds.push(
      add([
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R >> /ExtGState << ${states} >> >> /Contents ${stream} 0 R >>`,
      ]),
    );
  }
  objects[0] = [
    `<< /Type /Catalog /Pages 2 0 R /Lang (${language}) /ViewerPreferences << /DisplayDocTitle true >> >>`,
  ];
  objects[1] = [
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  ];
  objects[2] = [
    `<< /Title ${pdfText(title)} /Subject ${pdfText(subject)} /Producer ${pdfText("Monivra")} /Creator ${pdfText("Monivra")} >>`,
  ];
  const chunks = [encoder.encode("%PDF-1.7\n%âãÏÓ\n")];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((parts, i) => {
    offsets.push(length);
    const pieces = [`${i + 1} 0 obj\n`, ...parts, "\nendobj\n"].map((p) =>
      typeof p === "string" ? encoder.encode(p) : p,
    );
    for (const piece of pieces) {
      chunks.push(piece);
      length += piece.length;
    }
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  const out = new Uint8Array(length + chunks.at(-1).length);
  let at = 0;
  for (const piece of chunks) {
    out.set(piece, at);
    at += piece.length;
  }
  return out;
}
