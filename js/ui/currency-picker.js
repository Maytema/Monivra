/* Currency picker: one sheet for choosing a currency anywhere in the application */
import { render } from "../app/shell.js";
import { escapeHtml } from "../core/constants.js";
import { appData } from "../core/state.js";
import { CURRENCIES, currencySymbol } from "../data/currencies.js";
import { save } from "../data/storage.js";
import { searchCurrencies } from "../domain/currency-search.js";
import { currencyName, currentLocale, translate } from "../i18n/index.js";
import { closeLayers, openSheet } from "./navigation.js";
import { buttonHtml, iconButtonHtml, searchFieldHtml } from "./primitives.js";

const POPULAR = ["USD", "EUR", "GBP", "CNY", "JPY", "CHF", "CAD", "AUD"];
// Ways to order the list when nothing is typed: label of each.
const SORTS = [
  ["groups", "Used first"],
  ["name", "By name"],
  ["code", "By code"],
];

// Codes of the currencies already in use: main, accounts and categories.
const usedCodes = () =>
  new Set([
    appData.settings.currency,
    ...appData.accounts.map((a) => a.currency),
    ...appData.categories.map((c) => c.currency),
  ]);
// Codes sorted by the chosen key, as a flat list.
function sorted(by) {
  const collator = new Intl.Collator(currentLocale());
  const key = (code) => (by === "code" ? code : currencyName(code));
  return CURRENCIES.map((c) => c.code).sort((a, b) => collator.compare(key(a), key(b)));
}
// Sections of the list: [title, codes]. A typed text gives one section of best matches first.
function sections(text, by) {
  if (text.trim()) return [["", searchCurrencies(text)]];
  const all = sorted(by === "code" ? "code" : "name");
  if (by !== "groups") {
    const letters = new Map();
    for (const code of all) {
      const first = (by === "code" ? code : currencyName(code)).charAt(0).toLocaleUpperCase();
      letters.set(first, [...(letters.get(first) || []), code]);
    }
    return [...letters];
  }
  const used = usedCodes();
  return [
    ["Currencies used", all.filter((c) => used.has(c))],
    ["Major currencies", POPULAR.filter((c) => !used.has(c))],
    ["Other currencies", all.filter((c) => !used.has(c) && !POPULAR.includes(c))],
  ];
}
const rowHtml = (code, selected, fn) => {
  const name = currencyName(code),
    sign = currencySymbol(code);
  return buttonHtml(
    `<span class="currency-sheet-radio ${selected ? "selected" : ""}"></span><span class="currency-sheet-name">${escapeHtml(name)}<small>${code}</small></span><span class="currency-sheet-symbol">${sign === code ? "" : escapeHtml(sign)}</span>`,
    fn,
    "select-main",
    `aria-label="${escapeHtml(name)} ${code}"`,
  );
};

// Sheet for choosing a currency: type a code, sign, currency or country to narrow the list.
export function currencyPicker(value, fn) {
  let text = "";
  const choose = (code) => () => {
    closeLayers();
    fn(code);
  };
  openSheet(
    () => {
      const by = appData.settings.currencySort;
      const shown = sections(text, by).filter(([, codes]) => codes.length);
      return `<div class="picker-page currency-picker"><div class="picker-page-head">${iconButtonHtml("close", "Close", () => closeLayers())}<h2>${translate("Select currency")}</h2><span></span></div>${searchFieldHtml(
        "Code, name or country",
        text,
        (v) => {
          text = v;
          render();
        },
      )}<div class="currency-sort" role="group" aria-label="${escapeHtml(translate("Order"))}">${SORTS.map(
        ([id, label]) =>
          buttonHtml(
            translate(label),
            () => {
              appData.settings.currencySort = id;
              save();
              render();
            },
            `currency-sort-option ${by === id ? "active" : ""}`,
            `aria-pressed="${by === id}"`,
          ),
      ).join("")}</div><div class="picker-page-body">${shown
        .map(
          ([title, codes]) =>
            `${title ? `<h3 class="section-label">${translate(title)}</h3>` : ""}<section class="select-card">${codes.map((code) => rowHtml(code, code === value, choose(code))).join("")}</section>`,
        )
        .join(
          "",
        )}${shown.length ? "" : `<div class="empty">${translate("No currencies found")}</div>`}</div></div>`;
    },
    "Select currency",
    "full",
  );
}
