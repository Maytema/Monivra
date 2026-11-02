/* Calendar dialogs: one date and a range of dates */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg, TODAY } from "../core/constants.js";
import { appData } from "../core/state.js";
import { dateLabel, parseDate, toIsoDate } from "../domain/finance.js";
import { currentLocale, translate } from "../i18n/index.js";
import { buttonHtml, iconButtonHtml } from "./primitives.js";
import { closeLayers, openSheet } from "./navigation.js";

// Month names and weekday letters in the language of the interface.
const monthTitle = (month) => {
  const title = parseDate(month + "-01").toLocaleDateString(currentLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return title.charAt(0).toUpperCase() + title.slice(1);
};
const weekdayLetters = () => {
  const first = appData.settings.weekStart;
  // 2026-11-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    parseDate(`2026-11-${String(1 + ((first + i) % 7)).padStart(2, "0")}`).toLocaleDateString(
      currentLocale(),
      { weekday: "short", timeZone: "UTC" },
    ),
  );
};
// Month grid of the calendar dialog; `view.month` is the shown month. The title opens a grid
// of years, the arrows move by a month, `pick(date)` handles a tap on a day. Days before `min`
// cannot be chosen.
function monthGridHtml(view, chosen, pick, min) {
  const first = parseDate(view.month + "-01"),
    lead = (first.getUTCDay() - appData.settings.weekStart + 7) % 7,
    days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const move = (n) => {
    first.setUTCMonth(first.getUTCMonth() + n);
    view.month = toIsoDate(first).slice(0, 7);
    render();
  };
  const year = first.getUTCFullYear();
  const title = buttonHtml(
    `${escapeHtml(monthTitle(view.month))}<span class="calendar-caret ${view.years ? "open" : ""}">${iconSvg("down", 16)}</span>`,
    () => {
      view.years = !view.years;
      render();
    },
    "calendar-title",
  );
  const head = view.years
    ? `<div class="calendar-head">${title}</div>`
    : `<div class="calendar-head">${iconButtonHtml("left", "Previous month", () => move(-1))}${title}${iconButtonHtml("right", "Next month", () => move(1))}</div>`;
  if (view.years)
    return `${head}<div class="calendar-years">${Array.from({ length: 21 }, (_, i) => year - 10 + i)
      .map((y) =>
        buttonHtml(
          String(y),
          () => {
            view.month = `${y}${view.month.slice(4)}`;
            view.years = false;
            render();
          },
          y === year ? "active" : "",
        ),
      )
      .join("")}</div>`;
  return `${head}<div class="calendar">${weekdayLetters()
    .map((x) => `<small>${escapeHtml(x)}</small>`)
    .join("")}${"<span></span>".repeat(lead)}${Array.from({ length: days }, (_, i) => {
    const date = `${view.month}-${String(i + 1).padStart(2, "0")}`;
    return buttonHtml(
      String(i + 1),
      () => pick(date),
      `calendar-day ${date === TODAY ? "today" : ""} ${date === chosen ? "active" : ""}`,
      min && date < min ? "disabled" : "",
    );
  }).join("")}</div>`;
}
// Calendar dialog for picking a date; with `min`, earlier days are dimmed and cannot be chosen.
export function calendar(value, done, min = null) {
  let chosen = value;
  const view = { month: value.slice(0, 7), years: false };
  openSheet(
    () =>
      `<small class="calendar-caption">${translate("Select date")}</small>${monthGridHtml(
        view,
        chosen,
        (date) => {
          chosen = date;
          render();
        },
        min,
      )}<div class="dialog-actions">${
        min && min > TODAY
          ? ""
          : buttonHtml(
              "Today",
              () => {
                chosen = TODAY;
                view.month = TODAY.slice(0, 7);
                view.years = false;
                render();
              },
              "text-button calendar-today",
            )
      }${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          done(chosen);
        },
        "primary",
      )}</div>`,
    "Select date",
    "dialog",
  );
}
// Dialog for a period: two tiles open the calendar for the first and the last day.
export function rangeDialog(from, to, done) {
  const tile = (label, date, set) =>
    buttonHtml(
      `${iconSvg("calendar", 28)}<small>${translate(label)}</small><strong>${date ? escapeHtml(dateLabel(date, true)) : translate("Select date")}</strong>`,
      () =>
        calendar(date || TODAY, (picked) => {
          set(picked);
          render();
        }),
      `range-tile ${date ? "chosen" : ""}`,
    );
  openSheet(
    () =>
      `<h2>${translate("Select range")}</h2><div class="range-tiles">${tile("From", from, (d) => (from = d))}${tile("To", to, (d) => (to = d))}</div><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          done(...[from, to].sort());
        },
        "primary",
        from && to ? "" : "disabled",
      )}</div>`,
    "Select range",
    "dialog",
  );
}
