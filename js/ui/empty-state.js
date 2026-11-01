/* Empty states: a small illustration with a title and a hint */
import { translate } from "../i18n/index.js";

/* Empty states: a small illustration with a title and a hint; it plays once, the first time it is shown. */
const EMPTY_ILLUSTRATIONS = {
  // One sheet of paper rolled up at the top and the bottom, with a lens that finds nothing.
  operations: `<svg class="empty-art" viewBox="-6 -6 342 342" aria-hidden="true"><g class="empty-paper"><path class="empty-edge" d="M270 6H96A48 48 0 0 0 48 54V128M48 149V150M48 170V275M266 40V262C266 300 252 328 238 328H200"/><path class="empty-roll" d="M262 2.5h41a25.5 25.5 0 0 1 25.5 25.5V67H262zM7 270H188C188 305 204 331.5 240 331.5H37A30 30 0 0 1 7 301.5z"/></g><path class="empty-line" style="--i:0" pathLength="1" d="M89 65H235"/><path class="empty-line" style="--i:1" pathLength="1" d="M89 115H208"/><path class="empty-line" style="--i:2" pathLength="1" d="M89 168H152"/><path class="empty-line" style="--i:3" pathLength="1" d="M89 220H152"/><g class="empty-search"><circle class="empty-lens" cx="259" cy="152" r="62"/><path class="empty-handle" d="m303 197 24 28"/><path class="empty-cross" d="m237 130 44 44m0-44-44 44"/></g></svg>`,
  statistics: `<svg class="empty-art" viewBox="0 0 120 120" aria-hidden="true"><rect class="bar" style="--i:0" x="10" y="80" width="12" height="20" rx="4"/><rect class="bar" style="--i:1" x="28" y="68" width="12" height="32" rx="4"/><rect class="bar" style="--i:2" x="46" y="56" width="12" height="44" rx="4"/><rect class="bar" style="--i:3" x="64" y="44" width="12" height="56" rx="4"/><rect class="bar" style="--i:4" x="82" y="32" width="12" height="68" rx="4"/><rect class="bar" style="--i:5" x="100" y="20" width="12" height="80" rx="4"/><path class="empty-arrow" pathLength="1" d="M12 52C40 54 70 30 106 4L93.0 4.9 106 4 101.1 16.0"/></svg>`,
};
// When each illustration was first shown (ms); the play class lasts while its animation runs.
const firstShown = {};
const PLAY_MS = 3800;
// Empty-state block; `kind` is "operations" or "statistics".
export function emptyStateHtml(kind, title, hint) {
  firstShown[kind] ??= performance.now();
  const elapsed = performance.now() - firstShown[kind];
  // A redraw while the animation runs continues it from where it was.
  const art = EMPTY_ILLUSTRATIONS[kind].replace(
    "<svg ",
    elapsed < PLAY_MS ? `<svg data-play style="--elapsed:-${Math.round(elapsed)}ms" ` : "<svg ",
  );
  return `<div class="empty-state">${art}<h3>${translate(title)}</h3><p>${translate(hint)}</p></div>`;
}
