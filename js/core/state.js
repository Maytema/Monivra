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
  donut: null,
  pages: [],
  layers: [],
  reorder: false,
};
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
