import { check } from "./harness.js";
import { rootView } from "../js/app/shell.js";
import { appData, uiState } from "../js/core/state.js";
import { parseCSV } from "../js/data/csv.js";
import { CURRENCIES, defaultRates } from "../js/data/currencies.js";
import { completeData } from "../js/data/defaults.js";
import { isValidData } from "../js/data/storage.js";
import { searchCurrencies } from "../js/domain/currency-search.js";

check("Stored schema", () => isValidData(appData));

check("More root navigation", () => {
  const oldTab = uiState.tab,
    oldPages = uiState.pages;
  uiState.tab = "more";
  uiState.pages = [];
  const view = rootView();
  uiState.tab = oldTab;
  uiState.pages = oldPages;
  return view.includes("more-menu") && view.includes('class="navbar');
});

check(
  "CSV escaped fields",
  () =>
    parseCSV(
      'type,date,amount,currency,from,to,category,comment\nexpense,2026-10-12,1,KGS,Wallet,,Food,"a,b"',
    )[0].comment === "a,b",
);

check("Every currency has a positive fixed rate", () => {
  const rates = defaultRates();
  return CURRENCIES.length > 100 && CURRENCIES.every((c) => rates[c.code] > 0) && rates.KGS === 1;
});

check("Older data gets rates of new currencies and keeps its own", () => {
  const old = { settings: {}, rates: { KGS: 1, USD: 90 } };
  completeData(old);
  return (
    old.rates.USD === 90 &&
    old.rates.JPY > 0 &&
    old.rates.PLN > 0 &&
    old.settings.fixedRates.length === 0
  );
});

check("Numeric settings of old data become whole numbers in range", () => {
  const old = { settings: { monthStart: "31", weekStart: "3", lockDelay: "x" }, rates: {} };
  completeData(old);
  const { monthStart, weekStart, lockDelay } = old.settings;
  return monthStart === 28 && weekStart === 3 && lockDelay === 0;
});

check("A reminder of older data keeps its time of day on the day of the payment", () => {
  const old = {
    settings: {},
    rates: {},
    scheduled: [{ reminder: "08:30", reminderLead: "At the time" }],
  };
  completeData(old);
  const [item] = old.scheduled;
  return (
    item.reminder.before === 0 &&
    item.reminder.unit === "Days" &&
    item.reminder.time === "08:30" &&
    !("reminderLead" in item)
  );
});

check("The single photo of older data becomes a list of photos", () => {
  const old = { settings: {}, rates: {}, ops: [{ photo: "data:image/jpeg;base64,AA" }, {}] };
  completeData(old);
  const [withPhoto, without] = old.ops;
  return withPhoto.photos.length === 1 && !("photo" in withPhoto) && without.photos === undefined;
});

check("Currency search narrows by code and country as letters are typed", () => {
  const one = searchCurrencies("k"),
    two = searchCurrencies("kg");
  return (
    searchCurrencies("")[0] !== undefined &&
    two[0] === "KGS" &&
    two.length < one.length &&
    one.includes("KGS") &&
    searchCurrencies("japan")[0] === "JPY" &&
    searchCurrencies("zzzz").length === 0
  );
});
