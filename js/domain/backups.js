/* Backups: copies of the data kept inside the data */
import { deepClone, newId } from "../core/constants.js";
import { appData, setAppData } from "../core/state.js";
import { save } from "../data/storage.js";

const MAX_BACKUPS = 10;

// Copy of the dataset without its backup list.
export function dataSnapshot() {
  const snapshot = deepClone(appData);
  snapshot.backups = [];
  return snapshot;
}

// Store a snapshot of the dataset in the backup list (before destructive actions).
export function createBackup() {
  appData.backups.unshift({ id: newId(), at: new Date().toISOString(), data: dataSnapshot() });
  appData.backups = appData.backups.slice(0, MAX_BACKUPS);
  save();
}

// Replace the data with a backup; the list of backups stays as it is.
export function restoreBackup(backup) {
  const backups = deepClone(appData.backups);
  setAppData(deepClone(backup.data));
  appData.backups = backups;
  save();
}

export function deleteBackup(id) {
  appData.backups = appData.backups.filter((backup) => backup.id !== id);
  save();
}
