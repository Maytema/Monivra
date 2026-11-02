/* Import and export (JSON, CSV) */
import { render } from "../app/shell.js";
import { APP_ID, deepClone } from "../core/constants.js";
import { appData, emptyFilters, setAppData, uiState } from "../core/state.js";
import { csvTemplate, prepareCSV } from "./csv.js";
import { completeData } from "./defaults.js";
import { pickFile, saveTextFile, shareTextFile } from "../platform/files.js";
import { findDataProblem, save } from "./storage.js";
import { createBackup, dataSnapshot } from "../domain/backups.js";
import { translate, translateWith } from "../i18n/index.js";
import { goHome, openPage } from "../ui/navigation.js";
import { confirmAction, showInfo } from "../ui/dialogs.js";
import { buttonHtml, menuRowHtml, pageHeader, toast } from "../ui/primitives.js";
import { openExport } from "../screens/export.js";

function download(name, content, type) {
  saveTextFile(name, content, type);
  toast("File prepared");
}
// Export the whole dataset as a JSON backup.
const backupText = () => JSON.stringify(dataSnapshot(), null, 2);
function exportJSON() {
  download(`${APP_ID}-data.json`, backupText(), "application/json");
}
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Let the person choose a data file (JSON backup or CSV) and offer to import it.
async function importFile(kind) {
  const file = await pickFile({ accept: kind === "csv" ? ".csv" : ".json" });
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES)
    return showInfo("The file is larger than the 20 MB import limit.", "Import failed");
  try {
    const text = await file.text();
    if (kind === "csv") offerCsvImport(text);
    else offerBackupImport(text);
  } catch (error) {
    showInfo(error.message, "Import failed");
    console.error("Import failed:", error);
  }
}
// Data page: backups, data file export/import and reset.
export function dataView() {
  return (
    pageHeader("Data") +
    `<div class="content flush data-menu">${menuRowHtml("Saved backups", "archive", () => openPage("savedBackups"), "Create and restore data from automatic local copies")}${menuRowHtml(
      "Data file",
      "receipt",
      () => openPage("dataFile"),
      "Create and restore data from a manual backup file",
    )}${menuRowHtml(
      "Import data",
      "upload",
      () => openPage("importData"),
      "Import data from a file",
    )}${menuRowHtml(
      "Export data",
      "download",
      openExport,
      "Save a copy of your data as a file",
    )}${menuRowHtml(
      "Delete my data",
      "trash",
      () => openPage("deletion"),
      "Permanently delete all data",
    )}</div>`
  );
}
// Page of the data file: a copy of everything in the format of this application.
export function dataFileView() {
  return (
    pageHeader("Data file") +
    `<div class="content info-text"><p>Back up your data to keep it safe or move it to another device.</p><p>This file format is specific to this application: other applications cannot open it. To use your data elsewhere, go to Export data.</p></div><div class="page-footer">${buttonHtml("Export and share", () => shareTextFile(`${APP_ID}-data.json`, backupText(), "application/json"), "secondary")}${buttonHtml("Export and save", exportJSON, "secondary")}<hr>${buttonHtml("Restore from file", () => importFile("json"), "outline")}</div>`
  );
}
// Page of the import of operations from another application as a CSV file.
export function importDataView() {
  return (
    pageHeader("Import data") +
    `<div class="content info-text roomy tight"><p>Before exporting data from another application, we recommend switching that application to English.</p><p>Some applications translate the data they export (headers, names of operation types and so on). This may interfere with correct recognition of the data.</p><hr><p>Importing may create duplicate operations, accounts and categories.</p><p>Before the imported data is saved, a backup of the current data is made. You will be able to restore the data from it.</p></div><div class="page-footer">${buttonHtml("Select CSV file", () => importFile("csv"), "primary")}${buttonHtml("Download template", () => download(`${APP_ID}-template.csv`, "\ufeff" + csvTemplate(), "text/csv;charset=utf-8"), "outline")}</div>`
  );
}
// The reason of a damaged backup as one short sentence for the person.
// Headings of the backup sections, as the person sees them elsewhere in the app.
const SECTION_NAMES = {
  accounts: "Accounts",
  categories: "Categories",
  ops: "Operations",
  tags: "Tags",
  scheduled: "Scheduled payments",
  budgets: "Budgets",
  backups: "Backups",
};
function describeProblem({ what, number, reason }) {
  const text = translate(reason);
  if (what === "File") return text.charAt(0).toUpperCase() + text.slice(1);
  if (SECTION_NAMES[number])
    return `${translate(what)} «${translate(SECTION_NAMES[number])}»: ${text}`;
  return `${translate(what)} ${number || ""}`.trim() + ": " + text;
}
// Read a JSON backup; a damaged or foreign file is explained and refused.
function parseBackup(text) {
  if (!text.trim()) throw Error(translate("The file is empty."));
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(translate("The file is damaged or is not a JSON file."));
  }
  const found = findDataProblem(data);
  if (found) throw Error(describeProblem(found));
  return data;
}
function offerCsvImport(text) {
  const { ops, created, duplicates } = prepareCSV(text);
  const createdCount = created.accounts.length + created.categories.length;
  confirmAction(
    translateWith("Append {n} operations from this CSV?", { n: ops.length }) +
      (createdCount
        ? " " + translateWith("{n} accounts and categories will be created.", { n: createdCount })
        : "") +
      (duplicates ? " " + translateWith("{n} duplicates are skipped.", { n: duplicates }) : ""),
    () => {
      createBackup();
      appData.accounts.push(...created.accounts);
      appData.categories.push(...created.categories);
      appData.ops.push(...ops);
      for (const op of ops)
        for (const tag of op.tags) if (!appData.tags.includes(tag)) appData.tags.push(tag);
      save();
      toast("CSV imported");
      render();
    },
    false,
    "Apply",
  );
}

function offerBackupImport(text) {
  const data = parseBackup(text);
  confirmAction(
    translateWith(
      "Replace existing data with {accounts} accounts, {categories} categories and {ops} operations from this file?",
      {
        accounts: data.accounts.length,
        categories: data.categories.length,
        ops: data.ops.length,
      },
    ),
    () => {
      const backups = deepClone(appData.backups);
      setAppData(completeData(deepClone(data)));
      appData.backups = backups;
      uiState.filters = emptyFilters();
      save();
      goHome("more");
      toast("Data imported");
    },
    true,
    "Apply",
  );
}
