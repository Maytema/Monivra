/* Application state: persistent data (appData) and UI state (uiState) */
import { STORAGE_KEY, TODAY } from "./constants.js";
import { completeData, createEmptyData } from "../data/defaults.js";
import { findDataProblem } from "../data/storage.js";
import { isSupportedLanguage } from "../i18n/index.js";

// Nothing is installed on the first launch: the welcome screen asks whether to start
// empty or with a basic set. Stored data is never replaced silently: when it cannot be read, the
// original text is kept in `loadProblem` and in storage until the person decides (see
// `resolveLoadProblem`), and nothing is written over it meanwhile.
export let appData;
export let firstLaunch = false;
export let loadProblem = null;
const DAMAGED_KEY = STORAGE_KEY + ".damaged";
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    appData = createEmptyData();
    firstLaunch = true;
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(stored);
    } catch {
      loadProblem = {
        raw: stored,
        problem: { what: "File", number: 0, reason: "the file is damaged or is not a JSON file" },
      };
    }
    const found = loadProblem ? null : findDataProblem(parsed);
    if (found) loadProblem = { raw: stored, problem: found };
    appData = loadProblem ? createEmptyData() : completeData(parsed);
    // The screen for data that cannot be read still speaks the language that was chosen, when the
    // text says it.
    const chosen = loadProblem && /"language"\s*:\s*"([a-z]{2})"/.exec(stored)?.[1];
    if (chosen && isSupportedLanguage(chosen)) appData.settings.language = chosen;
  }
} catch {
  appData = createEmptyData();
}
// The person has decided what to do with data that could not be read: a copy of its text stays in
// storage under a name of its own, and from now on saving is allowed.
export function resolveLoadProblem() {
  if (!loadProblem) return;
  try {
    localStorage.setItem(DAMAGED_KEY, loadProblem.raw);
  } catch {
    // The copy is a courtesy: when storage is full the person has already been offered a file.
  }
  loadProblem = null;
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
  // How operations were added ("manual", "schedule"); null is all.
  origin: null,
});
// The period chosen in this session lives until the application is closed; a new session shows
// the current month.
const PERIOD_KEY = "monivra.session.period";
const PERIOD_MODES = ["day", "week", "month", "year", "range", "all"];
const currentMonth = () => ({ mode: "month", anchor: TODAY });
function sessionPeriod() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(PERIOD_KEY));
    const date = /^\d{4}-\d{2}-\d{2}$/;
    const valid =
      PERIOD_MODES.includes(stored?.mode) &&
      date.test(stored.anchor) &&
      (stored.mode !== "range" || (date.test(stored.from) && date.test(stored.to)));
    return valid ? stored : currentMonth();
  } catch {
    return currentMonth();
  }
}
export function rememberPeriod() {
  try {
    sessionStorage.setItem(PERIOD_KEY, JSON.stringify(uiState.period));
  } catch {
    // Without session storage the period simply starts from the current month next time.
  }
}
// Transient UI state: active tab, period, filters, page/sheet stacks, selection.
export const uiState = {
  tab: "accounts",
  accountTab: "Accounts",
  catType: "expense",
  period: sessionPeriod(),
  openFolders: {},
  manageArchive: false,
  selected: [],
  selection: false,
  search: false,
  filters: emptyFilters(),
  donut: null,
  // Ids of the operations scheduled payments posted on their own since the person last looked.
  paymentsPosted: [],
  pages: [],
  layers: [],
  reorder: false,
};
// Deleted records can no longer be selected or filtered by: `removed` lists their ids.
export function forgetDeleted(removed) {
  const gone = { operations: [], accounts: [], categories: [], ...removed };
  uiState.selected = uiState.selected.filter((id) => !gone.operations.includes(id));
  for (const key of ["accounts", "categories"]) {
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
