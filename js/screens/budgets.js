/* Budgets: list, details of one budget and the editor */
import { render } from "../app/shell.js";
import { deepClone, escapeHtml, iconSvg, newId, TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { categoryById, convertCurrency, formatMoney, periodTitle } from "../domain/finance.js";
import { budgetOperations, budgetState } from "../domain/budgets.js";
import { emptyStateHtml } from "../ui/empty-state.js";
import { dayGroup } from "./operations/list.js";
import { currencyName, translate } from "../i18n/index.js";
import { exactPercent, percentLabel } from "./accounts/progress.js";
import { categorySelect } from "./category-select.js";
import { amountPicker } from "../ui/number-picker.js";
import { finishFlow, openPage } from "../ui/navigation.js";
import { confirmAction, optionSheet } from "../ui/dialogs.js";
import {
  badgeHtml,
  buttonHtml,
  fabHtml,
  fieldButtonHtml,
  iconButtonHtml,
  meterHtml,
  pageHeader,
  swipePane,
  textFieldHtml,
  toast,
} from "../ui/primitives.js";
import { periodBar } from "../ui/period-picker.js";
import { currencyPicker } from "../ui/currency-picker.js";

// Days a budget period lasts, as the calendar icon of the period says.
const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
// Calendar icon with the number of days of a budget period.
const periodIcon = (period) =>
  `<span class="period-icon">${iconSvg("calendarBlank", 30)}<b>${PERIOD_DAYS[period]}</b></span>`;
// Names of the budget periods.
const BUDGET_PERIODS = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
// What a budget shows: title, what it counts, spent of the limit with the share, and what is left.
const budgetBody = ({ b, used, left, share }, percent) => {
  const scope = b.categories
    ? `<span class="budget-categories">${b.categories.map((id) => badgeHtml(categoryById(id), true)).join("")}</span>`
    : `<span class="budget-scope">${translate("Categories")}: ${translate("Entire expenses")}</span>`;
  return `<strong class="budget-title">${escapeHtml(b.name)}</strong>${scope}<span class="budget-sum">${formatMoney(used, b.currency)} / ${formatMoney(b.amount, b.currency)}</span><span class="budget-progress">${meterHtml(share, left < 0)}<span class="budget-percent">${percent(share)}</span></span><span class="budget-left ${left < 0 ? "neg" : ""}">${formatMoney(left, b.currency)}</span>`;
};
const budgetCard = (state) =>
  buttonHtml(
    budgetBody(state, percentLabel),
    () => openPage("budgetDetails", { id: state.b.id }),
    "card budget-card",
  );
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
    swipePane(
      periodBar() +
        `<div class="content">${
          states.length
            ? Object.keys(BUDGET_PERIODS)
                .map((period) => ({ period, list: states.filter((st) => st.b.period === period) }))
                .filter(({ list }) => list.length)
                .map(({ period, list }) => budgetGroup(period, list))
                .join("")
            : `<div class="more-empty">${iconSvg("budget", 75)}<h2>Budgets will be here</h2><p class="muted">So far, it's empty. Create your first budget?</p>${buttonHtml("Create a budget", () => editBudget(), "primary")}</div>`
        }</div>`,
    ) +
    (states.length ? fabHtml("Add", () => editBudget()) : "")
  );
}

// Open the budget editor (new budget when no argument is given).
function editBudget(b) {
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
// A budget on a page of its own: what is spent of it and the operations it counts in the period
// of the period bar, so the figures can be checked and other months looked at.
export function budgetDetailsView(p) {
  const b = appData.budgets.find((x) => x.id === p.id);
  const ops = budgetOperations(b);
  const dates = [...new Set(ops.map((o) => o.date))];
  return (
    pageHeader(
      "Budget",
      iconButtonHtml("edit", "Edit budget", () => editBudget(b)),
    ) +
    swipePane(
      periodBar() +
        `<div class="content"><div class="card budget-card">${budgetBody(budgetState(b), (share) => escapeHtml(exactPercent(share)))}</div>${
          ops.length
            ? dates.map((date) => dayGroup(date, ops)).join("")
            : emptyStateHtml("operations", "Empty", "No expenses of this budget in the period")
        }</div>`,
    )
  );
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
                  // The page of the deleted budget goes too.
                  if (uiState.pages.at(-2)?.kind === "budgetDetails") uiState.pages.splice(-2, 1);
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
