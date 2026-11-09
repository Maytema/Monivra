/* A PDF document from pictures of pages (JPEG), written by hand: no library, nothing sent anywhere.
   Every page is one picture on a sheet of A4, so the pages look the same everywhere. */
import { PAGE } from "../data/report-layout.js";

const encoder = new TextEncoder();
const bytesOf = (text) => encoder.encode(text);

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
  return `<FEFF${hex}>`;
}
const pdfDate = (d) =>
  `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

// `images`: [{ bytes, width, height }] JPEG pictures, one per page. Returns the bytes of the file.
export function buildPdf(images, { title = "", author = "Monivra", created = new Date() } = {}) {
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    chunks.push(data);
    length += data.length;
  };
  const object = (number, ...parts) => {
    offsets[number] = length;
    push(bytesOf(`${number} 0 obj\n`));
    for (const part of parts) push(typeof part === "string" ? bytesOf(part) : part);
    push(bytesOf("\nendobj\n"));
  };
  // Objects: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image).
  const first = (index) => 4 + index * 3;
  push(bytesOf("%PDF-1.4\n%âãÏÓ\n"));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${first(i)} 0 R`).join(" ")}] >>`,
  );
  object(
    3,
    `<< /Title ${pdfText(title)} /Author ${pdfText(author)} /Producer ${pdfText("Monivra")} /CreationDate (${pdfDate(created)}) >>`,
  );
  images.forEach((image, i) => {
    const page = first(i);
    const content = `q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /Im0 Do Q`;
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`,
    );
    object(page + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(
      page + 2,
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      "\nendstream",
    );
  });
  const count = 4 + images.length * 3;
  const xref = length;
  push(bytesOf(`xref\n0 ${count}\n0000000000 65535 f \n`));
  for (let n = 1; n < count; n++)
    push(bytesOf(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`));
  push(
    bytesOf(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`),
  );
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
