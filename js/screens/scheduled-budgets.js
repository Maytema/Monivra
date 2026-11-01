/* Scheduled payments */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg, timeNow, TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { dateLabel, parseDate } from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { feeLinesHtml } from "./fees.js";
import { operationsAddMenu } from "./operations/add-menu.js";
import { opRow } from "./operations/list.js";
import {
  recurLabel,
  recurrence,
  remainingLabel,
  reminder,
  reminderLabel,
  weekdayName,
} from "./recurrence.js";
import { calendar } from "../ui/calendar.js";
import { timeLabel, timePicker } from "../ui/time-picker.js";
import { closeLayers, openSheet } from "../ui/navigation.js";
import { optionSheet } from "../ui/dialogs.js";
import { buttonHtml, fabHtml, iconButtonHtml, pageHeader } from "../ui/primitives.js";

// What goes under a scheduled row: fees with the net amount, the repeat rule and the reminder.
function scheduleDetails(o) {
  const line = (icon, text) =>
    `<div class="detail-line">${icon}<span>${escapeHtml(text)}</span></div>`;
  const rule = [
    o.time ? line(iconSvg("clock", 18), timeLabel(o.time)) : "",
    o.recur ? line(iconSvg("repeat", 18), recurLabel(o.recur) + remainingLabel(o.recur)) : "",
    o.reminder ? line(iconSvg("bell", 18), reminderLabel(o.reminder)) : "",
  ].join("");
  return (
    (o.fees?.length ? feeLinesHtml(o) : "") +
    (rule ? `<div class="detail-lines accent-lines">${rule}</div>` : "")
  );
}
// Day title of the list: the date and the day of the week.
const dayTitle = (date) =>
  `${dateLabel(date)}, ${weekdayName(parseDate(date).getUTCDay(), "long")}`;
// A row of the "Select date" dialog; it is tinted while the rule is on.
const tile = (icon, title, value, fn) =>
  buttonHtml(
    `${iconSvg(icon, 28)}<span class="grow"><small>${translate(title)}</small><span>${value ? escapeHtml(value) : translate("Turned off")}</span></span>`,
    fn,
    "schedule-tile " + (value ? "on" : ""),
  );
// "Wednesday, November 18": the date with its day of the week.
const dateTitle = (date) =>
  `${weekdayName(parseDate(date).getUTCDay(), "long")}, ${dateLabel(date, true)}`;
// Create a scheduled payment: date, then repeat and reminder tiles, then the usual chooser.
function scheduledCreate() {
  const setup = { date: TODAY, time: timeNow(), recur: null, reminder: null };
  const tiles = () =>
    openSheet(
      () =>
        `<h2>${translate("Select date")}</h2><div class="schedule-tiles">${buttonHtml(
          `${iconSvg("calendar", 36)}<span>${escapeHtml(dateTitle(setup.date))}</span>`,
          () =>
            calendar(setup.date, (v) => {
              setup.date = v;
              render();
            }),
          "schedule-tile schedule-date on",
        )}${tile("clock", "Time", timeLabel(setup.time), () =>
          timePicker(setup.time, (time) => {
            setup.time = time;
            render();
          }),
        )}${tile("repeat", "Recur", setup.recur && recurLabel(setup.recur) + remainingLabel(setup.recur), () => recurrence(setup))}${tile("bell", "Reminder", setup.reminder && reminderLabel(setup.reminder), () => reminder(setup))}</div><div class="dialog-actions">${buttonHtml(
          "Complete",
          () => {
            closeLayers();
            operationsAddMenu(
              {
                date: setup.date,
                time: setup.time,
                recur: setup.recur,
                reminder: setup.reminder,
              },
              true,
            );
          },
          "primary",
        )}</div>`,
      "Select date",
      "dialog",
    );
  calendar(setup.date, (v) => {
    setup.date = v;
    tiles();
  });
}
// Dialog with the order of the scheduled payments.
const sortDialog = () =>
  optionSheet(
    "Sort by date",
    [
      [false, "Ascending date", "", iconSvg("arrowDown", 24)],
      [true, "Descending date", "", iconSvg("arrowUp", 24)],
    ],
    !!uiState.scheduleDesc,
    (descending) => {
      uiState.scheduleDesc = descending;
      render();
    },
    "dialog",
  );
// Scheduled payments page.
export function scheduledView() {
  const sorted = [...appData.scheduled].sort((a, b) =>
      uiState.scheduleDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    ),
    dates = [...new Set(sorted.map((o) => o.date))];
  return (
    pageHeader(
      "Scheduled payments",
      iconButtonHtml(uiState.scheduleDesc ? "sortReverse" : "sort", "Sort by date", sortDialog),
    ) +
    `<div class="content">${
      dates.length
        ? dates
            .map(
              (date) =>
                `<p class="scheduled-date">${escapeHtml(dayTitle(date))}</p>${sorted
                  .filter((o) => o.date === date)
                  .map(
                    (o) =>
                      `<div class="scheduled-item">${opRow(o, true)}${scheduleDetails(o)}</div>`,
                  )
                  .join("")}`,
            )
            .join("")
        : `<div class="more-empty">${iconSvg("calendar", 75)}<h2>Scheduled payments will be here</h2><p class="muted">Create your first scheduled payment</p>${buttonHtml("Create", scheduledCreate, "primary")}</div>`
    }</div>${dates.length ? fabHtml("Add", scheduledCreate, "no-nav") : ""}`
  );
}
