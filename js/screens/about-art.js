/* Illustration for the "About our team" page: a phone with a spending ring and a short list, two coins
   and a few slow particles. The scene builds itself once; only the particles keep moving. */

// Slices of the ring as [length, start, colour class], all in parts of a hundred.
const SLICES = [
  [44, 0, "slice-main"],
  [28, 46, "slice-gain"],
  [16, 76, "slice-loss"],
];
const ring = SLICES.map(
  ([length, start, tone], i) =>
    `<circle class="about-slice ${tone}" style="--at:${0.7 + i * 0.35}s" cx="160" cy="98" r="30" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-start}"/>`,
).join("");

// List rows: the tone of the amount and the width of the title line.
const ROWS = [
  ["row-gain", 54],
  ["row-loss", 44],
  ["row-loss", 60],
];
const rows = ROWS.map(([tone, width], i) => {
  const y = 148 + i * 24;
  return `<g class="about-row" style="--at:${1.5 + i * 0.18}s"><circle class="about-row-icon" cx="124" cy="${y + 8}" r="8"/><rect class="about-row-title" x="140" y="${y + 1}" width="${width}" height="5" rx="2.5"/><rect class="about-row-note" x="140" y="${y + 11}" width="30" height="4" rx="2"/><rect class="about-row-amount ${tone}" x="190" y="${y + 5}" width="18" height="6" rx="3"/></g>`;
}).join("");

// Coin: an outer rim and an inner face.
const coin = (name, x, y, radius, at) =>
  `<g class="about-coin ${name}" style="--at:${at}s"><circle class="about-rim" cx="${x}" cy="${y}" r="${radius}"/><circle class="about-face" cx="${x}" cy="${y}" r="${radius * 0.55}"/></g>`;

// Particles: shape, place and the drift they make, with their own pace.
const PARTICLES = [
  ["dot", 30, 46, 6, -8, 9, 0],
  ["cross", 78, 78, -5, 7, 11, -3],
  ["dot", 40, 118, 7, 5, 10, -5],
  ["cross", 28, 214, 6, -6, 12, -2],
  ["dot", 286, 44, -6, 8, 10, -6],
  ["cross", 252, 66, 5, -7, 9, -4],
  ["dot", 296, 176, -7, -5, 11, -1],
  ["cross", 244, 214, -6, 6, 12, -7],
];
const particles = PARTICLES.map(([shape, x, y, dx, dy, time, delay]) =>
  shape === "dot"
    ? `<circle class="about-particle" style="--dx:${dx}px;--dy:${dy}px;--time:${time}s;--delay:${delay}s" cx="${x}" cy="${y}" r="2.5"/>`
    : `<path class="about-particle" style="--dx:${dx}px;--dy:${dy}px;--time:${time}s;--delay:${delay}s" d="M${x - 3} ${y}h6M${x} ${y - 3}v6"/>`,
).join("");

export const aboutArt = `<svg class="about-art" viewBox="0 0 320 240" aria-hidden="true">
${particles}
<g class="about-phone"><rect class="about-body" x="100" y="16" width="120" height="208" rx="22"/><rect class="about-speaker" x="142" y="26" width="36" height="5" rx="2.5"/><rect class="about-heading" x="114" y="44" width="46" height="6" rx="3"/>
<circle class="about-track" cx="160" cy="98" r="30" pathLength="100"/>${ring}<g class="about-hub"><circle cx="160" cy="98" r="13"/><circle cx="160" cy="98" r="5"/></g>${rows}</g>
${coin("coin-left", 58, 176, 20, 2.1)}${coin("coin-right", 264, 116, 15, 2.35)}
<g class="about-check" style="--at:2.2s"><circle cx="220" cy="18" r="13"/><path d="m213.5 18 4.5 4.5 8-9"/></g>
</svg>`;
