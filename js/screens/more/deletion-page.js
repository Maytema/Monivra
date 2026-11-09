/* Deletion page: the ways to delete data, each with how much of it goes */
import { appData } from "../../core/state.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { DELETIONS, deleteData } from "../../domain/deletion.js";
import { translate, translateCount, translateWith } from "../../i18n/index.js";
import { dataFile, saveDelivery } from "../../ui/file-actions.js";
import { registerInput } from "../../ui/handlers.js";
import { closeLayers, goHome, openSheet } from "../../ui/navigation.js";
import { buttonHtml, menuRowHtml, pageHeader, toast } from "../../ui/primitives.js";

// The kinds of data, with the number held and the counted wording in both forms.
const KINDS = {
  accounts: [(d) => d.accounts.length, "{n} account", "{n} accounts"],
  categories: [(d) => d.categories.length, "{n} category", "{n} categories"],
  ops: [(d) => d.ops.length, "{n} operation", "{n} operations"],
  tags: [(d) => d.tags.length, "{n} tag", "{n} tags"],
  scheduled: [(d) => d.scheduled.length, "{n} scheduled payment", "{n} scheduled payments"],
  budgets: [(d) => d.budgets.length, "{n} budget", "{n} budgets"],
  backups: [(d) => d.backups.length, "{n} backup", "{n} backups"],
};
// "5 accounts, 14 categories and 44 operations": what of the chosen kinds exists, nothing for zero.
const countedList = (data, kinds) => {
  const parts = kinds
    .map((kind) => {
      const [count, one, other] = KINDS[kind];
      return count(data) ? translateCount(one, other, count(data)) : "";
    })
    .filter(Boolean);
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${translate("and")} ${parts.at(-1)}`;
};

// The text of the question: what goes, with the counts, and the settings when they go too.
function questionText(list, settings) {
  if (!settings) return translateWith("{list} will be deleted. This cannot be undone.", { list });
  return list
    ? translateWith("{list}, settings and reminders will be deleted. This cannot be undone.", {
        list,
      })
    : translate("Settings and reminders will be deleted. This cannot be undone.");
}

// The dialog before a deletion: what goes, what it does to the rest, and the safeguards that fit
// the way. Where nothing can bring the data back the person has to write a word to go on.
function askToDelete(id) {
  const way = DELETIONS[id];
  const list = countedList(appData, way.kinds);
  if (!list && !way.settings) return toast("There is nothing to delete");
  const word = translate("DELETE");
  // A copy in the backups is offered switched on: it is the way back from the deletion.
  let backup = Boolean(way.backup);
  let typed = "";
  const ready = () => !way.typed || typed.trim().toLowerCase() === word.toLowerCase();
  const run = () => {
    if (!ready()) return;
    closeLayers();
    try {
      deleteData(id, { backup });
      goHome("accounts");
      toast("Data deleted");
    } catch (error) {
      toast(error.message);
    }
  };
  openSheet(
    () =>
      `<div class="confirm-icon warning">${iconSvg("warning", 32)}</div><h2>${translate(way.title)}</h2><p class="confirm-message">${escapeHtml(questionText(list, way.settings))}</p><ul class="restore-changes">${way.effects.map((line) => `<li>${translate(line)}</li>`).join("")}</ul>${
        way.backup
          ? `<label class="checkrow"><input type="checkbox" ${backup ? "checked" : ""} data-input="${registerInput((v) => (backup = v))}"><span>${translate("Create a backup first")}</span></label>`
          : ""
      }${way.file ? buttonHtml("Save a data file first", () => saveDelivery(dataFile()), "outline") : ""}${
        way.typed
          ? `<label class="confirm-word"><small>${escapeHtml(translateWith("To go on, write {word}", { word }))}</small><input aria-label="${escapeHtml(translate("Confirmation word"))}" autocomplete="off" autocapitalize="characters" value="${escapeHtml(typed)}" data-input="${registerInput(
              (v) => {
                typed = v;
                // Only the button changes, so the field keeps its place and the keyboard stays.
                const button = document.querySelector("[data-delete-button]");
                if (button) button.disabled = !ready();
              },
            )}"></label>`
          : ""
      }${buttonHtml("Delete", run, "danger", `data-delete-button ${ready() ? "" : "disabled"}`)}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    way.title,
    "dialog",
  );
}

// The line under a way: its own text, or what it deletes with the counts.
const noteOf = (way) =>
  way.note || countedList(appData, way.kinds) || translate("There is nothing to delete");

export function deletionView() {
  return (
    pageHeader("Deletion") +
    `<div class="content flush"><p class="deletion-intro">${translate("Deleted data cannot be restored.")}</p>${Object.entries(
      DELETIONS,
    )
      .map(([id, way]) => menuRowHtml(way.title, "trash", () => askToDelete(id), noteOf(way), ""))
      .join("")}</div>`
  );
}
