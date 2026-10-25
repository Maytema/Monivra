/* Application state: data (D) and UI state (U) */
import { KEY, TODAY } from "./constants.js";
import { emptyData, seed } from "../data/seed.js";
import { validData } from "../data/storage.js";

// Install editable demonstration data only on the very first launch.
// Existing datasets (including deliberately emptied ones) are never reseeded.
export let D;
try {
  const stored = localStorage.getItem(KEY);
  if (stored === null) {
    D = seed();
    localStorage.setItem(KEY, JSON.stringify(D));
  } else {
    D = JSON.parse(stored);
    if (!validData(D)) D = emptyData();
  }
} catch {
  D = emptyData();
}
export let U = {
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
export function setD(value) {
  D = value;
  return value;
}

export function setU(value) {
  U = value;
  return value;
}
