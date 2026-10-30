/* Application state: persistent data (appData) and UI state (uiState) */
import { STORAGE_KEY, TODAY } from "./constants.js";
import { createEmptyData } from "../data/defaults.js";
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
    // Settings added by newer versions get their defaults.
    appData.settings = { ...createEmptyData().settings, ...appData.settings };
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
export let uiState = {
  tab: "accounts",
  accountTab: "Accounts",
  catType: "expense",
  period: { mode: "month", anchor: TODAY },
  archive: false,
  manageArchive: false,
  selected: [],
  selection: false,
  search: false,
  filters: emptyFilters(),
  donut: null,
  pages: [],
  layers: [],
  reorder: false,
  // Field the docked digit keypad types into, or null.
  numpad: null,
};
// Callback waiting for a photo chosen through the hidden file input.
export let photoCallback = null;
// Kind of file the import dialog expects: "json" or "csv".
export let importKind = "json";
// True while the PIN lock screen is shown.
export let locked = false;
// Digits typed so far on the PIN lock screen.
export let pinEntry = "";
export function setAppData(value) {
  appData = value;
  return value;
}

export function setUiState(value) {
  uiState = value;
  return value;
}

export function setPhotoCallback(value) {
  photoCallback = value;
  return value;
}

export function setImportKind(value) {
  importKind = value;
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
