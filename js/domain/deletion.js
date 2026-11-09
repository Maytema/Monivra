/* The ways to delete data. Each one says what it removes, and what is left is always a whole,
   consistent set of data: nothing is left that points to something that is gone. */
import { appData, emptyFilters, setAppData, uiState } from "../core/state.js";
import { createEmptyData, withoutFinanceData } from "../data/defaults.js";
import { save } from "../data/storage.js";
import { translate } from "../i18n/index.js";
import { createBackup } from "./backups.js";

const FINANCE = ["accounts", "categories", "ops", "tags", "scheduled", "budgets"];

// id → what it removes (`kinds`, the lists of the data), the data that is left (`result`), what the
// person is told it does to the rest (`effects`), and the safeguards offered before it:
// `backup` is a copy kept in the backups, `file` a data file saved outside the application, `typed`
// asks for a word to be written because nothing can bring the data back.
export const DELETIONS = {
  operations: {
    title: "Delete operations",
    kinds: ["ops"],
    result: (data) => ({ ...data, ops: [] }),
    effects: [
      "The balances of the accounts go back to their opening balances.",
      "Accounts, categories, tags, budgets and scheduled payments stay, and so do the backups.",
    ],
    backup: true,
  },
  partial: {
    title: "Partial deletion",
    kinds: FINANCE,
    result: withoutFinanceData,
    effects: [
      "The settings, the exchange rates and the backups stay. A backup that holds this data can bring it back.",
    ],
    backup: true,
    file: true,
  },
  backups: {
    title: "Delete backups",
    kinds: ["backups"],
    result: (data) => ({ ...data, backups: [] }),
    effects: [
      "The data stays as it is.",
      "The data can no longer be brought back from these copies.",
    ],
  },
  everything: {
    title: "Delete local data",
    note: "Everything: the data, backups, settings and reminders",
    kinds: [...FINANCE, "backups"],
    settings: true,
    result: createEmptyData,
    effects: [
      "Nothing is left on this device, and the backups go too.",
      "Data files saved outside the application are not touched.",
    ],
    file: true,
    typed: true,
  },
};

// Deletes the data in the way `id`. With `backup` a copy of the data is added to the backups first.
// When the result cannot be stored nothing is changed and an error is thrown.
export function deleteData(id, { backup = false } = {}) {
  const way = DELETIONS[id];
  if (backup && way.backup) createBackup("safety");
  const before = appData;
  setAppData(way.result(before));
  if (!save()) {
    setAppData(before);
    throw Error(translate("The data could not be stored, so nothing was deleted."));
  }
  // What the person chose to look at, and the selection, may point to what is gone.
  uiState.filters = emptyFilters();
  uiState.selected = [];
}
