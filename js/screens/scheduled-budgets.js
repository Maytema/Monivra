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
  periodTitle,
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
  meterHtml,
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
// Calendar icon with the number of days of a budget period.
const periodIcon = (period) =>
  `<span class="period-icon">${iconSvg("calendarBlank", 30)}<b>${PERIOD_DAYS[period]}</b></span>`;
// Names of the budget periods.
const BUDGET_PERIODS = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
// A budget with what is spent of it in the period shown by the period bar.
const budgetState = (b) => {
  const used = budgetSpend(b);
  return { b, used, left: b.amount - used, share: b.amount ? (used / b.amount) * 100 : 0 };
};
const budgetCard = ({ b, used, left, share }) => {
  const scope = b.categories
    ? `<span class="budget-categories">${b.categories.map((id) => badgeHtml(categoryById(id), true)).join("")}</span>`
    : `<span class="budget-scope">${translate("Categories")}: ${translate("Entire expenses")}</span>`;
  return buttonHtml(
    `<strong class="budget-title">${escapeHtml(b.name)}</strong>${scope}<span class="budget-sum">${formatMoney(used, b.currency)} / ${formatMoney(b.amount, b.currency)}</span>${meterHtml(share, left < 0)}<span class="budget-left ${left < 0 ? "neg" : ""}">${formatMoney(left, b.currency)}</span>`,
    () => editBudget(b),
    "card budget-card",
  );
};
// Budgets of one period under a heading that adds them up in the main currency.
const budgetGroup = (period, states) => {
  const main = appData.settings.currency;
  const sum = (pick) =>
    states.reduce((total, st) => total + convertCurrency(pick(st), st.b.currency, main), 0);
  const left = sum((st) => st.left);
  return `<section class="budget-group"><div class="budget-group-head"><span class="budget-group-name">${periodIcon(period)}<span class="grow"><strong>${translate(BUDGET_PERIODS[period])}</strong><small>${periodTitle({ mode: period, anchor: uiState.period.anchor || TODAY })}</small></span></span><span class="budget-group-sum"><small>${formatMoney(
    sum((st) => st.used),
    main,
  )} / ${formatMoney(
    sum((st) => st.b.amount),
    main,
  )}</small><strong class="budget-left ${left < 0 ? "neg" : ""}">${formatMoney(left, main)}</strong></span></div>${states.map(budgetCard).join("")}</section>`;
};
// Budgets list page: budgets grouped by period.
export function budgetsView() {
  const states = appData.budgets.map(budgetState);
  return (
    pageHeader("Budgets") +
    periodBar() +
    `<div class="content">${
      states.length
        ? Object.keys(BUDGET_PERIODS)
            .map((period) => ({ period, list: states.filter((st) => st.b.period === period) }))
            .filter(({ list }) => list.length)
            .map(({ period, list }) => budgetGroup(period, list))
            .join("")
        : `<div class="more-empty">${iconSvg("budget", 75)}<h2>Budgets will be here</h2><p class="muted">So far, it's empty. Create your first budget?</p>${buttonHtml("Create a budget", () => editBudget(), "primary")}</div>`
    }</div>${states.length ? fabHtml("Add", () => editBudget(), "no-nav") : ""}`
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
      `<span class="period-value">${periodIcon(b.period)}${translate(BUDGET_PERIODS[b.period])}</span>`,
      () =>
        optionSheet(
          "Choose period",
          Object.keys(BUDGET_PERIODS).map((id) => [id, BUDGET_PERIODS[id], "", periodIcon(id)]),
          b.period,
          (v) => {
            b.period = v;
            render();
          },
          "dialog",
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
