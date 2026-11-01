/* Application state: persistent data (appData) and UI state (uiState) */
import { STORAGE_KEY, TODAY } from "./constants.js";
import { completeData, createEmptyData } from "../data/defaults.js";
import { isValidData } from "../data/storage.js";

// Nothing is installed on the first launch: the welcome screen asks whether to start
// empty or with a basic set. Stored datasets are never replaced.
export let appData;
export let firstLaunch = false;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    appData = createEmptyData();
    firstLaunch = true;
  } else {
    appData = JSON.parse(stored);
    if (!isValidData(appData)) appData = createEmptyData();
    completeData(appData);
  }
} catch {
  appData = createEmptyData();
}
// The welcome screen disappears once a start option has been chosen.
export function setFirstLaunch(value) {
  firstLaunch = value;
}
// Filters of the operations list with nothing selected.
export const emptyFilters = () => ({
  accounts: null,
  categories: null,
  types: null,
  tags: null,
  comment: "",
  // Kinds of operations to show (by hand, paid by schedule, changed after that, upcoming); null
  // is everything that has happened.
  kinds: null,
  // Budgets whose operations to show; null is all.
  budgets: null,
});
// Transient UI state: active tab, period, filters, page/sheet stacks, selection.
export const uiState = {
  tab: "accounts",
  accountTab: "Accounts",
  catType: "expense",
  period: { mode: "month", anchor: TODAY },
  openFolders: {},
  manageArchive: false,
  selected: [],
  selection: false,
  search: false,
  filters: emptyFilters(),
  // Budgets page: statuses of the budgets to show; null is all.
  budgetStatuses: null,
  donut: null,
  // Scheduled payments posted on their own since the person last looked.
  paymentsPosted: 0,
  pages: [],
  layers: [],
  reorder: false,
};
// Deleted records can no longer be selected or filtered by: `removed` lists their ids.
export function forgetDeleted(removed) {
  const gone = { operations: [], accounts: [], categories: [], budgets: [], ...removed };
  uiState.selected = uiState.selected.filter((id) => !gone.operations.includes(id));
  for (const key of ["accounts", "categories", "budgets"]) {
    const rest = uiState.filters[key]?.filter((id) => !gone[key].includes(id));
    if (rest) uiState.filters[key] = rest.length ? rest : null;
  }
}
// True while the PIN lock screen is shown.
export let locked = false;
// Digits typed so far on the PIN lock screen.
export let pinEntry = "";
export function setAppData(value) {
  appData = value;
  return value;
}

export function setLocked(value) {
  locked = value;
  return value;
}

export function setPinEntry(value) {
  pinEntry = value;
  return value;
}
