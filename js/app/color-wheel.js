/* Color wheel: a hue ring with a saturation/brightness square (turned 45°) inside it. */
import { hexToHsv, hsvToHex } from "../core/color.js";
import { actionHandlers, inputHandlers, registerAction, registerInput } from "../ui/primitives.js";

const RING_INNER = 0.76; // share of the wheel radius where the hue ring starts
const SQUARE_HALF = 0.5; // half side of the square, share of the wheel radius
const TURN = Math.PI / 4;

// Where the two thumbs sit, as percent offsets of the wheel: [hue ring, square].
function thumbPositions(h, s, v) {
  const angle = (h * Math.PI) / 180,
    ring = (1 + RING_INNER) / 2;
  // Square coordinates (−1…1) turned onto the screen.
  const lx = (s * 2 - 1) * SQUARE_HALF,
    ly = (1 - v * 2) * SQUARE_HALF;
  const at = (x, y) => `left:${50 + x * 50}%;top:${50 + y * 50}%`;
  return [
    at(Math.sin(angle) * ring, -Math.cos(angle) * ring),
    at(lx * Math.cos(TURN) - ly * Math.sin(TURN), lx * Math.sin(TURN) + ly * Math.cos(TURN)),
  ];
}

// Markup of the wheel for the given color; `pick(hex)` runs while a finger moves over it,
// `settle()` when the finger is lifted.
export function wheelHtml(hex, hue, pick, settle) {
  const [h, s, v] = wheelValues(hex, hue);
  const [ring, square] = thumbPositions(h, s, v);
  return `<div class="wheel" data-wheel="${registerInput(pick)}" data-settled="${registerAction(settle)}" data-h="${h}" data-s="${s}" data-v="${v}" style="--hue:${h}" role="group" aria-label="Color wheel"><div class="wheel-square"></div><span class="wheel-hue" style="${ring}"></span><span class="wheel-pick" style="${square}"></span></div>`;
}

// Move the thumbs and the dependent colors while the finger is down.
function paintWheel(wheel, h, s, v) {
  Object.assign(wheel.dataset, { h, s, v });
  const hex = hsvToHex(h, s, v);
  const [ring, square] = thumbPositions(h, s, v);
  wheel.querySelector(".wheel-hue").style.cssText = ring;
  wheel.querySelector(".wheel-pick").style.cssText = square;
  wheel.style.setProperty("--hue", h);
  wheel.closest(".picker-color-page")?.style.setProperty("--picked", hex);
  return hex;
}

// Hue, saturation and value for "#rrggbb" (gray keeps the given hue).
export const wheelValues = (hex, hue = 0) => {
  const [h, s, v] = hexToHsv(hex);
  return [s ? h : hue, s, v];
};

// Attach the listeners once (the #app element itself is never replaced).
export function initColorWheel() {
  const app = document.getElementById("app");
  if (!app || app.dataset.colorWheel) return;
  app.dataset.colorWheel = "1";
  let active = null;
  const update = (e) => {
    const rect = active.wheel.getBoundingClientRect(),
      radius = rect.width / 2;
    const dx = (e.clientX - rect.left - radius) / radius,
      dy = (e.clientY - rect.top - radius) / radius;
    let { h, s, v } = Object.fromEntries(
      ["h", "s", "v"].map((k) => [k, Number(active.wheel.dataset[k])]),
    );
    if (active.mode === "hue") h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    else {
      const lx = dx * Math.cos(TURN) + dy * Math.sin(TURN),
        ly = -dx * Math.sin(TURN) + dy * Math.cos(TURN);
      const clamp = (n) => Math.min(1, Math.max(0, n));
      s = clamp((lx / SQUARE_HALF + 1) / 2);
      v = clamp(1 - (ly / SQUARE_HALF + 1) / 2);
    }
    inputHandlers[active.wheel.dataset.wheel]?.(paintWheel(active.wheel, h, s, v));
    const field = active.wheel.closest(".picker-color-page")?.querySelector(".picker-hex input");
    if (field) field.value = hsvToHex(h, s, v);
  };
  app.addEventListener("pointerdown", (e) => {
    const wheel = e.target.closest("[data-wheel]");
    if (!wheel) return;
    const rect = wheel.getBoundingClientRect(),
      radius = rect.width / 2;
    const distance = Math.hypot(e.clientX - rect.left - radius, e.clientY - rect.top - radius);
    active = { wheel, mode: distance / radius >= RING_INNER ? "hue" : "square" };
    wheel.setPointerCapture(e.pointerId);
    update(e);
  });
  app.addEventListener("pointermove", (e) => active && update(e));
  // Letting go refreshes the parts that depend on the color (shades, hex field).
  const stop = () => {
    const wheel = active?.wheel;
    active = null;
    if (wheel) actionHandlers[wheel.dataset.settled]?.();
  };
  for (const type of ["pointerup", "pointercancel"]) app.addEventListener(type, stop);
  // A finger on the wheel must not scroll the sheet.
  app.addEventListener("touchmove", (e) => active && e.cancelable && e.preventDefault(), {
    passive: false,
  });
}
