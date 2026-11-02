/* Empty states: a small illustration with a title and a hint */
import { iconSvg } from "../core/constants.js";
import { translate } from "../i18n/index.js";

/* Empty states: a small illustration with a title and a hint; it plays once, the first time it is shown. */
const EMPTY_ILLUSTRATIONS = {
  // One sheet of paper rolled up at the top and the bottom, with a lens that finds nothing.
  operations: `<svg class="empty-art" viewBox="-6 -6 342 342" aria-hidden="true"><g class="empty-paper"><path class="empty-edge" d="M270 6H96A48 48 0 0 0 48 54V128M48 149V150M48 170V275M266 40V262C266 300 252 328 238 328H200"/><path class="empty-roll" d="M262 2.5h41a25.5 25.5 0 0 1 25.5 25.5V67H262zM7 270H188C188 305 204 331.5 240 331.5H37A30 30 0 0 1 7 301.5z"/></g><path class="empty-line" style="--i:0" pathLength="1" d="M89 65H235"/><path class="empty-line" style="--i:1" pathLength="1" d="M89 115H208"/><path class="empty-line" style="--i:2" pathLength="1" d="M89 168H152"/><path class="empty-line" style="--i:3" pathLength="1" d="M89 220H152"/><g class="empty-search"><circle class="empty-lens" cx="259" cy="152" r="62"/><path class="empty-handle" d="m303 197 24 28"/><path class="empty-cross" d="m237 130 44 44m0-44-44 44"/></g></svg>`,
  // A wallet: a coin drops into it and banknotes rise out of it.
  accounts: `<svg class="empty-art" viewBox="0 0 160 160" aria-hidden="true"><g class="empty-notes"><g transform="rotate(14 100 50)"><rect class="empty-note" x="72" y="22" width="52" height="34" rx="4"/><circle class="empty-note-mark" cx="98" cy="39" r="7"/></g><g transform="rotate(-6 80 50)"><rect class="empty-note" x="54" y="20" width="52" height="34" rx="4"/><circle class="empty-note-mark" cx="80" cy="37" r="7"/></g></g><g class="empty-wallet"><rect class="empty-wallet-body" x="12" y="44" width="116" height="92" rx="18"/><rect class="empty-wallet-stitch" x="21" y="53" width="98" height="74" rx="11"/><rect class="empty-wallet-clasp" x="88" y="76" width="50" height="34" rx="9"/><circle class="empty-wallet-button" cx="108" cy="93" r="7"/></g><g class="empty-coins"><rect class="empty-coin" x="106" y="126" width="26" height="8" rx="4"/><rect class="empty-coin" x="106" y="117" width="26" height="8" rx="4"/></g><rect class="empty-coin empty-coin-drop" x="106" y="108" width="26" height="8" rx="4"/></svg>`,
  // An open box: a ball flies into it along a dotted path.
  categories: `<svg class="empty-art" viewBox="0 0 160 160" aria-hidden="true"><g class="empty-box"><path class="empty-box-back" d="M80 64 134 86 80 108 26 86z"/><path class="empty-box-side-left" d="M26 86 80 108V152L26 130z"/><path class="empty-box-side-right" d="M134 86 80 108V152L134 130z"/><path class="empty-box-flaps" d="M26 86 8 76 62 54 80 64M134 86 152 76 98 54 80 64"/></g><path class="empty-trail" pathLength="1" d="M104 18C100 28 88 34 82 46 72 66 48 70 58 96"/><circle class="empty-ball" r="6"/></svg>`,
  budgets: iconSvg("budget", 96).replace("<svg ", '<svg class="empty-icon" '),
  scheduled: iconSvg("calendar", 96).replace("<svg ", '<svg class="empty-icon" '),
  statistics: `<svg class="empty-art" viewBox="0 0 120 120" aria-hidden="true"><rect class="bar" style="--i:0" x="10" y="80" width="12" height="20" rx="4"/><rect class="bar" style="--i:1" x="28" y="68" width="12" height="32" rx="4"/><rect class="bar" style="--i:2" x="46" y="56" width="12" height="44" rx="4"/><rect class="bar" style="--i:3" x="64" y="44" width="12" height="56" rx="4"/><rect class="bar" style="--i:4" x="82" y="32" width="12" height="68" rx="4"/><rect class="bar" style="--i:5" x="100" y="20" width="12" height="80" rx="4"/><path class="empty-arrow" pathLength="1" d="M12 52C40 54 70 30 106 4L93.0 4.9 106 4 101.1 16.0"/></svg>`,
};
// When each illustration was first shown (ms); the play class lasts while its animation runs.
const firstShown = {};
const PLAY_MS = 3800;
// Empty-state block; `kind` names the illustration and `action` is an optional button below.
export function emptyStateHtml(kind, title, hint, action = "") {
  firstShown[kind] ??= performance.now();
  const elapsed = performance.now() - firstShown[kind];
  // A redraw while the animation runs continues it from where it was.
  const art = EMPTY_ILLUSTRATIONS[kind].replace(
    "<svg ",
    elapsed < PLAY_MS ? `<svg data-play style="--elapsed:-${Math.round(elapsed)}ms" ` : "<svg ",
  );
  return `<div class="empty-state">${art}<h3>${translate(title)}</h3><p>${translate(hint)}</p>${action}</div>`;
}
