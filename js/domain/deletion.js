/* The ways to delete data. Each one says what it removes, and what is left is always a whole,
   consistent set of data: nothing is left that points to something that is gone. */
import { appData, emptyFilters, setAppData, uiState } from "../core/state.js";
import { createEmptyData, withoutFinanceData } from "../data/defaults.js";
import { save } from "../data/storage.js";
import { translate } from "../i18n/index.js";
import { BACKUP_NOT_STORED, createBackup } from "./backups.js";

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
    message: "All operations will be deleted. Balances go back to the opening balances.",
    effects: [
      "Accounts, categories, tags, budgets and scheduled payments stay, and so do the backups.",
    ],
    backup: true,
  },
  partial: {
    title: "Partial deletion",
    kinds: FINANCE,
    result: withoutFinanceData,
    message:
      "Accounts, categories, operations, tags, budgets and scheduled payments will be deleted. Settings, exchange rates and backups stay.",
    effects: ["A backup that holds this data can bring it back."],
    backup: true,
    file: true,
  },
  backups: {
    title: "Delete backups",
    kinds: ["backups"],
    result: (data) => ({ ...data, backups: [] }),
    message: "The backups kept inside the app will be deleted. Your data stays.",
    outside: true,
    effects: [],
  },
  everything: {
    title: "Delete local data",
    note: "Everything: the data, backups, settings and reminders",
    kinds: [...FINANCE, "backups"],
    settings: true,
    result: createEmptyData,
    message: "All local app data, including internal backups, will be permanently deleted.",
    outside: true,
    effects: [],
    file: true,
    typed: true,
  },
};

// Deletes the data in the way `id`. With `backup` a copy of the data is added to the backups first.
// When the result cannot be stored nothing is changed and an error is thrown.
export function deleteData(id, { backup = false } = {}) {
  const way = DELETIONS[id];
  if (backup && way.backup && !createBackup("safety")) throw Error(translate(BACKUP_NOT_STORED));
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
