/* Recurrence, reminders, scheduled payments and budgets */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import {
  categoryById,
  convertCurrency,
  dateLabel,
  formatMoney,
  periodBounds,
  reportRows,
} from "../domain/finance.js";
import { translate, translateCount } from "../i18n/index.js";
import { multiSelect, opRow, operationsAddMenu, recurLabel, remainingLabel } from "./operations.js";
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
  fieldButtonHtml,
  iconButtonHtml,
  menuRowHtml,
  textFieldHtml,
  toast,
} from "../ui/primitives.js";

// Caption under a scheduled row: the repeat rule (or the plain date) and the reminder.
const scheduleCaption = (o) =>
  `<div class="recur-caption">${iconSvg(o.recur ? "repeat" : "calendar", 14)} ${escapeHtml(recurLabel(o.recur) + (o.recur ? remainingLabel(o.recur) : ""))}${o.reminder ? ` · ${iconSvg("bell", 14)} ${escapeHtml(reminderLabel(o.reminder))}` : ""}</div>`;
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
                `<p class="scheduled-date">${escapeHtml(dateLabel(date))}</p>${sorted
                  .filter((o) => o.date === date)
                  .map((o) => opRow(o, true) + scheduleCaption(o))
                  .join("")}`,
            )
            .join("")
        : `<div class="more-empty">${iconSvg("calendar", 75)}<h2>Scheduled payments will be here</h2><p class="muted">Create your first scheduled payment</p>${buttonHtml("Create", scheduledCreate, "primary")}</div>`
    }</div>${dates.length ? buttonHtml(iconSvg("plus", 26), scheduledCreate, "fab no-nav", `aria-label="Add scheduled payment"`) : ""}`
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
// Budgets list page.
export function budgetsView() {
  return (
    pageHeader(
      "Budgets",
      iconButtonHtml("plus", "Create a budget", () => editBudget()),
    ) +
    periodBar() +
    `<div class="content">${
      appData.budgets.length
        ? appData.budgets
            .map((b) => {
              let used = budgetSpend(b),
                pct = b.amount ? (used / b.amount) * 100 : 0;
              return buttonHtml(
                `<div style="display:flex;align-items:center;gap:12px"><span class="badge small">${iconSvg("budget")}</span><div class="grow"><strong>${escapeHtml(b.name)}</strong><div class="muted" style="font-size:12px;margin-top:5px">${b.categories ? translateCount("{n} category", "{n} categories", b.categories.length) : translate("Entire expenses")}</div></div>${iconSvg("right", 18)}</div><div class="stats-halves" style="margin-top:19px"><span>${formatMoney(used, b.currency)} <small>spent</small></span><span>${formatMoney(b.amount, b.currency)} <small>limit</small></span></div><div class="bar-track"><span style="width:${Math.min(100, pct)}%;background:${pct > 100 ? "var(--negative)" : "var(--accent)"}"></span></div><small>${Math.round(pct)}% · ${translate(b.period === "week" ? "Weekly" : b.period === "day" ? "Daily" : b.period === "year" ? "Yearly" : "Monthly")}</small>`,
                () => editBudget(b),
                "card budget-card",
              );
            })
            .join("")
        : `<div class="more-empty">${iconSvg("budget", 75)}<h2>Budgets will be here</h2><p class="muted">So far, it's empty. Create your first budget?</p>${buttonHtml("Create a budget", () => editBudget(), "primary")}</div>`
    }</div>${appData.budgets.length ? buttonHtml(iconSvg("plus", 26), () => editBudget(), "fab no-nav", `aria-label="Create a budget"`) : ""}`
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
      translate({ day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[b.period]),
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
