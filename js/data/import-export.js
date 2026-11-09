/* The Data section: its menu page, the data file page, and the import of a CSV file */
import { csvExample, csvTemplate } from "./csv.js";
import { MAX_FILE_BYTES, parseBackupFile } from "./backup-file.js";
import { makeFile, pickFile } from "../platform/files.js";
import { openPage } from "../ui/navigation.js";
import { optionSheet, showInfo } from "../ui/dialogs.js";
import { dataFile, saveDelivery, shareDelivery } from "../ui/file-actions.js";
import { buttonHtml, menuRowHtml, pageHeader } from "../ui/primitives.js";
import { openExport } from "../screens/export.js";
import { openFileRestore } from "../screens/more/backup-pages.js";
import { startImport } from "../screens/import-wizard.js";
import { APP_ID } from "../core/constants.js";

// Lets the person choose a data file (JSON); it opens the page where it is looked at and restored.
async function restoreFromFile() {
  const file = await pickFile({ accept: ".json,.txt,application/json,text/plain" });
  if (!file) return;
  if (file.size > MAX_FILE_BYTES)
    return showInfo("The file is larger than the 20 MB import limit.", "Import failed");
  try {
    openFileRestore({ name: file.name, ...parseBackupFile(await file.text()) });
  } catch (error) {
    showInfo(error.message, "The file cannot be used");
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
    `<div class="content info-text"><p>Back up your data to keep it safe or move it to another device.</p><p>This file format is specific to this application: other applications cannot open it. To use your data elsewhere, go to Export data.</p></div><div class="page-footer">${buttonHtml("Share", () => shareDelivery(dataFile()), "secondary")}${buttonHtml("Save", () => saveDelivery(dataFile()), "secondary")}<hr>${buttonHtml("Restore from file", restoreFromFile, "outline")}</div>`
  );
}
// What the file of a template holds: the column names alone, or a few rows as examples.
const TEMPLATES = [
  ["empty", "Empty template", "Only the names of the columns, to fill in"],
  ["example", "Template with examples", "A row of every kind of operation to change"],
];
const downloadTemplate = (kind) =>
  saveDelivery(
    makeFile(
      `${APP_ID}-${kind === "empty" ? "template" : "import-example"}.csv`,
      "\ufeff" + (kind === "empty" ? csvTemplate() : csvExample()),
      "text/csv;charset=utf-8",
    ),
  );
// Page of the import of operations from another application as a CSV file.
export function importDataView() {
  return (
    pageHeader("Import data") +
    `<div class="content info-text roomy tight"><p>Before exporting data from another application, we recommend switching that application to English.</p><p>Some applications translate the data they export (headers, names of operation types and so on). This may interfere with correct recognition of the data.</p><hr><p>You choose which column of the file is which, link its accounts and categories to yours and see what would be added before anything changes.</p><p>Rows that are already in your data are left out. Before the imported data is saved, a backup of the current data is made. You will be able to restore the data from it.</p></div><div class="page-footer">${buttonHtml("Select CSV file", startImport, "primary")}${buttonHtml("View example", () => openPage("importExample"), "outline")}${buttonHtml("Download template", () => optionSheet("Download template", TEMPLATES, "", downloadTemplate), "outline")}</div>`
  );
}
