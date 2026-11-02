/* The percent that is shown for a share: one rule for every meter and figure in the application */

// Two decimals, rounded as usual. A target that is not reached never shows 100, and what is not a
// number shows 0. Only the display is rounded; whether a goal is reached is decided on the amounts.
export function shownPercent(percent) {
  if (!Number.isFinite(percent)) return 0;
  // toPrecision drops the binary noise (1.005 * 100 is 100.49999999999999) before rounding
  const rounded = Math.round(Number((percent * 100).toPrecision(12))) / 100 || 0;
  return percent < 100 && rounded >= 100 ? 99.99 : rounded;
}
