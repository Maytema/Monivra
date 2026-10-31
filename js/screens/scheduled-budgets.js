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
import { translate } from "../i18n/index.js";
import { feeLinesHtml } from "./fees.js";
import {
  multiSelect,
  opRow,
  operationsAddMenu,
  recurLabel,
  remainingLabel,
  weekdayName,
} from "./operations.js";
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
  menuRowHtml,
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
// Create a scheduled payment: date, then repeat and reminder tiles, then the usual chooser.
function scheduledCreate() {
  const setup = { date: TODAY, recur: null, reminder: null };
  const tiles = () =>
    openSheet(
      () =>
        `<h2>${translate("Select date")}</h2>${menuRowHtml(
          "Date",
          "calendar",
          () =>
            calendar(setup.date, (v) => {
              setup.date = v;
              render();
            }),
          dateLabel(setup.date),
        )}${menuRowHtml("Recur", "repeat", () => recurrence(setup), setup.recur ? recurLabel(setup.recur) + remainingLabel(setup.recur) : "Turned off")}${menuRowHtml("Reminder", "bell", () => reminder(setup), setup.reminder ? reminderLabel(setup.reminder) : "Turned off")}<div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
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
// Scheduled payments page.
export function scheduledView() {
  const sorted = [...appData.scheduled].sort((a, b) =>
      uiState.scheduleDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    ),
    dates = [...new Set(sorted.map((o) => o.date))];
  return (
    pageHeader(
      "Scheduled payments",
      iconButtonHtml(
        uiState.scheduleDesc ? "sortReverse" : "sort",
        uiState.scheduleDesc ? "Latest payments first" : "Nearest payments first",
        () => {
          uiState.scheduleDesc = !uiState.scheduleDesc;
          render();
          toast(uiState.scheduleDesc ? "Latest payments first" : "Nearest payments first");
        },
      ),
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
    `<div class="content"><div class="fields">${!b.id ? textFieldHtml("Title", b.name, (v) => (b.name = v), "Enter a name") : ""}${fieldButtonHtml(
      "Time period",
      translate(BUDGET_PERIODS[b.period]),
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
        : translate("Entire expenses"),
      () =>
        multiSelect(
          "Categories",
          appData.categories.filter((c) => c.type === "expense"),
          b.categories,
          (v) => {
            b.categories = v;
            render();
          },
        ),
    )}${fieldButtonHtml("Budget currency", escapeHtml(b.currency), () =>
      currencyPicker(b.currency, (v) => {
        b.currency = v;
        render();
      }),
    )}${fieldButtonHtml("Budget amount", formatMoney(b.amount, b.currency), () =>
      amountPicker(
        "Budget amount",
        b.amount,
        (v) => {
          b.amount = v;
          render();
        },
        false,
        b.currency,
      ),
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
