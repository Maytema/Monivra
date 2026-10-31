/* Pointer handling of the dial of the time picker */
import { actionHandlers, inputHandlers } from "../ui/primitives.js";

// Attach the listeners once (the #app element itself is never replaced).
export function initClockDial() {
  const app = document.getElementById("app");
  if (!app || app.dataset.clockDial) return;
  app.dataset.clockDial = "1";
  let active = null;
  // The point under the finger: its place on the turn and its distance from the centre.
  const update = (e) => {
    const rect = active.getBoundingClientRect(),
      radius = rect.width / 2;
    const dx = e.clientX - rect.left - radius,
      dy = e.clientY - rect.top - radius;
    const turns = (((Math.atan2(dx, -dy) / (2 * Math.PI)) % 1) + 1) % 1;
    inputHandlers[active.dataset.dial]?.({ turns, share: Math.hypot(dx, dy) / radius });
  };
  app.addEventListener("pointerdown", (e) => {
    const dial = e.target.closest("[data-dial]");
    if (!dial) return;
    active = dial;
    dial.setPointerCapture(e.pointerId);
    update(e);
  });
  app.addEventListener("pointermove", (e) => active && update(e));
  const stop = () => {
    const dial = active;
    active = null;
    if (dial) actionHandlers[dial.dataset.settled]?.();
  };
  for (const type of ["pointerup", "pointercancel"]) app.addEventListener(type, stop);
  // A finger on the dial must not scroll the dialog.
  app.addEventListener("touchmove", (e) => active && e.cancelable && e.preventDefault(), {
    passive: false,
  });
}
