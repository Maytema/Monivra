/* Dialogs of a scheduled payment: how it repeats and when it reminds */
import { render } from "../app/shell.js";
import { deepClone, MAX_INTERVAL } from "../core/constants.js";
import { translateCount, translateWith } from "../i18n/index.js";
import { closeLayers, numberPicker, openSheet, optionSheet, timePicker } from "../ui/kit.js";
import { buttonHtml, dropdownHtml, fieldButtonHtml, stepperHtml, toast } from "../ui/primitives.js";
import { weekdayName } from "./operations.js";

const UNITS = ["Days", "Weeks", "Months", "Years"];
// Digits that fit into a number of a schedule.
const DIGITS = { maxLength: 4 };
// A count kept within the limits the saved data allows.
const within = (n, min) => Math.min(MAX_INTERVAL, Math.max(min, n));

// "5 days", "1 week": a count of one of the units.
const interval = (n, unit) =>
  ({
    Days: translateCount("{n} day", "{n} days", n),
    Weeks: translateCount("{n} week", "{n} weeks", n),
    Months: translateCount("{n} month", "{n} months", n),
    Years: translateCount("{n} year", "{n} years", n),
  })[unit];
// Text under the reminder row: "2 weeks before at 20:00".
export const reminderLabel = (r) =>
  translateWith("{interval} before at {time}", {
    interval: interval(r.before, r.unit),
    time: r.time,
  });

// Choice of the unit of time; `weekdays` tells that weeks can be narrowed to days of the week.
function unitDialog(unit, fn, weekdays = false) {
  optionSheet(
    "Choose time period",
    UNITS.map((u) => [u, u, weekdays && u === "Weeks" ? "Additionally - by days of the week" : ""]),
    unit,
    fn,
    "dialog",
  );
}
// Buttons at the bottom of a schedule dialog; `off` clears the setting.
const actionsHtml = (off, ok) =>
  `<div class="dialog-actions">${buttonHtml("Turn off", off, "outline")}</div><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml("OK", ok, "primary")}</div>`;

// How a payment repeats: every N days, weeks, months or years, a number of times or forever.
export function recurrence(d) {
  const r = deepClone(d.recur || { every: 1, unit: "Days", remaining: null, days: [] });
  const weekdays = () =>
    r.unit === "Weeks"
      ? `<div class="field-title">Days of the week</div><div class="schedule-week">${[
          0, 1, 2, 3, 4, 5, 6,
        ]
          .map((day) =>
            buttonHtml(
              weekdayName(day).slice(0, 1).toUpperCase(),
              () => {
                r.days = r.days.includes(day) ? r.days.filter((n) => n !== day) : [...r.days, day];
                render();
              },
              "schedule-weekday " + (r.days.includes(day) ? "chosen" : ""),
              `aria-label="${weekdayName(day, "long")}"`,
            ),
          )
          .join("")}</div>`
      : "";
  openSheet(
    () =>
      `<div class="schedule-modal"><h2>Recur</h2>${stepperHtml(
        "Repeat every",
        r.every,
        (k) => {
          r.every = within(r.every + k, 1);
          render();
        },
        () =>
          numberPicker(
            "Repeat every",
            r.every,
            (v) => {
              r.every = within(Number(v) || 1, 1);
            },
            DIGITS,
          ),
      )}${dropdownHtml(r.unit, () =>
        unitDialog(
          r.unit,
          (unit) => {
            r.unit = unit;
            render();
          },
          true,
        ),
      )}${weekdays()}${stepperHtml(
        "Number of repetitions",
        r.remaining ?? "∞",
        (k) => {
          r.remaining = r.remaining === null ? (k > 0 ? 1 : null) : r.remaining + k || null;
          render();
        },
        () =>
          numberPicker(
            "Number of repetitions",
            r.remaining ?? "",
            (v) => {
              r.remaining = Number(v) >= 1 ? Number(v) : null;
            },
            DIGITS,
          ),
      )}${actionsHtml(
        () => {
          d.recur = null;
          closeLayers();
        },
        () => {
          if (r.unit === "Weeks" && r.days.length === 0)
            return toast("Choose at least one weekday");
          d.recur = r;
          closeLayers();
        },
      )}</div>`,
    "Recur",
    "dialog",
  );
}

// Dialog that explains why the entered value is not accepted.
function errorDialog(title, lines) {
  openSheet(
    () =>
      `<h2>${title}</h2>${lines.map((line) => `<p>${line}</p>`).join("")}<div class="dialog-actions">${buttonHtml("OK", () => closeLayers(), "text-button")}</div>`,
    title,
    "dialog",
  );
}

// When a payment reminds: some days, weeks, months or years before it, at a time of day.
export function reminder(d) {
  const r = deepClone(d.reminder || { before: 0, unit: "Days", time: "09:00" });
  openSheet(
    () =>
      `<div class="schedule-modal"><h2>Reminder</h2>${stepperHtml(
        "Before",
        r.before,
        (k) => {
          r.before = within(r.before + k, 0);
          render();
        },
        () =>
          numberPicker(
            "Before",
            r.before,
            (v) => {
              r.before = within(Number(v) || 0, 0);
            },
            DIGITS,
          ),
      )}${dropdownHtml(r.unit, () =>
        unitDialog(r.unit, (unit) => {
          r.unit = unit;
          render();
        }),
      )}${fieldButtonHtml("At", r.time, () =>
        timePicker(r.time, (time) => {
          r.time = time;
          render();
        }),
      )}${actionsHtml(
        () => {
          d.reminder = null;
          closeLayers();
        },
        () => {
          if (r.before === 0 && r.unit !== "Days")
            return errorDialog("Error: Wrong date", [
              "The value 0 can only be used for days, not for months, weeks, or years!",
              "The value 0 days means the reminder will be set on the same day as the scheduled payment.",
            ]);
          d.reminder = r;
          closeLayers();
        },
      )}</div>`,
    "Reminder",
    "dialog",
  );
}
