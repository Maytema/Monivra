/* Choice of the categories of a budget: a full-screen list of groups with checkboxes */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import { closeLayers, openSheet } from "../ui/kit.js";
import { badgeHtml, buttonHtml, iconButtonHtml } from "../ui/primitives.js";
import { translate } from "../i18n/index.js";

// A checkbox drawn like the ones of the filters.
const box = (on) =>
  `<span class="checkbox ${on ? "on" : ""}" aria-hidden="true">${on ? iconSvg("check", 16) : ""}</span>`;

// Dialog for the categories of a budget; `fn` gets a list of ids, or null for all expenses.
export function categorySelect(selected, fn) {
  const expense = appData.categories.filter((c) => c.type === "expense");
  const parents = expense.filter((c) => !c.parent);
  const active = parents.filter((c) => !c.archived);
  const archived = parents.filter((c) => c.archived);
  const children = (c) => expense.filter((x) => x.parent === c.id);
  const chosen = new Set(selected || []);
  const open = new Set();
  let all = selected === null;

  // A category counts as chosen when it or the category above it is chosen.
  const has = (c) => chosen.has(c.id) || (!!c.parent && chosen.has(c.parent));
  const toggle = (c) => {
    all = false;
    if (!c.parent) {
      const on = chosen.has(c.id);
      for (const x of [c, ...children(c)]) chosen.delete(x.id);
      if (!on) chosen.add(c.id);
    } else if (chosen.has(c.parent)) {
      // The rest of the group stays chosen one by one.
      chosen.delete(c.parent);
      for (const x of children({ id: c.parent })) if (x.id !== c.id) chosen.add(x.id);
    } else if (chosen.has(c.id)) chosen.delete(c.id);
    else chosen.add(c.id);
  };
  const toggleGroup = (list) => {
    all = false;
    const on = list.every((c) => chosen.has(c.id));
    for (const c of list) for (const x of [c, ...children(c)]) chosen.delete(x.id);
    if (!on) for (const c of list) chosen.add(c.id);
  };

  const row = (c) => {
    const kids = children(c);
    return (
      `<div class="select-row">${buttonHtml(
        `${badgeHtml(c, true)}<span class="grow">${escapeHtml(c.name)}</span>${box(has(c))}`,
        () => {
          toggle(c);
          render();
        },
        "select-main",
        `role="checkbox" aria-checked="${has(c)}"`,
      )}${
        kids.length
          ? iconButtonHtml(open.has(c.id) ? "up" : "down", "Subcategories", () => {
              if (!open.delete(c.id)) open.add(c.id);
              render();
            })
          : ""
      }</div>` + (open.has(c.id) ? kids.map((k) => row(k)).join("") : "")
    );
  };
  const group = (title, list) =>
    `<section class="select-card">${buttonHtml(
      `<strong class="grow">${translate(title)}</strong>${box(list.length > 0 && list.every((c) => chosen.has(c.id)))}`,
      () => {
        toggleGroup(list);
        render();
      },
      "select-main select-title",
    )}${list.map(row).join("")}</section>`;

  openSheet(
    () =>
      `<div class="picker-page"><div class="picker-page-head">${iconButtonHtml("close", "Close", () => closeLayers())}<h2>${translate("Select categories")}</h2><span></span></div><div class="picker-page-body"><section class="select-card">${buttonHtml(
        `<strong class="grow">${translate("All categories")}</strong>${box(all)}`,
        () => {
          all = !all;
          if (all) chosen.clear();
          render();
        },
        "select-main select-title",
      )}</section>${group("Expenses", active)}${archived.length ? group("Expenses (archived)", archived) : ""}</div><div class="picker-page-actions">${buttonHtml("Cancel", () => closeLayers(), "outline")}${buttonHtml(
        "Confirm",
        () => {
          closeLayers();
          fn(all || chosen.size === 0 ? null : [...chosen]);
        },
        "primary",
      )}</div></div>`,
    "Select categories",
    "full",
  );
}
