/* Backups: copies of the data kept inside the data */
import { APP_BUILD, deepClone, newId, today } from "../core/constants.js";
import { appData, emptyFilters, resolveLoadProblem, setAppData, uiState } from "../core/state.js";
import { describeProblem } from "../data/problems.js";
import { save } from "../data/storage.js";
import { translate } from "../i18n/index.js";
import { planRestore } from "./restore.js";
import { settleMissed } from "./scheduled.js";

const MAX_BACKUPS = 10;

// Copy of the dataset without its backup list.
export function dataSnapshot() {
  const snapshot = deepClone(appData);
  snapshot.backups = [];
  return snapshot;
}

// A new backup of the dataset. `reason` says why it was made: "manual", "auto" (the daily one) or
// "safety" (before a change that cannot be undone).
const backupEntry = (reason) => ({
  id: newId(),
  at: new Date().toISOString(),
  reason,
  build: APP_BUILD,
  schema: appData.schema,
  data: dataSnapshot(),
});
const withEntry = (backups, entry) => [entry, ...backups].slice(0, MAX_BACKUPS);

// Store a snapshot of the dataset in the backup list.
export function createBackup(reason = "manual") {
  appData.backups = withEntry(appData.backups, backupEntry(reason));
  save();
}

// Bring data back. `incoming` is the data of a backup or of a data file, validated beforehand.
// "replace" makes the data the incoming data; "merge" adds it to the data (the incoming version of
// a record both have). `scheduled` says what happens to the scheduled payments of the incoming
// data: "count" takes them over, so what came due since is added; "skip" takes them over and lets
// what came due since go; "none" leaves the scheduled payments as they are now. The list of
// backups stays as it is, and so do the settings after a merge.
// The result is checked as a whole before anything changes; `safety` makes a backup of the current
// data first. If the result cannot be stored, the data stays as it was and an error is thrown.
export function restoreData(incoming, { mode, scheduled, safety = false }) {
  const plan = planRestore(appData, incoming, { mode, scheduled });
  if (plan.problem) throw Error(describeProblem(plan.problem));
  const before = appData;
  const { next } = plan;
  if (safety) next.backups = withEntry(before.backups, backupEntry("safety"));
  setAppData(next);
  resolveLoadProblem();
  if (mode === "replace") {
    uiState.filters = emptyFilters();
    uiState.selected = [];
  }
  if (scheduled === "skip")
    for (const item of appData.scheduled.filter((x) => x.date <= today()))
      settleMissed(item.id, false);
  if (!save()) {
    setAppData(before);
    throw Error(translate("The data could not be stored, so nothing was changed."));
  }
  return plan.summary;
}

// Bring a saved backup back.
export const restoreBackup = (backup, options) => restoreData(backup.data, options);

// Delete every saved backup.
export function deleteAllBackups() {
  appData.backups = [];
  save();
}
