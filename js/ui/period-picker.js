/* The period shown by the statistics and lists: its bar, picker and the month start setting */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg, TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import { canShiftPeriod, periodBounds, periodTitle, shiftPeriod } from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { hintHtml } from "./hint.js";
import { buttonHtml, iconButtonHtml } from "./primitives.js";
import { closeLayers, openSheet } from "./navigation.js";
import { calendar, rangeDialog } from "./calendar.js";

// Period selector bar with previous/next arrows; "All time" has no neighbours, so they are dimmed.
export function periodBar() {
  const fixed = !canShiftPeriod();
  return `<div class="period">${iconButtonHtml("left", "Previous period", () => stepPeriod(-1), fixed)}${buttonHtml(escapeHtml(periodTitle()) + " " + iconSvg("down", 14), periodPicker, "label")}${iconButtonHtml("right", "Next period", () => stepPeriod(1), fixed)}</div>`;
}
// Move the selected period forward or backward.
function stepPeriod(n) {
  if (!shiftPeriod(n)) return;
  uiState.donut = null;
  render();
}
// Dialog for the day on which a month starts (payday instead of the 1st). Only the days that
// every month has can be chosen.
export function monthStartDialog(onDone) {
  const chosen = appData.settings.monthStart;
  openSheet(
    () =>
      `<h2>${translate("Month starts on")}</h2><div class="calendar">${Array.from(
        { length: 28 },
        (_, i) => i + 1,
      )
        .map((day) =>
          buttonHtml(
            String(day),
            () => {
              appData.settings.monthStart = day;
              save();
              closeLayers();
              onDone();
            },
            `calendar-day ${day === chosen ? "active" : ""}`,
          ),
        )
        .join("")}</div>`,
    "Month starts on",
  );
}
// Small caption of an interval tile: the range it would select right now.
function intervalNote(mode) {
  if (!["week", "today", "year", "month"].includes(mode)) return "";
  const period = { mode: mode === "today" ? "day" : mode, anchor: TODAY };
  return periodTitle(period);
}
// Sheet for choosing the period mode and range.
function periodPicker() {
  openSheet(
    () =>
      `<h2>${translate("Time interval")}</h2>${hintHtml("month-start", "Your month can start on payday instead of the 1st. Tap to set it up.", () => monthStartDialog(() => render()))}<div class="interval-grid">${[
        ["range", "Select date range"],
        ["all", "All time"],
        ["day", "Choose a day"],
        ["week", "Week"],
        ["today", "Today"],
        ["year", "Year"],
        ["month", "Month"],
      ]
        .map(([mode, label]) =>
          buttonHtml(
            iconSvg("calendar", 32) +
              translate(label) +
              (intervalNote(mode) ? `<small>${intervalNote(mode)}</small>` : ""),
            () => {
              if (mode === "range") {
                // A period that is already a range is shown, otherwise both ends are still empty.
                const [a, b] = uiState.period.mode === "range" ? periodBounds() : [null, null];
                rangeDialog(a, b, (from, to) => {
                  uiState.period = { mode, from, to, anchor: from };
                  closeLayers();
                });
              } else if (mode === "day")
                calendar(uiState.period.anchor, (s) => {
                  uiState.period = { mode: "day", anchor: s };
                  closeLayers();
                });
              else {
                uiState.period = {
                  mode: mode === "today" ? "day" : mode,
                  anchor: TODAY,
                };
                closeLayers();
              }
            },
            "",
          ),
        )
        .join("")}</div>${buttonHtml("Cancel", () => closeLayers(), "text-button")}`,
    "Time interval",
    "dialog",
  );
}
