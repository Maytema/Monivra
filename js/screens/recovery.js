/* Shown instead of the application when the stored data cannot be read. The stored text is neither
   changed nor deleted until the person decides what to do with it. */
import { render } from "../app/shell.js";
import { APP_ID, APP_NAME, escapeHtml } from "../core/constants.js";
import { loadProblem, resolveLoadProblem, setAppData, setFirstLaunch } from "../core/state.js";
import { newestBackupInside, parseBackupFile } from "../data/backup-file.js";
import { createEmptyData } from "../data/defaults.js";
import { describeProblem } from "../data/problems.js";
import { save } from "../data/storage.js";
import { makeFile, pickFile } from "../platform/files.js";
import { currentLocale, translate, translateWith } from "../i18n/index.js";
import { saveDelivery, shareDelivery } from "../ui/file-actions.js";
import { confirmAction, showInfo } from "../ui/dialogs.js";
import { buttonHtml } from "../ui/primitives.js";
import { openFileRestore } from "./more/backup-pages.js";

// The text kept from the stored data, as a file the person can keep or send.
const damagedFile = () =>
  makeFile(
    `${APP_ID}-unreadable-data-${new Date().toLocaleDateString("en-CA")}.json`,
    loadProblem.raw,
    "application/json",
  );

// Lets the person choose a data file to bring the data back from.
async function chooseFile() {
  const file = await pickFile({ accept: ".json,application/json" });
  if (!file) return;
  try {
    openFileRestore({ name: file.name, ...parseBackupFile(await file.text()) });
  } catch (error) {
    showInfo(error.message, "The file cannot be used");
  }
}

// Empty data replaces the unreadable text; a copy of the text stays in the storage of this browser.
function startAgain() {
  confirmAction(
    "Start with empty data? What could not be read stays on this device as a separate copy, but this application will no longer use it.",
    () => {
      resolveLoadProblem();
      setAppData(createEmptyData());
      setFirstLaunch(true);
      save();
      render(true);
    },
    false,
    "Start empty",
  );
}

export function recoveryView() {
  const inside = newestBackupInside(loadProblem.raw);
  return `<div class="welcome recovery"><h1>${translate("Your data could not be read")}</h1><p>${translateWith("{app} found data saved on this device but cannot open it. Nothing has been changed or deleted.", { app: APP_NAME })}</p><p class="caution">${escapeHtml(describeProblem(loadProblem.problem))}</p><p>${translate("First save a copy of the data, then choose how to continue.")}</p>${buttonHtml("Save a copy of the data", () => saveDelivery(damagedFile()), "primary")}${buttonHtml("Share the copy", () => shareDelivery(damagedFile()), "outline")}${
    inside
      ? buttonHtml(
          translateWith("Restore the newest backup kept inside ({date})", {
            date: new Date(inside.at).toLocaleString(currentLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          }),
          () =>
            openFileRestore({
              name: translate("Backup kept inside the data"),
              data: inside.data,
              meta: { build: "", exportedAt: inside.at },
            }),
          "outline",
        )
      : ""
  }${buttonHtml("Restore from a data file", chooseFile, "outline")}${buttonHtml("Start with empty data", startAgain, "text-button")}</div>`;
}
