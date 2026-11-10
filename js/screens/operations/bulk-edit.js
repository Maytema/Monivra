/* Selection mode of the operations list: delete, change the date, edit many at once */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg, TODAY } from "../../core/constants.js";
import { appData, uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { accountById, categoryById, dateLabelCompact } from "../../domain/finance.js";
import { applyBulkChanges, bulkAccountProblem, emptyBulkChanges } from "../../domain/operations.js";
import { translate, translateCount } from "../../i18n/index.js";
import { accountPicker, categoryPicker } from "../pickers.js";
import { calendar } from "../../ui/calendar.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { confirmAction, promptText } from "../../ui/dialogs.js";
import { buttonHtml, iconButtonHtml, sheetFooterHtml, toast } from "../../ui/primitives.js";
import { registerInput } from "../../ui/handlers.js";

// Message after a bulk change; operations moved to a future date went to the scheduled payments.
function reportChange(planned) {
  toast(
    planned
      ? translateCount(
          "{n} operation moved to scheduled payments",
          "{n} operations moved to scheduled payments",
          planned,
        )
      : "Operations updated",
  );
}

// Delete / change date / more buttons shown in selection mode.
export function selectionActions() {
  const changeDate = () => {
    if (!uiState.selected.length) return toast("Select operations");
    calendar(TODAY, (date) => {
      reportChange(applyBulkChanges(uiState.selected, { ...emptyBulkChanges(), date }));
      render();
    });
  };
  return `<div class="operations-selection-actions">${buttonHtml(iconSvg("trash", 21) + " Delete", bulkDeleteOperations, "selection-action")}${buttonHtml(iconSvg("calendar", 21) + " Date", changeDate, "selection-action")}${buttonHtml(iconSvg("more", 21) + " More", bulkEdit, "selection-action")}</div>`;
}

// Delete all selected operations.
function bulkDeleteOperations() {
  if (!uiState.selected.length) return toast("Select operations");
  confirmAction(
    "Delete selected operations?",
    () => {
      appData.ops = appData.ops.filter((o) => !uiState.selected.includes(o.id));
      uiState.selected = [];
      uiState.selection = false;
      save();
      render();
    },
    true,
    "Delete",
  );
}

const tagsSummary = (changes) => {
  if (changes.clearTags) return translate("Clear all");
  return [...changes.addTags, ...changes.removeTags].join(", ");
};

// The tags to add and to remove as separate readable chips (the values are shown as they are).
const tagsSummaryHtml = (changes) => {
  if (changes.clearTags) return escapeHtml(translate("Clear all"));
  const group = (label, tags, cls) =>
    tags.length
      ? `<span class="bulk-tag-group"><small>${translate(label)}</small>${tags.map((t) => `<span class="tag-chip ${cls}">${escapeHtml(t)}</span>`).join("")}</span>`
      : "";
  return group("Add", changes.addTags, "") + group("Remove", changes.removeTags, "removed");
};

const DAY_MS = 86400000;
// The target date of a bulk date change: a short date and, when all the selected operations have
// one date, how far it is from it. With different dates there is no single direction to name, so
// only the target date is shown.
function dateSummary(date, selected) {
  if (!date) return "";
  const shown = dateLabelCompact(date);
  const originals = [...new Set(selected.map((o) => o.date))];
  if (originals.length !== 1) return shown;
  const days = Math.round((Date.parse(date) - Date.parse(originals[0])) / DAY_MS);
  if (!days) return `${shown} · ${translate("same date")}`;
  return `${shown} · ${
    days > 0
      ? translateCount("{n} day later", "{n} days later", days)
      : translateCount("{n} day earlier", "{n} days earlier", -days)
  }`;
}

// Row with a title, the chosen value (or "No changes") and a cross that clears it.
function changeRowHtml(label, icon, value, open, clear, valueHtml = null) {
  const shown = value ? (valueHtml ?? escapeHtml(value)) : translate("No changes");
  const clearButton = value
    ? iconButtonHtml("close", "Clear", () => {
        clear();
        render();
      })
    : "";
  return `<div class="bulk-row">${buttonHtml(
    `<span class="bulk-label">${iconSvg(icon, 16)} ${translate(label)}</span><span class="bulk-value ${value ? "" : "muted"}">${shown}</span>`,
    open,
    "bulk-field",
  )}${clearButton}</div>`;
}

// Which account of a transfer is replaced.
function askTransferRole(changes) {
  const choose = (role) => () => {
    const problem = bulkAccountProblem(uiState.selected, changes.account, role);
    closeLayers();
    if (problem) {
      changes.account = null;
      return toast(problem);
    }
    changes.role = role;
  };
  const cancel = () => {
    changes.account = null;
    closeLayers();
  };
  openSheet(
    () =>
      `<h2>${translate("For transfers")}</h2><p>${translate("For transfer operations, which account to replace?")}</p>${buttonHtml("Sender", choose("sender"), "primary")}${buttonHtml("Receiver", choose("receiver"), "primary")}${buttonHtml("Cancel", cancel, "outline")}`,
    "For transfers",
    "dialog",
  );
}

const toggled = (list, tag) =>
  list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];

function tagChipsHtml(chosen, names, onTap) {
  return names
    .map((tag) =>
      buttonHtml(
        escapeHtml(tag),
        () => onTap(tag),
        "tag " + (chosen.includes(tag) ? "active" : ""),
      ),
    )
    .join("");
}

// Tags to add to and to remove from the selected operations.
function chooseTags(changes, selected) {
  const picked = {
    add: [...changes.addTags],
    remove: [...changes.removeTags],
    clear: changes.clearTags,
  };
  const used = [...new Set(selected.flatMap((o) => o.tags || []))];
  const toggleAdded = (tag) => {
    picked.add = toggled(picked.add, tag);
    picked.remove = picked.remove.filter((x) => x !== tag);
    picked.clear = false;
    render();
  };
  const toggleRemoved = (tag) => {
    picked.remove = toggled(picked.remove, tag);
    picked.add = picked.add.filter((x) => x !== tag);
    picked.clear = false;
    render();
  };
  const toggleClear = () => {
    picked.clear = !picked.clear;
    if (picked.clear) {
      picked.add = [];
      picked.remove = [];
    }
    render();
  };
  const createTag = () =>
    promptText(
      "New tag",
      "",
      (value) => {
        const name = value.trim();
        if (!name) return toast("Enter a tag");
        if (!appData.tags.includes(name)) appData.tags.push(name);
        picked.add = [...new Set([...picked.add, name])];
        picked.clear = false;
        save();
        render();
      },
      "Tag name",
    );
  const complete = () => {
    changes.addTags = picked.add;
    changes.removeTags = picked.remove;
    changes.clearTags = picked.clear;
    closeLayers();
    render();
  };
  openSheet(
    () =>
      `<h2>${translate("Tags")}</h2><div class="bulk-tags-title">${translate("Add")}</div><div class="tag-cloud">${tagChipsHtml(picked.add, appData.tags, toggleAdded)}${buttonHtml(`${iconSvg("plus", 14)} ${translate("Add")}`, createTag, "tag tag-add")}</div><div class="bulk-tags-title">${translate("Remove")}</div><div class="tag-cloud">${tagChipsHtml(picked.remove, used, toggleRemoved)}${buttonHtml(`${iconSvg("trash", 14)} ${translate("Clear all")}`, toggleClear, "tag tag-clear " + (picked.clear ? "active" : ""))}</div>${sheetFooterHtml(buttonHtml("Complete", complete, "primary"))}`,
    "Tags",
  );
}

// Write one comment for all selected operations, or remove their comments with a separate button.
function chooseComment(changes) {
  let text = changes.comment || "";
  const complete = () => {
    if (!text.trim()) return toast("Enter a comment");
    changes.comment = text;
    closeLayers();
    render();
  };
  const removeComments = () => {
    changes.comment = "";
    closeLayers();
    render();
  };
  openSheet(
    () =>
      `<h2>${translate("Comment")}</h2><p class="muted">${translate("The comment replaces the existing comment of every selected operation.")}</p><label><small>${translate("Add a comment")}</small><input aria-label="${escapeHtml(translate("Comment"))}" value="${escapeHtml(text)}" data-input="${registerInput((value) => (text = value))}"></label>${sheetFooterHtml(
        buttonHtml(
          `${iconSvg("trash", 14)} ${translate("Remove comments")}`,
          removeComments,
          "outline",
        ),
        buttonHtml("Complete", complete, "primary"),
      )}`,
    "Comment",
  );
}

// Edit the selected operations at once.
function bulkEdit() {
  if (!uiState.selected.length) return toast("Select operations");
  const selected = appData.ops.filter((o) => uiState.selected.includes(o.id));
  const changes = emptyBulkChanges();
  const hasTransfers = selected.some((o) => o.type === "transfer");
  const chooseCategory = () =>
    categoryPicker(categoryById(changes.category)?.type || "expense", changes.category, (id) => {
      changes.category = id;
      render();
    });
  const chooseAccount = () =>
    // The picker closes itself: closing here too would close this window and lose the choice.
    accountPicker(changes.account, (id) => {
      const problem = bulkAccountProblem(
        uiState.selected,
        id,
        hasTransfers ? "receiver" : "sender",
      );
      if (problem && !hasTransfers) return toast(problem);
      changes.account = id;
      if (hasTransfers) askTransferRole(changes);
      else render();
    });
  const chooseDate = () =>
    calendar(changes.date || TODAY, (date) => {
      changes.date = date;
      render();
    });
  const clearTags = () => {
    changes.addTags = [];
    changes.removeTags = [];
    changes.clearTags = false;
  };
  const apply = () => {
    const planned = applyBulkChanges(uiState.selected, changes);
    uiState.selection = false;
    uiState.selected = [];
    closeLayers();
    reportChange(planned);
  };
  const confirm = () =>
    confirmAction(
      "The selected changes will be applied to all selected operations.",
      apply,
      true,
      "Confirm",
    );
  // Computed at every render: the sheet is drawn again after each choice, so a value fixed once
  // would stay "No changes".
  const commentShown = () =>
    changes.comment === null ? "" : changes.comment || translate("Remove comments");
  openSheet(
    () =>
      `<h2>${translate("Bulk edit")}</h2>${changeRowHtml("Category", "categories", categoryById(changes.category)?.name, chooseCategory, () => (changes.category = null))}${changeRowHtml("Account", "wallet", accountById(changes.account)?.name, chooseAccount, () => (changes.account = null))}${changeRowHtml(
        "Comment",
        "comment",
        commentShown(),
        () => chooseComment(changes),
        () => (changes.comment = null),
      )}${changeRowHtml("Tags", "tag", tagsSummary(changes), () => chooseTags(changes, selected), clearTags, tagsSummaryHtml(changes))}${changeRowHtml("Date", "calendar", dateSummary(changes.date, selected), chooseDate, () => (changes.date = null))}${sheetFooterHtml(
        buttonHtml("Cancel", () => closeLayers(), "outline"),
        buttonHtml("Confirm", confirm, "primary"),
      )}`,
    "Bulk edit",
  );
}
