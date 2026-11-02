/* Backups: copies of the data kept inside the data */
import { deepClone, newId, today } from "../core/constants.js";
import { appData, setAppData } from "../core/state.js";
import { save } from "../data/storage.js";
import { settleMissed } from "./scheduled.js";

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

// The records of a list by id: those of `backup` where both have the id, and those only the
// current data has stay.
const union = (current, backup) => [
  ...current.filter((x) => !backup.some((y) => y.id === x.id)),
  ...backup,
];

// Bring a backup back. "replace" makes the data the backup; "merge" adds the backup to the data,
// the backup's version of a record that both have. `scheduled` says what happens to the scheduled
// payments of the backup: "count" keeps them, so what came due since is added; "skip" keeps them
// and lets what came due since go; "none" leaves the scheduled payments as they are now.
// The list of backups stays as it is, and so do the settings after a merge.
export function restoreBackup(backup, { mode, scheduled }) {
  const source = deepClone(backup.data);
  const keep = scheduled === "none" ? appData.scheduled : source.scheduled;
  const next =
    mode === "replace"
      ? { ...source, scheduled: keep }
      : {
          ...appData,
          accounts: union(appData.accounts, source.accounts),
          categories: union(appData.categories, source.categories),
          ops: union(appData.ops, source.ops),
          tags: [...new Set([...appData.tags, ...source.tags])],
          budgets: union(appData.budgets, source.budgets),
          scheduled: scheduled === "none" ? appData.scheduled : union(appData.scheduled, keep),
        };
  const { backups } = appData;
  setAppData(next);
  appData.backups = backups;
  if (scheduled === "skip")
    for (const item of appData.scheduled.filter((x) => x.date <= today()))
      settleMissed(item.id, false);
  save();
}

// Delete every saved backup.
export function deleteAllBackups() {
  appData.backups = [];
  save();
}
