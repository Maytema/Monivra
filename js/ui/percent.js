/* Percent as text: the rounded value of shownPercent in the number format of the language */
import { shownPercent } from "../domain/percent.js";
import { currentLocale } from "../i18n/index.js";

// From which percent on the figure is shortened.
const COMPACT_FROM = 10000;
const format = (options) => new Intl.NumberFormat(currentLocale(), options);

// The exact percent, with its digits in full.
export const exactPercent = (percent) =>
  format({ maximumFractionDigits: 2 }).format(shownPercent(percent)) + "%";

// Percent with up to two decimals, the digits after the point set smaller. A huge one is
// shortened (2.4M); the exact figure is for the details.
export function percentLabel(percent) {
  const unit = '<span class="goal-pct-unit">%</span>';
  if (percent >= COMPACT_FROM)
    return `<span class="goal-pct-main">${format({ notation: "compact", maximumFractionDigits: 1 }).format(percent)}</span>${unit}`;
  const parts = format({ maximumFractionDigits: 2 }).formatToParts(shownPercent(percent));
  const point = parts.findIndex((part) => part.type === "decimal");
  const text = (list) => list.map((part) => part.value).join("");
  const whole = point < 0 ? parts : parts.slice(0, point);
  return `<span class="goal-pct-main">${text(whole)}</span>${point < 0 ? "" : `<span class="goal-pct-frac">${text(parts.slice(point))}</span>`}${unit}`;
}
