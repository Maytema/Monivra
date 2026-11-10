/* The Data section: its menu page, the data file page, and the import of a CSV file */
import { MAX_FILE_BYTES, parseBackupFile } from "./backup-file.js";
import { pickFile } from "../platform/files.js";
import { iconSvg } from "../core/constants.js";
import { translate } from "../i18n/index.js";
import { openPage } from "../ui/navigation.js";
import { showInfo } from "../ui/dialogs.js";
import { dataFile, saveDelivery, shareDelivery } from "../ui/file-actions.js";
import { buttonHtml, menuRowHtml, pageHeader } from "../ui/primitives.js";
import { openExport } from "../screens/export.js";
import { openFileRestore } from "../screens/more/backup-pages.js";
import { startImport } from "../screens/import-wizard.js";

// Lets the person choose a data file (JSON); it opens the page where it is looked at and restored.
async function restoreFromFile() {
  const file = await pickFile({ accept: ".json,application/json" });
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
    `<div class="content info-text"><p>Keep a copy of your data, or move it to another device. The file opens in Monivra only; to use your data in a spreadsheet, choose Export data.</p></div><div class="page-footer">${buttonHtml("Restore from file", restoreFromFile, "primary")}<div class="file-actions">${buttonHtml(`${iconSvg("share", 22)}<span>${translate("Share")}</span>`, () => shareDelivery(dataFile()), "file-action")}${buttonHtml(`${iconSvg("save", 22)}<span>${translate("Save")}</span>`, () => saveDelivery(dataFile()), "file-action")}</div></div>`
  );
}
// Page of the import of operations from another application as a CSV file.
export function importDataView() {
  return (
    pageHeader("Import data") +
    `<div class="content info-text roomy tight"><p>Bring operations from another application as a CSV file. Before exporting there, switch that application to English: translated headers and names may not be recognised.</p><p>You match the columns and your accounts and categories, and see what will be added before anything changes. Rows already in your data are skipped, and a backup is made before the import.</p></div><div class="page-footer">${buttonHtml("Select CSV file", startImport, "primary")}${buttonHtml("View example", () => openPage("importExample"), "outline")}</div>`
  );
}
