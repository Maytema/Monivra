/* The filter by scheduled payments and budgets: what the operations come from and what they count in */
import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { BUDGET_STATUS_NAMES, budgetState } from "../../domain/budgets.js";
import { chosenKinds, DEFAULT_KINDS, SCHEDULE_KINDS } from "../../domain/finance.js";
import { translate, translateCount } from "../../i18n/index.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { buttonHtml } from "../../ui/primitives.js";
import { checkboxHtml, pickerHtml } from "./filter-parts.js";

// Name and explanation of each kind of operation.
const KINDS = {
  manual: ["Entered by hand", "Operations you added yourself"],
  paid: ["Paid by schedule", "Added by a scheduled payment, as planned"],
  changed: ["Changed by me", "Paid by schedule, then changed by you"],
  upcoming: ["Upcoming", "Not paid yet, shown on the days they are due"],
};

// Short text of the choice for the field of the filters sheet.
export function scheduleFilterSummary(f) {
  const parts = [];
  if (f.kinds) parts.push(f.kinds.map((kind) => translate(KINDS[kind][0])).join(", "));
  if (f.budgets) parts.push(translateCount("{n} budget", "{n} budgets", f.budgets.length));
  return parts.join(" · ") || "All operations";
}

// Choice of the kinds of operations and of the budgets they count in. Anything can be combined;
// choosing nothing in a group is the same as choosing all of it.
export function scheduleFilterSelect(f, done) {
  const kinds = new Set(chosenKinds(f)),
    budgets = new Set(f.budgets ?? appData.budgets.map((b) => b.id));
  const toggle = (set, id) => {
    if (!set.delete(id)) set.add(id);
    render();
  };
  const allBudgets = () => {
    const all = budgets.size === appData.budgets.length;
    budgets.clear();
    if (!all) appData.budgets.forEach((b) => budgets.add(b.id));
    render();
  };
  const listHtml = () => {
    const kindRows = SCHEDULE_KINDS.map((kind) =>
      buttonHtml(
        `<span class="grow">${translate(KINDS[kind][0])}<small>${translate(KINDS[kind][1])}</small></span>${checkboxHtml(kinds.has(kind))}`,
        () => toggle(kinds, kind),
        "filter-choice",
      ),
    );
    const budgetRows = appData.budgets.map((b) =>
      buttonHtml(
        `<span class="grow">${escapeHtml(b.name)}<small>${translate(BUDGET_STATUS_NAMES[budgetState(b).status])}</small></span>${checkboxHtml(budgets.has(b.id))}`,
        () => toggle(budgets, b.id),
        "filter-choice",
      ),
    );
    const budgetGroup = appData.budgets.length
      ? `<div class="filter-group">${buttonHtml(
          `<strong>${translate("Budgets")}</strong><small>${budgets.size}/${appData.budgets.length}</small>${checkboxHtml(budgets.size === appData.budgets.length)}`,
          allBudgets,
          "filter-group-head filter-group-all",
        )}${budgetRows.join("")}</div>`
      : "";
    return `<div class="filter-group"><div class="filter-group-head"><strong>${translate("Scheduled payments")}</strong></div>${kindRows.join("")}</div>${budgetGroup}`;
  };
  openSheet(
    () =>
      pickerHtml("Scheduled payments and budgets", "", listHtml(), () => {
        closeLayers();
        const usual =
          kinds.size === 0 ||
          (kinds.size === DEFAULT_KINDS.length && DEFAULT_KINDS.every((kind) => kinds.has(kind)));
        done({
          kinds: usual ? null : SCHEDULE_KINDS.filter((kind) => kinds.has(kind)),
          budgets:
            budgets.size === 0 || budgets.size === appData.budgets.length ? null : [...budgets],
        });
      }),
    "Scheduled payments and budgets",
  );
}
