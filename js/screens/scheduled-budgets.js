/* Recurrence, reminders, scheduled payments and budgets */
import { render } from "../app/shell.js";
import { I, TODAY, clone, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { acc, bounds, cat, convert, dateLabel, money } from "../domain/finance.js";
import { operationStart } from "./operation-editor.js";
import { multiSelect, opRow, recurLabel } from "./operations.js";
import {
  amountPicker,
  close,
  confirmAction,
  currencyPicker,
  finish,
  header,
  optionSheet,
  page,
  periodBar,
  sheet,
} from "../ui/kit.js";
import { B, IB, field, t, toast, toggle, txt } from "../ui/primitives.js";

export function recurrence(d) {
  let r = clone(d.recur || { every: 1, unit: "Days", remaining: null, days: [] }),
    limited = r.remaining !== null;
  const units = ["Days", "Weeks", "Months", "Years"];
  sheet(
    () =>
      `<div class="schedule-modal"><h2>Repeat</h2><div class="schedule-unit">${units
        .map((unit) =>
          B(
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
        )}</div>${txt("Repeat every", r.every, (v) => (r.every = Number(v)), "", "number")}${
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
                B(
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
      }<div class="schedule-subtitle">Number of repetitions</div><div class="schedule-choices">${B(
        "Unlimited",
        () => {
          limited = false;
          r.remaining = null;
          render();
        },
        "schedule-choice " + (!limited ? "chosen" : ""),
      )}${B(
        "Limited",
        () => {
          limited = true;
          r.remaining = r.remaining || 2;
          render();
        },
        "schedule-choice " + (limited ? "chosen" : ""),
      )}</div>${limited ? txt("Repetitions", r.remaining, (v) => (r.remaining = Number(v)), "", "number") : ""}<div class="schedule-modal-actions">${B("Cancel", () => close(), "outline")}${B(
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
          close();
        },
        "primary",
      )}</div>${
        d.recur
          ? B(
              "Turn off repeating",
              () => {
                d.recur = null;
                close();
              },
              "text-button schedule-disable",
            )
          : ""
      }</div>`,
    "Repeat",
    "dialog",
  );
}
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
  sheet(
    () =>
      `<div class="schedule-modal"><h2>Reminder</h2>${toggle("Remind me", enabled, () => {
        enabled = !enabled;
        render();
      })}${
        enabled
          ? `<div class="schedule-subtitle">When to remind</div><div class="schedule-leads">${leads
              .map((x) =>
                B(
                  x,
                  () => {
                    lead = x;
                    render();
                  },
                  "schedule-lead " + (lead === x ? "chosen" : ""),
                ),
              )
              .join("")}</div>${txt("Time", clock, (v) => (clock = v), "", "time")}`
          : ""
      }<p class="footnote">Notifications are stored locally. Browser background reminders are not available in this offline preview.</p><div class="schedule-modal-actions">${B("Cancel", () => close(), "outline")}${B(
        "Save",
        () => {
          if (enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))
            return toast("Enter a valid time");
          d.reminder = enabled ? clock : null;
          d.reminderLead = enabled ? lead : null;
          close();
        },
        "primary",
      )}</div></div>`,
    "Reminder",
    "dialog",
  );
}
export function scheduledView() {
  const sorted = [...D.scheduled].sort((a, b) =>
      U.scheduleDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    ),
    dates = [...new Set(sorted.map((o) => o.date))];
  return (
    header(
      "Scheduled payments",
      IB("sort", "Sort scheduled payments", () => {
        U.scheduleDesc = !U.scheduleDesc;
        render();
      }),
    ) +
    `<div class="content">${
      dates.length
        ? dates
            .map(
              (date) =>
                `<p class="scheduled-date">${esc(dateLabel(date))}</p>${sorted
                  .filter((o) => o.date === date)
                  .map(
                    (o) =>
                      opRow(o, true) +
                      `<div class="recur-caption">${o.recur ? I("repeat", 14) : I("calendar", 14)} ${esc(recurLabel(o.recur))}</div>`,
                  )
                  .join("")}`,
            )
            .join("")
        : `<div class="more-empty">${I("calendar", 75)}<h2>Scheduled payments will be here</h2><p class="muted">Create your first scheduled payment</p>${B("Create", () => operationStart({}, true), "primary")}</div>`
    }</div>${dates.length ? B(I("plus", 26), () => operationStart({}, true), "fab no-nav", `aria-label="Add scheduled payment"`) : ""}`
  );
}

export function budgetSpend(b) {
  let period = {
    mode: b.period || "month",
    anchor: U.period.anchor || TODAY,
  };
  const [from, to] = bounds(period);
  return D.ops
    .filter(
      (o) =>
        o.type === "expense" &&
        o.date >= from &&
        o.date <= to &&
        (!b.categories ||
          b.categories.includes(o.category) ||
          b.categories.includes(cat(o.category)?.parent)),
    )
    .reduce((s, o) => s + convert(o.amount, acc(o.from)?.currency, b.currency), 0);
}
export function budgetsView() {
  return (
    header(
      "Budgets",
      IB("plus", "Create a budget", () => editBudget()),
    ) +
    periodBar() +
    `<div class="content">${
      D.budgets.length
        ? D.budgets
            .map((b) => {
              let used = budgetSpend(b),
                pct = b.amount ? (used / b.amount) * 100 : 0;
              return B(
                `<div style="display:flex;align-items:center;gap:12px"><span class="badge small">${I("budget")}</span><div class="grow"><strong>${esc(b.name)}</strong><div class="muted" style="font-size:12px;margin-top:5px">${b.categories ? b.categories.length + " categories" : "Entire expenses"}</div></div>${I("right", 18)}</div><div class="stats-halves" style="margin-top:19px"><span>${money(used, b.currency)} <small>spent</small></span><span>${money(b.amount, b.currency)} <small>limit</small></span></div><div class="bar-track"><span style="width:${Math.min(100, pct)}%;background:${pct > 100 ? "var(--negative)" : "var(--accent)"}"></span></div><small>${Math.round(pct)}% · ${t(b.period === "week" ? "Weekly" : b.period === "day" ? "Daily" : b.period === "year" ? "Yearly" : "Monthly")}</small>`,
                () => editBudget(b),
                "card budget-card",
              );
            })
            .join("")
        : `<div class="more-empty">${I("budget", 75)}<h2>Budgets will be here</h2><p class="muted">Create a budget to track your expenses</p>${B("Create a budget", () => editBudget(), "primary")}</div>`
    }</div>${D.budgets.length ? B(I("plus", 26), () => editBudget(), "fab no-nav", `aria-label="Create a budget"`) : ""}`
  );
}

export function editBudget(b) {
  page("budget", {
    draft: b
      ? clone(b)
      : {
          id: null,
          name: "",
          currency: D.settings.currency,
          amount: 0,
          period: "month",
          categories: null,
        },
  });
}
export function budgetView(p) {
  const b = p.draft;
  return (
    header(b.id ? "Edit budget" : "Create a budget") +
    `<div class="content"><div class="fields">${!b.id ? txt("Title", b.name, (v) => (b.name = v), "Enter a name") : ""}${field(
      "Time period",
      t({ day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[b.period]),
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
    )}${field(
      "Categories",
      b.categories
        ? b.categories.map((id) => esc(cat(id)?.name || "")).join(", ")
        : t("Entire expenses"),
      () =>
        multiSelect(
          "Categories",
          D.categories.filter((c) => c.type === "expense"),
          b.categories,
          (v) => {
            b.categories = v;
            render();
          },
        ),
    )}${field("Budget currency", esc(b.currency), () =>
      currencyPicker(b.currency, (v) => {
        b.currency = v;
        render();
      }),
    )}${field("Budget amount", money(b.amount, b.currency), () =>
      amountPicker("Budget amount", b.amount, (v) => {
        b.amount = v;
        render();
      }),
    )}</div>${B(
      b.id ? "Save" : "Create",
      () => {
        if (!b.name.trim()) return toast("Enter a name");
        if (b.amount <= 0) return toast("Enter an amount greater than zero");
        if (b.categories?.length === 0) return toast("Select at least one category");
        if (b.id)
          Object.assign(
            D.budgets.find((x) => x.id === b.id),
            b,
          );
        else D.budgets.push({ ...b, id: uid() });
        finish("Budget saved");
      },
      "primary",
    )}${
      b.id
        ? B(
            "Delete",
            () =>
              confirmAction(
                "Delete this budget?",
                () => {
                  D.budgets = D.budgets.filter((x) => x.id !== b.id);
                  finish("Budget deleted");
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
