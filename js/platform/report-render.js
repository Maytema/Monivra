/* Draws the pages of a report (lists of drawing commands) as pictures. The same pictures are shown in
   the preview, printed, and put into the PDF. */
import { PAGE } from "../data/report-layout.js";
import { ASCENT } from "./report-font.js";

// Pixels per point: 2 gives 1190 × 1684 for A4, enough for sharp text on paper and on a phone.
export const SCALE = 2;
const QUALITY = 0.9;

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Draws one command.
function draw(ctx, c) {
  if (c.t === "text") {
    ctx.font = c.font;
    ctx.fillStyle = c.color;
    ctx.textAlign = c.align;
    ctx.textBaseline = "alphabetic";
    ctx.fontKerning = "none";
    // The same baseline the PDF uses, so the preview and the file agree.
    ctx.fillText(c.s, c.x, c.y + Number(/([\d.]+)px/.exec(c.font)[1]) * ASCENT);
  } else if (c.t === "rect") {
    roundedRect(ctx, c.x, c.y, c.w, c.h, c.radius || 0);
    ctx.fillStyle = c.fill;
    ctx.fill();
    if (c.stroke) {
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  } else if (c.t === "line") {
    ctx.beginPath();
    ctx.moveTo(c.x1, c.y1);
    ctx.lineTo(c.x2, c.y2);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = c.width;
    ctx.stroke();
  } else if (c.t === "path") {
    if (c.area) {
      ctx.beginPath();
      ctx.moveTo(c.points[0][0], c.area.baseline);
      for (const [x, y] of c.points) ctx.lineTo(x, y);
      ctx.lineTo(c.points.at(-1)[0], c.area.baseline);
      ctx.closePath();
      ctx.fillStyle = c.area.fill;
      ctx.fill();
    }
    ctx.beginPath();
    c.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = c.color;
    ctx.lineWidth = c.width;
    ctx.lineJoin = "round";
    ctx.stroke();
  } else if (c.t === "dot") {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
  } else if (c.t === "arc") {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, c.from, c.to);
    ctx.arc(c.x, c.y, c.inner, c.to, c.from, true);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// A canvas to measure text with when laying a report out.
export function measuringContext() {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fontKerning = "none";
  return ctx;
}

// Draws the pages one after another, handing each finished picture over (`onPage(done, total)`
// tells the progress) so that no more than one canvas is alive at a time.
// Resolves with [{ bytes, width, height, url }] (JPEG).
export async function renderPages(pages, onPage = () => {}, signal = null) {
  await document.fonts?.ready;
  const result = [];
  const canvas = document.createElement("canvas");
  canvas.width = PAGE.width * SCALE;
  canvas.height = PAGE.height * SCALE;
  const ctx = canvas.getContext("2d");
  try {
    for (const [index, commands] of pages.entries()) {
      // A cancelled job stops here, between two pages, and lets go of the pictures made so far.
      signal?.throwIfAborted();
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PAGE.width, PAGE.height);
      for (const command of commands) draw(ctx, command);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", QUALITY));
      result.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
        url: URL.createObjectURL(blob),
      });
      onPage(index + 1, pages.length);
      // Let the screen breathe between pages.
      await new Promise((resume) => setTimeout(resume, 0));
    }
    signal?.throwIfAborted();
  } catch (error) {
    for (const page of result) URL.revokeObjectURL(page.url);
    throw error;
  } finally {
    canvas.width = canvas.height = 1;
  }
  return result;
}
