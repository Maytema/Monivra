/* Recurrence, reminders, scheduled payments and budgets */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import {
  accountById,
  categoryById,
  convertCurrency,
  dateLabel,
  formatMoney,
  periodBounds,
} from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { operationStart } from "./operation-editor.js";
import { multiSelect, opRow, recurLabel } from "./operations.js";
import {
  amountPicker,
  closeLayers,
  confirmAction,
  currencyPicker,
  finishFlow,
  openPage,
  openSheet,
  optionSheet,
  pageHeader,
  periodBar,
} from "../ui/kit.js";
import {
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  textFieldHtml,
  toast,
  toggleRowHtml,
} from "../ui/primitives.js";

// Recurrence picker (every N days/weeks/months/years).
export function recurrence(d) {
  let r = deepClone(d.recur || { every: 1, unit: "Days", remaining: null, days: [] }),
    limited = r.remaining !== null;
  const units = ["Days", "Weeks", "Months", "Years"];
  openSheet(
    () =>
      `<div class="schedule-modal"><h2>Repeat</h2><div class="schedule-unit">${units
        .map((unit) =>
          buttonHtml(
            unit,
            () => {
              r.unit = unit;
              render();
            },
            "schedule-unit-btn " + (r.unit === unit ? "chosen" : ""),
          ),
        )
        .join(
          "",
        )}</div>${textFieldHtml("Repeat every", r.every, (v) => (r.every = Number(v)), "", "number")}${
        r.unit === "Weeks"
          ? `<div class="schedule-subtitle">Days of the week</div><div class="schedule-week">${[
              "S",
              "M",
              "T",
              "W",
              "T",
              "F",
              "S",
            ]
              .map((name, i) =>
                buttonHtml(
                  name,
                  () => {
                    r.days = r.days.includes(i) ? r.days.filter((n) => n !== i) : [...r.days, i];
                    render();
                  },
                  "schedule-weekday " + (r.days.includes(i) ? "chosen" : ""),
                  `aria-label="${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}"`,
                ),
              )
              .join("")}</div>`
          : ""
      }<div class="schedule-subtitle">Number of repetitions</div><div class="schedule-choices">${buttonHtml(
        "Unlimited",
        () => {
          limited = false;
          r.remaining = null;
          render();
        },
        "schedule-choice " + (!limited ? "chosen" : ""),
      )}${buttonHtml(
        "Limited",
        () => {
          limited = true;
          r.remaining = r.remaining || 2;
          render();
        },
        "schedule-choice " + (limited ? "chosen" : ""),
      )}</div>${limited ? textFieldHtml("Repetitions", r.remaining, (v) => (r.remaining = Number(v)), "", "number") : ""}<div class="schedule-modal-actions">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
        "Save",
        () => {
          if (!Number.isInteger(r.every) || r.every < 1 || r.every > 365)
            return toast("Repeat interval must be 1–365");
          if (limited && (!Number.isInteger(r.remaining) || r.remaining < 1))
            return toast("Enter a positive repetition count");
          if (r.unit === "Weeks" && r.days.length === 0)
            return toast("Choose at least one weekday");
          r.remaining = limited ? r.remaining : null;
          d.recur = r;
          closeLayers();
        },
        "primary",
      )}</div>${
        d.recur
          ? buttonHtml(
              "Turn off repeating",
              () => {
                d.recur = null;
                closeLayers();
              },
              "text-button schedule-disable",
            )
          : ""
      }</div>`,
    "Repeat",
    "dialog",
  );
}
// Reminder time picker for scheduled payments.
export function reminder(d) {
  let raw = d.reminder || "09:00",
    clock = /^\d{2}:\d{2}$/.test(raw) ? raw : "09:00",
    lead = d.reminderLead || "At the time",
    enabled = !!d.reminder;
  const leads = [
    "At the time",
    "5 minutes before",
    "15 minutes before",
    "30 minutes before",
    "1 hour before",
    "1 day before",
  ];
  openSheet(
    () =>
      `<div class="schedule-modal"><h2>Reminder</h2>${toggleRowHtml("Remind me", enabled, () => {
        enabled = !enabled;
        render();
      })}${
        enabled
          ? `<div class="schedule-subtitle">When to remind</div><div class="schedule-leads">${leads
              .map((x) =>
                buttonHtml(
                  x,
                  () => {
                    lead = x;
                    render();
                  },
                  "schedule-lead " + (lead === x ? "chosen" : ""),
                ),
              )
              .join("")}</div>${textFieldHtml("Time", clock, (v) => (clock = v), "", "time")}`
          : ""
      }<p class="footnote">Notifications are stored locally. Browser background reminders are not available in this offline preview.</p><div class="schedule-modal-actions">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
        "Save",
        () => {
          if (enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))
            return toast("Enter a valid time");
          d.reminder = enabled ? clock : null;
          d.reminderLead = enabled ? lead : null;
          closeLayers();
        },
        "primary",
      )}</div></div>`,
    "Reminder",
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
      iconButtonHtml("sort", "Sort scheduled payments", () => {
        uiState.scheduleDesc = !uiState.scheduleDesc;
        render();
      }),
    ) +
    `<div class="content">${
      dates.length
        ? dates
            .map(
              (date) =>
                `<p class="scheduled-date">${escapeHtml(dateLabel(date))}</p>${sorted
                  .filter((o) => o.date === date)
                  .map(
                    (o) =>
                      opRow(o, true) +
                      `<div class="recur-caption">${o.recur ? iconSvg("repeat", 14) : iconSvg("calendar", 14)} ${escapeHtml(recurLabel(o.recur))}</div>`,
                  )
                  .join("")}`,
            )
            .join("")
        : `<div class="more-empty">${iconSvg("calendar", 75)}<h2>Scheduled payments will be here</h2><p class="muted">Create your first scheduled payment</p>${buttonHtml("Create", () => operationStart({}, true), "primary")}</div>`
    }</div>${dates.length ? buttonHtml(iconSvg("plus", 26), () => operationStart({}, true), "fab no-nav", `aria-label="Add scheduled payment"`) : ""}`
  );
}

// Amount spent in a budget's period.
export function budgetSpend(b) {
  let period = {
    mode: b.period || "month",
    anchor: uiState.period.anchor || TODAY,
  };
  const [from, to] = periodBounds(period);
  return appData.ops
    .filter(
      (o) =>
        o.type === "expense" &&
        o.date >= from &&
        o.date <= to &&
        (!b.categories ||
          b.categories.includes(o.category) ||
          b.categories.includes(categoryById(o.category)?.parent)),
    )
    .reduce((s, o) => s + convertCurrency(o.amount, accountById(o.from)?.currency, b.currency), 0);
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
                `<div style="display:flex;align-items:center;gap:12px"><span class="badge small">${iconSvg("budget")}</span><div class="grow"><strong>${escapeHtml(b.name)}</strong><div class="muted" style="font-size:12px;margin-top:5px">${b.categories ? b.categories.length + " categories" : "Entire expenses"}</div></div>${iconSvg("right", 18)}</div><div class="stats-halves" style="margin-top:19px"><span>${formatMoney(used, b.currency)} <small>spent</small></span><span>${formatMoney(b.amount, b.currency)} <small>limit</small></span></div><div class="bar-track"><span style="width:${Math.min(100, pct)}%;background:${pct > 100 ? "var(--negative)" : "var(--accent)"}"></span></div><small>${Math.round(pct)}% · ${translate(b.period === "week" ? "Weekly" : b.period === "day" ? "Daily" : b.period === "year" ? "Yearly" : "Monthly")}</small>`,
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
      amountPicker("Budget amount", b.amount, (v) => {
        b.amount = v;
        render();
      }),
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
