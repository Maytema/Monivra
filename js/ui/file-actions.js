/* global DOMException */
/* Save, share and print of a prepared file, with the same wording and feedback everywhere */
import { render } from "../app/shell.js";
import { uiState } from "../core/state.js";
import { translate, translateWith } from "../i18n/index.js";
import { makeFile, printPages, saveFile, shareFile } from "../platform/files.js";
import { backupFileName, backupFileText, BACKUP_TYPE } from "../data/backup-file.js";
import { confirmAction, showInfo } from "./dialogs.js";
import { openSheet } from "./navigation.js";
import { escapeHtml } from "../core/constants.js";
import { buttonHtml, toast } from "./primitives.js";

// The data file as a file ready to be saved or shared.
export const dataFile = () => makeFile(backupFileName(), backupFileText(), BACKUP_TYPE);

// Writes the file where the device puts it (the save screen of the Android shell, the downloads of a
// browser). The toast comes only when the file was written: a closed save screen says nothing.
export async function saveDelivery(file) {
  const result = await saveFile(file);
  if (result === "saved") toast("File saved");
  else if (result === "failed") showInfo("The file could not be saved. Nothing was written.");
}

// Opens the share sheet with the file attached. Where the browser cannot share files, the person
// is told so and offered saving as a separate, visible choice; nothing is saved on its own.
export async function shareDelivery(file) {
  const result = await shareFile(file);
  if (result === "shared") toast("File shared");
  else if (result === "busy") return;
  else if (result === "unsupported")
    confirmAction(
      file.name.endsWith(".json")
        ? "Sharing this backup isn't available in your browser. Save the .json file, then share it from your phone's Files app."
        : "Sharing this file isn't available in your browser. Save it, then share it from your phone's Files app.",
      () => saveDelivery(file),
      false,
      "Save file",
      { tone: "info", title: "Sharing is not available" },
    );
  else if (result === "blocked")
    // The browser lets a share start only from a tap made a moment ago, and preparing took longer.
    // The file is ready, so this tap (a fresh one) shares it: one more tap, never a loop.
    confirmAction(
      "The file is ready. The browser asks for one more tap to open the share sheet.",
      () => shareDelivery(file),
      false,
      "Share",
      { tone: "info", title: "Ready to share" },
    );
  else if (result === "failed")
    showInfo("The share sheet could not be opened. The file has not been saved or sent.");
}

// Opens the print dialog: the system print service with the PDF in the Android shell, the pictures of
// the pages in a browser.
export async function printDelivery(urls, file = null) {
  try {
    await printPages(urls, file);
  } catch {
    showInfo("The print screen could not be opened. Nothing was printed.");
  }
}

// Runs a task that takes a while behind a small dialog that says what is going on; `task` is given a
// function to report the page it has reached and a signal that aborts. The dialog does not close by a
// tap outside it: it has a Cancel button (also the system Back key), and cancelling really stops the
// work (the task rejects with an AbortError). The dialog goes away when the task ends.
export async function withProgress(title, task) {
  let text = translate("Preparing…");
  const stop = new AbortController();
  const cancel = () => stop.abort(new DOMException("Cancelled", "AbortError"));
  openSheet(
    () =>
      `<h2>${escapeHtml(translate(title))}</h2><p class="confirm-message" role="status" aria-live="polite">${escapeHtml(text)}</p><div class="dialog-actions">${buttonHtml("Cancel", cancel, "text-button")}</div>`,
    title,
    "dialog",
  );
  const layer = uiState.layers.at(-1);
  layer.cancel = cancel; // Back and Escape cancel the work; a tap outside does nothing
  try {
    return await task((done, total) => {
      text = translateWith("Page {n} of {total}", { n: done, total });
      render();
    }, stop.signal);
  } finally {
    uiState.layers = uiState.layers.filter((l) => l !== layer);
    render();
  }
}
