/* Import and export (JSON, CSV) */
import { render } from "../app/shell.js";
import { deepClone } from "../core/constants.js";
import { appData, importKind, setAppData, setImportKind, uiState } from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { csvText, prepareCSV } from "./csv.js";
import { createEmptyData } from "./defaults.js";
import { printReport } from "./report.js";
import { isValidData, save } from "./storage.js";
import { dataSnapshot } from "../domain/finance.js";
import { translateWith } from "../i18n/index.js";
import {
  closeLayers,
  confirmAction,
  goHome,
  openPage,
  openSheet,
  pageHeader,
  promptText,
} from "../ui/kit.js";
import { menuRowHtml, toast } from "../ui/primitives.js";

// Trigger a file download from text content.
export function download(name, content, type) {
  if (isTestMode()) {
    window.__download = { name, content, type };
    toast("File prepared");
    return;
  }
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("File prepared");
}
// Export the whole dataset as a JSON backup.
export function exportJSON() {
  download("monivra-data.json", JSON.stringify(dataSnapshot(), null, 2), "application/json");
}
// Open the file chooser for JSON/CSV import.
function importFile(kind) {
  setImportKind(kind);
  if (isTestMode()) return toast("File picker requested");
  const e = document.getElementById("import-file");
  e.accept = kind === "csv" ? ".csv" : ".json";
  e.value = "";
  e.click();
}
// Data page: backups, data file export/import and reset.
export function dataView() {
  return (
    pageHeader("Data") +
    `<div class="content flush data-menu">${menuRowHtml("Saved backups", "archive", () => openPage("backups"))}${menuRowHtml(
      "Data file",
      "receipt",
      () =>
        openSheet(
          () =>
            `<h2>Data file</h2><p>Save a local copy of your Monivra beta data or restore a previously exported JSON file.</p>${menuRowHtml(
              "Save data file",
              "download",
              () => {
                closeLayers();
                exportJSON();
              },
            )}${menuRowHtml("Restore data file", "upload", () => {
              closeLayers();
              importFile("json");
            })}`,
          "Data file",
        ),
    )}${menuRowHtml("Import data", "upload", () =>
      openSheet(
        () =>
          `<h2>Import data</h2><p>Importing data may change your existing records. Export a backup first.</p>${menuRowHtml(
            "Import Monivra JSON",
            "upload",
            () => {
              closeLayers();
              importFile("json");
            },
          )}${menuRowHtml("Import operations CSV", "upload", () => {
            closeLayers();
            importFile("csv");
          })}`,
        "Import data",
      ),
    )}${menuRowHtml("Export data", "download", () =>
      openSheet(
        () =>
          `<h2>Export data</h2><p>Export a local file from this closed beta.</p>${menuRowHtml(
            "Complete data file (JSON)",
            "download",
            () => {
              closeLayers();
              exportJSON();
            },
          )}${menuRowHtml("Operations (CSV)", "download", () => {
            closeLayers();
            download("monivra-operations.csv", "\ufeff" + csvText(), "text/csv;charset=utf-8");
          })}${menuRowHtml("Report (PDF)", "receipt", () => {
            closeLayers();
            printReport();
          })}`,
        "Export data",
      ),
    )}${menuRowHtml("Delete my data", "trash", () => {
      promptText("Type DELETE to erase all financial data", "", (v) => {
        if (v.trim() !== "DELETE") {
          toast("Deletion cancelled: type DELETE exactly");
          return;
        }
        confirmAction(
          "Permanently delete all accounts, categories, transactions, schedules and budgets?",
          () => {
            setAppData(createEmptyData());
            save();
            goHome("accounts");
          },
          true,
          "Delete",
        );
      });
    })}<p class="footnote">All exports and imports are handled on this device. This beta does not provide cloud backup or account synchronization.</p></div>`
  );
}
// Apply a selected import file after confirmation.
export function handleImport(text) {
  if (importKind === "csv") {
    const { ops, created, duplicates } = prepareCSV(text);
    const news = created.accounts.length + created.categories.length;
    confirmAction(
      translateWith("Append {n} operations from this CSV?", { n: ops.length }) +
        (news
          ? " " + translateWith("{n} accounts and categories will be created.", { n: news })
          : "") +
        (duplicates ? " " + translateWith("{n} duplicates are skipped.", { n: duplicates }) : ""),
      () => {
        appData.accounts.push(...created.accounts);
        appData.categories.push(...created.categories);
        appData.ops.push(...ops);
        for (const o of ops)
          for (const tag of o.tags) if (!appData.tags.includes(tag)) appData.tags.push(tag);
        save();
        toast("CSV imported");
        render();
      },
      true,
      "Apply",
    );
  } else {
    const data = JSON.parse(text);
    if (!isValidData(data))
      throw Error(
        "The selected JSON does not match the Monivra backup format. Check the file and try again.",
      );
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
        setAppData(deepClone(data));
        appData.backups = backups;
        uiState.filters = {
          accounts: null,
          categories: null,
          types: null,
          tags: null,
          comment: "",
        };
        save();
        goHome("more");
        toast("Data imported");
      },
      true,
      "Apply",
    );
  }
}
