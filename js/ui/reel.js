/* Rolling digits: the digits of a number that changed spin to their new values like the reels of
   a slot machine; the digits further right spin longer and stop last. */

const BASE_MS = 650;
const EXTRA_MS = 170;
const MAX_LAPS = 3;
const REEL_END_MS = 60;

const digitOf = (char) => (char !== undefined && /\d/.test(char) ? Number(char) : null);

// Markup of one spinning digit: a strip of numbers that ends on the new one.
function reelHtml(start, target, rising, rank) {
  const turn = (rising ? target - start + 10 : start - target + 10) % 10;
  const steps = turn + 10 * Math.min(rank + 1, MAX_LAPS);
  const digits = Array.from({ length: steps + 1 }, (_, i) =>
    rising ? (start + i) % 10 : (target + i) % 10,
  );
  const style = `--steps:${steps};--ms:${BASE_MS + EXTRA_MS * rank}`;
  return `<span class="reel" aria-hidden="true"><span class="reel-strip ${rising ? "reel-up" : "reel-down"}" style="${style}">${digits.map((d) => `<span>${d}</span>`).join("")}</span></span>`;
}

// Spins the digits of `element` that differ from `from` (all of them when `from` is null) and
// puts the plain text back when the last reel has stopped. Does nothing when motion is reduced.
export function rollNumber(element, from, rising) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const text = element.textContent;
  const shift = text.length - (from ?? "").length;
  const chars = [...text];
  const changed = chars.filter(
    (char, i) => digitOf(char) !== null && (from === null || from[i - shift] !== char),
  ).length;
  if (!changed) return;
  let rank = 0;
  element.setAttribute("aria-label", text);
  element.innerHTML = chars
    .map((char, i) => {
      const target = digitOf(char);
      if (target === null || (from !== null && from[i - shift] === char)) return char;
      const start = from === null ? 0 : (digitOf(from[i - shift]) ?? 0);
      return reelHtml(start, target, rising, rank++);
    })
    .join("");
  setTimeout(
    () => {
      if (!element.isConnected) return;
      element.textContent = text;
      element.removeAttribute("aria-label");
    },
    BASE_MS + EXTRA_MS * (changed - 1) + REEL_END_MS,
  );
}
