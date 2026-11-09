import { check } from "./harness.js";
import { addAccount } from "./helpers.js";
import { rootView } from "../js/app/shell.js";
import { appData, uiState } from "../js/core/state.js";
import { CURRENCIES, defaultRates } from "../js/data/currencies.js";
import { completeData } from "../js/data/defaults.js";
import { isValidData } from "../js/data/storage.js";
import { createBackup, deleteAllBackups, restoreBackup } from "../js/domain/backups.js";
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

const REPLACE = { mode: "replace", scheduled: "count" };

check("A replaced backup brings the old data back and keeps the list of backups", () => {
  appData.ops = [];
  const cash = addAccount({ opening: 100 });
  createBackup();
  const [backup] = appData.backups;
  appData.accounts = appData.accounts.filter((a) => a.id !== cash.id);
  restoreBackup(backup, REPLACE);
  const restored = appData.accounts.some((a) => a.id === cash.id);
  const listKept = appData.backups.length === 1 && appData.backups[0].data.backups.length === 0;
  deleteAllBackups();
  return restored && listKept && appData.backups.length === 0;
});

check(
  "A merged backup keeps what only the current data has and brings back what only it has",
  () => {
    appData.ops = [];
    const old = addAccount({ opening: 100 });
    createBackup();
    const [backup] = appData.backups;
    appData.accounts = appData.accounts.filter((a) => a.id !== old.id);
    const fresh = addAccount({ opening: 5 });
    const currency = appData.settings.currency;
    appData.settings.currency = "EUR";
    restoreBackup(backup, { mode: "merge", scheduled: "count" });
    const both =
      appData.accounts.some((a) => a.id === old.id) &&
      appData.accounts.some((a) => a.id === fresh.id);
    const kept = appData.settings.currency === "EUR";
    appData.settings.currency = currency;
    deleteAllBackups();
    return both && kept;
  },
);

check("The scheduled payments of a backup are counted, skipped or left out as chosen", () => {
  const base = appData.ops.find((o) => o.type === "expense");
  const dueDay = new Date(Date.now() - 3 * 86400000).toLocaleDateString("en-CA");
  const item = { ...structuredClone(base), id: "__old", date: dueDay, recur: null, reminder: null };
  const outcome = (scheduled) => {
    appData.scheduled = [structuredClone(item)];
    createBackup();
    const [backup] = appData.backups;
    appData.scheduled = [];
    restoreBackup(backup, { mode: "replace", scheduled });
    const result = appData.scheduled.map((x) => x.id).join();
    deleteAllBackups();
    return result;
  };
  // Counted: kept, so the payment that came due is added on its own. Skipped: the payment that came
  // due is let go and, as it does not repeat, nothing is left. Left out: nothing comes back.
  return outcome("count") === "__old" && outcome("skip") === "" && outcome("none") === "";
});

check("Only the ten latest backups are kept", () => {
  appData.backups = [];
  for (let n = 0; n < 12; n++) createBackup();
  return appData.backups.length === 10;
});
