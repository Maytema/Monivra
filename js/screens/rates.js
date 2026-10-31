/* Exchange rates page: every currency has a fixed editable rate and may be kept out of the
   automatic update */
import { render } from "../app/shell.js";
import { escapeHtml, iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import { defaultRates } from "../data/currencies.js";
import { save } from "../data/storage.js";
import { searchCurrencies } from "../domain/currency-search.js";
import { currencyName, translate } from "../i18n/index.js";
import { confirmAction, numberPicker, showInfo } from "../ui/kit.js";
import { buttonHtml, menuRowHtml, registerInput, toast, toggleRowHtml } from "../ui/primitives.js";

let query = "";
const isFixed = (code) => appData.settings.fixedRates.includes(code);
// Currencies in use come first, then the rest by code; a typed text lists the best matches.
function listed() {
  const found = searchCurrencies(query);
  if (query.trim()) return found;
  const used = new Set([
    appData.settings.currency,
    ...appData.accounts.map((a) => a.currency),
    ...appData.categories.map((c) => c.currency),
  ]);
  return [...found.filter((c) => used.has(c)), ...found.filter((c) => !used.has(c))];
}
// Keep a currency out of (or back in) the automatic update.
function setFixed(code, fixed) {
  const rest = appData.settings.fixedRates.filter((c) => c !== code);
  appData.settings.fixedRates = fixed ? [...rest, code] : rest;
  save();
  render();
}
// Ask for a new rate; an edited rate is kept out of the automatic update.
function editRate(code) {
  numberPicker(
    "Exchange rate",
    String(appData.rates[code]),
    (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        toast("Use a positive number");
        return false;
      }
      if (code === "KGS" && n !== 1) {
        toast("KGS is the base currency (1)");
        return false;
      }
      appData.rates[code] = n;
      if (code !== "KGS" && !isFixed(code)) appData.settings.fixedRates.push(code);
      save();
      render();
    },
    { decimal: true },
  );
}
const rateRow = (code) => {
  const fixed = isFixed(code),
    base = code === "KGS";
  return `<div class="rate-row">${buttonHtml(
    `<span class="grow"><span class="title">${escapeHtml(currencyName(code))}</span><span class="sub">1 ${code} = ${appData.rates[code]} KGS</span></span>`,
    () => editRate(code),
    "rate-edit",
    `aria-label="${escapeHtml(currencyName(code))} ${code}"`,
  )}${
    base
      ? ""
      : buttonHtml(
          `<span class="checkbox ${fixed ? "on" : ""}">${fixed ? iconSvg("check", 16) : ""}</span>`,
          () => setFixed(code, !fixed),
          "rate-fixed",
          `role="checkbox" aria-checked="${fixed}" aria-label="${escapeHtml(translate("Do not update automatically"))}: ${code}"`,
        )
  }</div>`;
};

// Body of the page.
export function ratesBody() {
  const codes = listed();
  return (
    `<p class="demo-note">${translate("DEMO · Fixed example rates, editable locally. No market data.")}</p>` +
    toggleRowHtml("Automatic rates", appData.settings.autoRates, () => {
      appData.settings.autoRates = !appData.settings.autoRates;
      save();
      render();
      showInfo(
        "DEMO: automatic exchange-rate updates need a network service. Values below stay unchanged.",
      );
    }) +
    `<p class="rates-legend">${translate("Tick a currency to keep its rate out of the automatic update. An edited rate is ticked automatically.")}</p>` +
    `<div class="rates-search"><span>${iconSvg("search", 22)}</span><input aria-label="${escapeHtml(translate("Code, name or country"))}" placeholder="${escapeHtml(translate("Code, name or country"))}" value="${escapeHtml(query)}" autocomplete="off" data-input="${registerInput(
      (v) => {
        query = v;
        render();
      },
    )}"></div>` +
    codes.map(rateRow).join("") +
    (codes.length ? "" : `<div class="empty">${translate("No currencies found")}</div>`) +
    menuRowHtml("Restore example rates", "repeat", () =>
      confirmAction(
        "Every rate returns to its example value and the ticks are cleared.",
        () => {
          appData.rates = defaultRates();
          appData.settings.fixedRates = [];
          save();
          render();
          toast("Rates restored");
        },
        false,
        "Restore",
      ),
    )
  );
}
