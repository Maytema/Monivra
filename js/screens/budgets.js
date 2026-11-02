/* Budgets: list, details of one budget and the editor */
import { render } from "../app/shell.js";
import { deepClone, escapeHtml, iconSvg, newId, TODAY } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { categoryById, convertCurrency, formatMoney, periodTitle } from "../domain/finance.js";
import { budgetOperations, budgetState } from "../domain/budgets.js";
import { emptyStateHtml } from "../ui/empty-state.js";
import { dayGroup } from "./operations/list.js";
import { currencyName, translate, translateWith } from "../i18n/index.js";
import { exactPercent, percentLabel } from "../ui/percent.js";
import { categorySelect } from "./category-select.js";
import { amountPicker } from "../ui/number-picker.js";
import { finishFlow, openPage } from "../ui/navigation.js";
import { confirmAction, optionSheet } from "../ui/dialogs.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  meterHtml,
  pageHeader,
  swipePane,
  textFieldHtml,
  toast,
} from "../ui/primitives.js";
import { monthPicker, periodBar } from "../ui/period-picker.js";
import { currencyPicker } from "../ui/currency-picker.js";

// Days a budget period lasts, as the calendar icon of the period says.
const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
// Calendar icon with the number of days of a budget period.
const periodIcon = (period) =>
  `<span class="period-icon">${iconSvg("calendarBlank", 30)}<b>${PERIOD_DAYS[period]}</b></span>`;
// Names of the budget periods.
const BUDGET_PERIODS = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
// What is left of a limit, or by how much it is passed, as a line under the figures.
const remainderHtml = (left, currency) => {
  const amount = formatMoney(Math.abs(left), currency);
  if (left < 0)
    return `<span class="budget-left neg">${translateWith("Over by {amount}", { amount })}</span>`;
  return `<span class="budget-left">${left === 0 ? translate("Limit reached") : translateWith("Left: {amount}", { amount })}</span>`;
};
// What a budget shows: title, what it counts, spent of the limit with the share spent, and what
// is left of the limit (or by how much it is passed).
const budgetBody = ({ b, used, left, share }, percent) => {
  const scope = b.categories
    ? `<span class="budget-categories">${b.categories.map((id) => badgeHtml(categoryById(id), true)).join("")}</span>`
    : `<span class="budget-scope">${translate("Categories")}: ${translate("Entire expenses")}</span>`;
  return `<strong class="budget-title">${escapeHtml(b.name)}</strong>${scope}<span class="budget-sum">${formatMoney(used, b.currency)} / ${formatMoney(b.amount, b.currency)}</span><span class="budget-progress">${meterHtml(share, left < 0)}<span class="budget-percent">${percent(share)}</span></span>${remainderHtml(left, b.currency)}`;
};
const budgetCard = (state) =>
  buttonHtml(
    budgetBody(state, percentLabel),
    () => editBudget(state.b),
    "card budget-card " + (state.left < 0 ? "over" : ""),
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
  )}</small>${remainderHtml(left, main)}</span></div>${states.map(budgetCard).join("")}</section>`;
};
// A budget is looked at one month at a time, each budget in its own period around the month's
// day. The page opens on a month (the shown one, or today after "All time" or a range), and the
// period shown before comes back when the page is left.
export function openBudgets() {
  const before = uiState.period;
  const shown = ["all", "range"].includes(before.mode) ? TODAY : before.anchor;
  uiState.period = { mode: "month", anchor: shown };
  openPage("budgets", { restore: () => (uiState.period = before) });
}
// Budgets list page: budgets grouped by period.
export function budgetsView() {
  const states = appData.budgets.map(budgetState);
  return (
    pageHeader(
      "Budgets",
      iconButtonHtml("plus", "Create a budget", () => editBudget()),
    ) +
    swipePane(
      periodBar(monthPicker) +
        `<div class="content">${
          states.length
            ? Object.keys(BUDGET_PERIODS)
                .map((period) => ({ period, list: states.filter((st) => st.b.period === period) }))
                .filter(({ list }) => list.length)
                .map(({ period, list }) => budgetGroup(period, list))
                .join("")
            : emptyStateHtml(
                "budgets",
                "Budgets will be here",
                "So far, it's empty. Create your first budget?",
                buttonHtml("Create a budget", () => editBudget(), "primary"),
              )
        }</div>`,
    )
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
// What a budget counts: its figures and the operations of the period of the period bar, so the
// figures can be checked and other months looked at. It is reached from the editor of the budget.
export function budgetDetailsView(p) {
  const b = appData.budgets.find((x) => x.id === p.id);
  const ops = budgetOperations(b);
  const dates = [...new Set(ops.map((o) => o.date))];
  return (
    pageHeader("Budget") +
    swipePane(
      periodBar(monthPicker) +
        // The figures stay in view while the operations under them scroll.
        `<div class="budget-pinned"><div class="card budget-card">${budgetBody(budgetState(b), (share) => escapeHtml(exactPercent(share)))}</div></div><div class="content">${
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
    pageHeader(
      b.id ? "Edit budget" : "Create a budget",
      b.id
        ? iconButtonHtml("receipt", "Operations of the budget", () =>
            openPage("budgetDetails", { id: b.id }),
          )
        : "",
    ) +
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
