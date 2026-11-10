/* Illustration for the "About our team" page: the top of a phone showing the main screen, where
   an expense is added once, then small shapes drift. The phone runs off the bottom and fades into the page. */

const ROW_STEP = 34;
// Rows of the list; they all look alike so that the loop restarts without a visible jump.
const row = (y, className = "about-row") =>
  `<g class="${className}"><rect class="about-row-card" x="84" y="${y}" width="152" height="28" rx="10"/><circle class="about-row-icon" cx="100" cy="${y + 14}" r="9"/><rect class="about-row-title" x="116" y="${y + 7}" width="54" height="5" rx="2.5"/><rect class="about-row-note" x="116" y="${y + 16}" width="30" height="4" rx="2"/><rect class="about-row-amount" x="196" y="${y + 11}" width="30" height="6" rx="3"/></g>`;
const FIRST_ROW = 146;
const rows = [0, 1, 2, 3].map((i) => row(FIRST_ROW + i * ROW_STEP)).join("");

// Slices of the ring as [length, start, tone], in parts of a hundred.
const SLICES = [
  [46, 0, "slice-main"],
  [26, 48, "slice-gain"],
  [14, 76, "slice-loss"],
];
const ring = SLICES.map(
  ([length, start, tone]) =>
    `<circle class="about-slice ${tone}" cx="204" cy="90" r="24" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-start}"/>`,
).join("");

// Small shapes beside the phone that drift slowly once the introduction is over; [x, y, size, delay s].
const FLOATERS = [
  [34, 70, 5, 0],
  [286, 108, 4, 1.7],
  [42, 176, 3.5, 3.1],
];
const floaters = FLOATERS.map(
  ([x, y, r, delay]) =>
    `<circle class="about-float" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${delay}s"/>`,
).join("");

export const aboutArt = `<svg class="about-art" viewBox="0 0 320 252" aria-hidden="true">
<defs><linearGradient id="about-fade" x1="0" y1="0" x2="0" y2="1"><stop class="about-fade-from" offset="0"/><stop class="about-fade-to" offset="1"/></linearGradient></defs>
<g class="about-phone"><rect class="about-body" x="70" y="24" width="180" height="330" rx="30"/><rect class="about-speaker" x="140" y="34" width="40" height="5" rx="2.5"/>
<rect class="about-hero" x="84" y="52" width="152" height="76" rx="16"/><rect class="about-label" x="98" y="68" width="44" height="5" rx="2.5"/><rect class="about-balance" x="98" y="82" width="70" height="11" rx="5.5"/><rect class="about-label" x="98" y="104" width="30" height="5" rx="2.5"/><rect class="about-label" x="134" y="104" width="22" height="5" rx="2.5"/>
<g class="about-ring"><circle class="about-track" cx="204" cy="90" r="24" pathLength="100"/>${ring}</g>
${rows}${row(FIRST_ROW, "about-row about-new")}</g>
<rect class="about-fade" x="0" y="164" width="320" height="88" fill="url(#about-fade)"/>
${floaters}<g class="about-chip"><circle cx="100" cy="${FIRST_ROW + 14}" r="11"/><path d="M95 ${FIRST_ROW + 14}h10"/></g>
</svg>`;
