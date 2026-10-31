/* Pickers for accounts and categories: one list design for every place that asks for them */
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import {
  ACCOUNT_GROUPS,
  accountBalance,
  categoryTotal,
  categoryTotalIn,
  convertCurrency,
  formatMoney,
  moneySpanHtml,
} from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { closeLayers, openSheet, tabsHtml } from "../ui/kit.js";
import { badgeHtml, buttonHtml } from "../ui/primitives.js";

// Account cards grouped by kind; `onPick(account)` runs when one is tapped.
export function accountCardsHtml(accounts, chosenId, onPick) {
  if (!accounts.length) return `<p class="footnote">${translate("No available accounts")}</p>`;
  return ACCOUNT_GROUPS.map(([label, belongs]) => {
    const rows = accounts.filter(belongs);
    if (!rows.length) return "";
    const total = rows.reduce(
      (n, a) => n + convertCurrency(accountBalance(a.id), a.currency, appData.settings.currency),
      0,
    );
    return `<div class="picker-group-title"><span>${translate(label)}</span>${moneySpanHtml(total, appData.settings.currency, false, true)}</div>${rows
      .map((a) =>
        buttonHtml(
          `${badgeHtml(a, true)}<span class="grow"><span class="name">${escapeHtml(a.name)}</span>${moneySpanHtml(accountBalance(a.id), a.currency, false, true)}</span>${chosenId === a.id ? iconSvg("check", 18) : ""}`,
          () => onPick(a),
          "row account-row",
        ),
      )
      .join("")}`;
  }).join("");
}

// Total of a category for the report period, shown in the currency of the category.
export const categoryMoney = (c) => formatMoney(categoryTotalIn(c), c.currency);
// One category tile: icon, name and the total of the period; `extra` is added to the button.
export function categoryTileHtml(c, onPick, chosen = false, extra = "") {
  const tone = categoryTotal(c.id, c.type) === 0 ? "muted" : c.type === "income" ? "pos" : "neg";
  return buttonHtml(
    `${badgeHtml(c)}<span class="grow"><span class="name">${escapeHtml(c.name)}</span><span class="money ${tone}">${categoryMoney(c)}</span></span>${chosen ? iconSvg("check", 16) : ""}`,
    onPick,
    "cat-tile",
    extra,
  );
}
// Grid of tiles for the categories of one type; `onPick(category)` runs when one is tapped.
export function categoryTilesHtml(type, chosenId, onPick, extraClass = "") {
  const tiles = appData.categories
    .filter((c) => !c.archived && c.type === type)
    .map((c) => categoryTileHtml(c, () => onPick(c), c.id === chosenId))
    .join("");
  return `<div class="grid ${appData.settings.onePicker ? "one" : ""} ${extraClass}">${tiles}</div>`;
}

// Sheet for choosing an account.
export function accountPicker(value, fn, exclude = null) {
  openSheet(
    () =>
      `<h2 class="counterparty-title">${translate("Account")}</h2><div class="counterparty-accounts">${accountCardsHtml(
        appData.accounts.filter((a) => !a.archived && a.id !== exclude),
        value,
        (a) => {
          closeLayers();
          fn(a.id);
        },
      )}</div>`,
    "Account",
  );
}

// Sheet for choosing a category of either type.
export function categoryPicker(type, value, fn) {
  let active = type;
  openSheet(
    () =>
      `<h2 class="counterparty-title">${translate("Category")}</h2>${tabsHtml(
        [
          ["expense", "Expenses"],
          ["income", "Incomes"],
        ],
        active,
        (id) => (active = id),
        "tabs counterparty-tabs",
      )}${categoryTilesHtml(
        active,
        value,
        (c) => {
          closeLayers();
          fn(c.id);
        },
        "counterparty-categories",
      )}`,
    "Category",
  );
}
