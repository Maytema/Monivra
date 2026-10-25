/* Application state: persistent data (appData) and UI state (uiState) */
import { STORAGE_KEY, TODAY } from "./constants.js";
import { createEmptyData, createSeedData } from "../data/seed.js";
import { isValidData } from "../data/storage.js";

// Install editable demonstration data only on the very first launch.
// Existing datasets (including deliberately emptied ones) are never reseeded.
export let appData;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    appData = createSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } else {
    appData = JSON.parse(stored);
    if (!isValidData(appData)) appData = createEmptyData();
  }
} catch {
  appData = createEmptyData();
}
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
  filters: {
    accounts: null,
    categories: null,
    types: null,
    tags: null,
    comment: "",
  },
  donut: null,
  pages: [],
  layers: [],
  reorder: false,
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
