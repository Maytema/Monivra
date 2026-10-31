/* Illustration for the "About our team" page: an app window that builds itself, drawn in theme colors */

const bars = [
  [84, 40],
  [118, 64],
  [152, 50],
  [186, 86],
]
  .map(
    ([x, height], i) =>
      `<rect class="about-bar" style="--i:${i}" x="${x}" y="${178 - height}" width="22" height="${height}" rx="6"/>`,
  )
  .join("");

// A gear: a ring with teeth made of dashes around a hub.
const gear = (name, x, y, radius) =>
  `<g transform="translate(${x} ${y})"><g class="about-gear ${name}"><circle class="about-teeth" r="${radius}" pathLength="24"/><circle class="about-hub" r="${radius * 0.45}"/></g></g>`;

export const aboutArt = `<svg class="about-art" viewBox="0 0 320 220" aria-hidden="true">
<path class="about-orbit" d="M36 168C30 78 120 28 204 38S300 96 286 150"/>
<circle class="about-spark" r="4"/>
${gear("turn-forward", 262, 62, 18)}${gear("turn-back", 52, 176, 14)}
<g class="about-window"><rect class="about-frame" x="60" y="50" width="200" height="140" rx="16"/>
<circle class="about-light" cx="80" cy="68" r="4"/><circle class="about-light" cx="94" cy="68" r="4"/><circle class="about-light" cx="108" cy="68" r="4"/>
${bars}<path class="about-line" pathLength="1" d="M95 118L129 98L163 110L197 76"/></g>
<g class="about-coin"><circle class="about-coin-edge" cx="272" cy="150" r="18"/><circle class="about-coin-face" cx="272" cy="150" r="10"/></g>
<g class="about-check"><circle cx="236" cy="76" r="13"/><path d="m229.5 76 4.5 4.5 8-9"/></g>
</svg>`;
