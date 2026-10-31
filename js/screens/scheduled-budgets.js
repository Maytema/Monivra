/* Recurrence, reminders, scheduled payments and budgets */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import {
  categoryById,
  convertCurrency,
  dateLabel,
  formatMoney,
  parseDate,
  periodBounds,
  reportRows,
} from "../domain/finance.js";
import { currencyName, translate } from "../i18n/index.js";
import { categorySelect } from "./category-select.js";
import { feeLinesHtml } from "./fees.js";
import { opRow, operationsAddMenu, recurLabel, remainingLabel, weekdayName } from "./operations.js";
import { recurrence, reminder, reminderLabel } from "./recurrence.js";
import {
  amountPicker,
  calendar,
  closeLayers,
  confirmAction,
  finishFlow,
  openPage,
  openSheet,
  optionSheet,
  pageHeader,
  periodBar,
} from "../ui/kit.js";
import { currencyPicker } from "../ui/currency-picker.js";
import {
  buttonHtml,
  badgeHtml,
  fabHtml,
  fieldButtonHtml,
  iconButtonHtml,
  textFieldHtml,
  toast,
} from "../ui/primitives.js";

// What goes under a scheduled row: fees with the net amount, the repeat rule and the reminder.
function scheduleDetails(o) {
  const line = (icon, text) =>
    `<div class="detail-line">${icon}<span>${escapeHtml(text)}</span></div>`;
  const rule = [
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
  const setup = { date: TODAY, recur: null, reminder: null };
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
        )}${tile("repeat", "Recur", setup.recur && recurLabel(setup.recur) + remainingLabel(setup.recur), () => recurrence(setup))}${tile("bell", "Reminder", setup.reminder && reminderLabel(setup.reminder), () => reminder(setup))}</div><div class="dialog-actions">${buttonHtml(
          "Complete",
          () => {
            closeLayers();
            operationsAddMenu(
              {
                date: setup.date,
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
function sortDialog() {
  const row = (descending, icon, label) =>
    buttonHtml(
      `<input type="radio" tabindex="-1" ${!!uiState.scheduleDesc === descending ? "checked" : ""} aria-label="${translate(label)}">${iconSvg(icon, 24)}<span class="grow">${translate(label)}</span>`,
      () => {
        uiState.scheduleDesc = descending;
        closeLayers();
      },
      "row",
    );
  openSheet(
    () =>
      `<h2>${translate("Sort by date")}</h2>${row(false, "arrowDown", "Ascending date")}${row(true, "arrowUp", "Descending date")}<div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}</div>`,
    "Sort by date",
    "dialog",
  );
}
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

// Amount spent in a budget's period.
export function budgetSpend(b) {
  let period = {
    mode: b.period || "month",
    anchor: uiState.period.anchor || TODAY,
  };
  const [from, to] = periodBounds(period);
  // The same rows the statistics count: fees taken into account, debt payments included when
  // they count as expenses (only a budget for all expenses takes those).
  return reportRows(appData.ops.filter((o) => o.date >= from && o.date <= to))
    .filter(
      (o) =>
        o.reportType === "expense" &&
        (!b.categories ||
          b.categories.includes(o.category) ||
          b.categories.includes(categoryById(o.category)?.parent)),
    )
    .reduce(
      (s, o) => s + convertCurrency(o.reportAmount, appData.settings.currency, b.currency),
      0,
    );
}
// Days a budget period lasts, as the calendar icon of the period says.
const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
// Names of the budget periods.
const BUDGET_PERIODS = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
// Budgets list page.
export function budgetsView() {
  return (
    pageHeader("Budgets") +
    periodBar() +
    `<div class="content">${
      appData.budgets.length
        ? appData.budgets
            .map((b) => {
              const used = budgetSpend(b),
                share = b.amount ? Math.min(100, (used / b.amount) * 100) : 0,
                left = b.amount - used;
              const scope = b.categories
                ? `<span class="budget-categories">${b.categories.map((id) => badgeHtml(categoryById(id), true)).join("")}</span>`
                : `<span class="budget-scope">${translate("Categories")}: ${translate("Entire expenses")}</span>`;
              return buttonHtml(
                `<strong class="budget-title">${escapeHtml(b.name)}</strong>${scope}<span class="budget-sum">${formatMoney(used, b.currency)} / ${formatMoney(b.amount, b.currency)}</span><span class="bar-track"><span style="width:${share}%"></span></span><span class="budget-foot"><span class="muted">${translate(BUDGET_PERIODS[b.period])}</span><span class="budget-left ${left < 0 ? "neg" : ""}">${formatMoney(left, b.currency)}</span></span>`,
                () => editBudget(b),
                "card budget-card",
              );
            })
            .join("")
        : `<div class="more-empty">${iconSvg("budget", 75)}<h2>Budgets will be here</h2><p class="muted">So far, it's empty. Create your first budget?</p>${buttonHtml("Create a budget", () => editBudget(), "primary")}</div>`
    }</div>${appData.budgets.length ? fabHtml("Add", () => editBudget(), "no-nav") : ""}`
  );
}

// Open the budget editor (new budget when no argument is given).
export function editBudget(b) {
  openPage("budget", {
    draft: b
      ? deepClone(b)
      : {
          id: null,
          name: "",
          currency: appData.settings.currency,
          amount: 0,
          period: "month",
          categories: null,
        },
  });
}
// Budget editor form.
export function budgetView(p) {
  const b = p.draft;
  return (
    pageHeader(b.id ? "Edit budget" : "Create a budget") +
    `<div class="content"><div class="fields">${textFieldHtml("Title", b.name, (v) => (b.name = v), "Enter the title")}${fieldButtonHtml(
      "Time period",
      `<span class="period-value"><span class="period-icon">${iconSvg("calendarBlank", 30)}<b>${PERIOD_DAYS[b.period]}</b></span>${translate(BUDGET_PERIODS[b.period])}</span>`,
      () =>
        optionSheet(
          "Time period",
          [
            ["day", "Daily"],
            ["week", "Weekly"],
            ["month", "Monthly"],
            ["year", "Yearly"],
          ],
          b.period,
          (v) => {
            b.period = v;
            render();
          },
        ),
    )}${fieldButtonHtml(
      "Categories",
      b.categories
        ? b.categories.map((id) => escapeHtml(categoryById(id)?.name || "")).join(", ")
        : translate("All categories"),
      () =>
        categorySelect(b.categories, (v) => {
          b.categories = v;
          render();
        }),
      b.categories ? "(Entirely)" : "(Entire expenses)",
    )}${fieldButtonHtml("Budget currency", escapeHtml(currencyName(b.currency)), () =>
      currencyPicker(b.currency, (v) => {
        b.currency = v;
        render();
      }),
    )}${buttonHtml(
      `<span class="field-label">${translate("Budget")}</span><span class="value">${formatMoney(b.amount, b.currency)}</span>`,
      () =>
        amountPicker(
          "Budget",
          b.amount,
          (v) => {
            b.amount = v;
            render();
          },
          false,
          b.currency,
        ),
      "field inline",
    )}</div>${buttonHtml(
      b.id ? "Save" : "Create",
      () => {
        if (!b.name.trim()) return toast("Enter a name");
        if (b.amount <= 0) return toast("Enter an amount greater than zero");
        if (b.categories?.length === 0) return toast("Select at least one category");
        if (b.id)
          Object.assign(
            appData.budgets.find((x) => x.id === b.id),
            b,
          );
        else appData.budgets.push({ ...b, id: newId() });
        finishFlow("Budget saved");
      },
      "primary",
    )}${
      b.id
        ? buttonHtml(
            "Delete",
            () =>
              confirmAction(
                "Delete this budget?",
                () => {
                  appData.budgets = appData.budgets.filter((x) => x.id !== b.id);
                  finishFlow("Budget deleted");
                },
                true,
                "Delete",
              ),
            "outline",
          )
        : ""
    }</div>`
  );
}
