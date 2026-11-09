/* Save, share and print of a prepared file, with the same wording and feedback everywhere */
import { render } from "../app/shell.js";
import { uiState } from "../core/state.js";
import { translate, translateWith } from "../i18n/index.js";
import { canShareFile, makeFile, printPages, saveFile, shareFile } from "../platform/files.js";
import { backupFileName, backupFileText, BACKUP_TYPE } from "../data/backup-file.js";
import { confirmAction, showInfo } from "./dialogs.js";
import { openSheet } from "./navigation.js";
import { escapeHtml } from "../core/constants.js";
import { toast } from "./primitives.js";

// The data file as a file ready to be saved or shared.
export const dataFile = () => makeFile(backupFileName(), backupFileText(), BACKUP_TYPE);

// Writes the file into the downloads of the device.
export function saveDelivery(file) {
  saveFile(file);
  toast("File saved");
}

// Browsers hand only some kinds of files to the share sheet (PDF, CSV, text, pictures), not JSON.
// A data file that cannot go as it is goes as the same text under a name that ends in .txt.
const shareableForm = (file) =>
  canShareFile(file) || file.type !== "application/json"
    ? file
    : makeFile(`${file.name}.txt`, file, "text/plain");

// Opens the share sheet with the file attached. Where the browser cannot share files, the person
// is told so and offered saving as a separate, visible choice; nothing is saved on its own.
export async function shareDelivery(file) {
  const result = await shareFile(shareableForm(file));
  if (result === "shared") toast("File shared");
  else if (result === "unsupported")
    confirmAction(
      "This browser cannot send files to other apps. The file has not been saved. Save it on the device instead?",
      () => saveDelivery(file),
      false,
      "Save file",
      { tone: "info", title: "Sharing is not available" },
    );
  else if (result === "blocked")
    showInfo(
      "The browser needs a new tap to open the share sheet. The file is ready: tap Share again.",
      "Tap Share again",
    );
  else if (result === "failed")
    showInfo("The share sheet could not be opened. The file has not been saved or sent.");
}

// Opens the print dialog with the pictures of the pages.
export const printDelivery = (urls) => printPages(urls);

// Runs a task that takes a while behind a small dialog that says what is going on; `task` is given a
// function to report the page it has reached. The dialog goes away when the task ends.
export async function withProgress(title, task) {
  let text = translate("Preparing…");
  openSheet(
    () =>
      `<h2>${escapeHtml(translate(title))}</h2><p class="confirm-message">${escapeHtml(text)}</p>`,
    title,
    "dialog",
  );
  const layer = uiState.layers.at(-1);
  try {
    return await task((done, total) => {
      text = translateWith("Page {n} of {total}", { n: done, total });
      render();
    });
  } finally {
    uiState.layers = uiState.layers.filter((l) => l !== layer);
    render();
  }
}
