/* The soft keyboard takes a part of the screen. A field inside a dialog or a sheet has to stay in
   view then, together with what is above and below it: the layer scrolls to it. Only fields in
   layers (overlays) are looked after; pages scroll the way the system does it. */
let timer = 0;

function reveal() {
  const field = document.activeElement;
  if (!field?.matches?.("input:not([type=checkbox]):not([type=radio]),textarea")) return;
  if (!field.closest(".overlay")) return;
  field.scrollIntoView({ block: "center", inline: "nearest" });
}

// The layout needs a moment to follow the keyboard; the window and the visual viewport both tell
// when it did, so the field is revealed after the last of the changes.
function later(delay) {
  clearTimeout(timer);
  timer = setTimeout(reveal, delay);
}

export function keepFieldsInView() {
  document.addEventListener("focusin", () => later(320));
  window.addEventListener("resize", () => later(120));
  window.visualViewport?.addEventListener("resize", () => later(120));
}
