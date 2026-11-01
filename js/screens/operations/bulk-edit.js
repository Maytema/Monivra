import { render } from "../../app/shell.js";
import { deepClone, escapeHtml, iconSvg, TODAY } from "../../core/constants.js";
import { appData, uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { accountById, categoryById, dateLabel } from "../../domain/finance.js";
import { validateOp } from "../../domain/operations.js";
import { translate } from "../../i18n/index.js";
import { accountPicker, categoryPicker } from "../pickers.js";
import { calendar } from "../../ui/calendar.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { confirmAction, promptText } from "../../ui/dialogs.js";
import { buttonHtml, iconButtonHtml, toast } from "../../ui/primitives.js";
import { registerInput } from "../../ui/handlers.js";

// Delete / change date / more buttons shown in selection mode.
export function selectionActions() {
  const changeDate = () => {
    if (!uiState.selected.length) return toast("Select operations");
    calendar(TODAY, (date) => {
      appData.ops.filter((o) => uiState.selected.includes(o.id)).forEach((o) => (o.date = date));
      save();
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

// Edit the selected operations at once.
function bulkEdit() {
  if (!uiState.selected.length) return toast("Select operations");
  const selected = appData.ops.filter((o) => uiState.selected.includes(o.id));
  const d = {
    category: null,
    account: null,
    role: "sender",
    comment: null,
    addTags: [],
    removeTags: [],
    clearTags: false,
    date: null,
  };
  const hasTransfers = selected.some((o) => o.type === "transfer");
  const tagsLabel = () => {
    if (d.clearTags) return translate("Clear all");
    const parts = [...d.addTags.map((t) => "+" + t), ...d.removeTags.map((t) => "−" + t)];
    return parts.length ? parts.join(", ") : "";
  };
  // Row with a title, the chosen value (or "No changes") and a cross that clears it.
  const row = (label, icon, value, open, clear) =>
    `<div class="bulk-row">${buttonHtml(
      `<span class="bulk-label">${iconSvg(icon, 16)} ${translate(label)}</span><span class="bulk-value ${value ? "" : "muted"}">${value ? escapeHtml(value) : translate("No changes")}</span>`,
      open,
      "bulk-field",
    )}${value ? iconButtonHtml("close", "Clear", () => (clear(), render())) : ""}</div>`;
  // Which account of a transfer is replaced.
  const askRole = () =>
    openSheet(
      () =>
        `<h2>${translate("For transfers")}</h2><p>${translate("For transfer operations, which account to replace?")}</p>${buttonHtml(
          "Sender",
          () => {
            d.role = "sender";
            closeLayers();
          },
          "primary",
        )}${buttonHtml(
          "Receiver",
          () => {
            d.role = "receiver";
            closeLayers();
          },
          "primary",
        )}${buttonHtml(
          "Cancel",
          () => {
            d.account = null;
            closeLayers();
          },
          "outline",
        )}`,
      "For transfers",
      "dialog",
    );
  const chooseTags = () => {
    const draft = { add: [...d.addTags], remove: [...d.removeTags], clear: d.clearTags };
    const used = [...new Set(selected.flatMap((o) => o.tags || []))];
    const toggle = (list, tag) =>
      list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];
    const chips = (list, names, onTap) =>
      names
        .map((tag) =>
          buttonHtml(
            escapeHtml(tag),
            () => onTap(tag),
            "tag " + (list.includes(tag) ? "active" : ""),
          ),
        )
        .join("");
    openSheet(
      () =>
        `<h2>${translate("Tags")}</h2><div class="bulk-tags-title">${translate("Add")}</div><div class="tag-cloud">${chips(
          draft.add,
          appData.tags,
          (tag) => {
            draft.add = toggle(draft.add, tag);
            draft.remove = draft.remove.filter((x) => x !== tag);
            draft.clear = false;
            render();
          },
        )}${buttonHtml(
          `${iconSvg("plus", 14)} ${translate("Add")}`,
          () =>
            promptText(
              "New tag",
              "",
              (v) => {
                const name = v.trim();
                if (!name) return toast("Enter a tag");
                if (!appData.tags.includes(name)) appData.tags.push(name);
                draft.add = [...new Set([...draft.add, name])];
                draft.clear = false;
                save();
                render();
              },
              "Tag name",
            ),
          "tag tag-add",
        )}</div><div class="bulk-tags-title">${translate("Remove")}</div><div class="tag-cloud">${chips(
          draft.remove,
          used,
          (tag) => {
            draft.remove = toggle(draft.remove, tag);
            draft.add = draft.add.filter((x) => x !== tag);
            draft.clear = false;
            render();
          },
        )}${buttonHtml(
          `${iconSvg("trash", 14)} ${translate("Clear all")}`,
          () => {
            draft.clear = !draft.clear;
            if (draft.clear) {
              draft.add = [];
              draft.remove = [];
            }
            render();
          },
          "tag tag-clear " + (draft.clear ? "active" : ""),
        )}</div>${buttonHtml(
          "Complete",
          () => {
            d.addTags = draft.add;
            d.removeTags = draft.remove;
            d.clearTags = draft.clear;
            closeLayers();
            render();
          },
          "primary",
        )}`,
      "Tags",
    );
  };
  // Write one comment for all selected operations, or remove their comments with a separate button.
  const chooseComment = () => {
    let text = d.comment || "";
    openSheet(
      () =>
        `<h2>${translate("Comment")}</h2><label><small>${translate("Add a comment")}</small><input aria-label="${escapeHtml(translate("Comment"))}" value="${escapeHtml(text)}" data-input="${registerInput((v) => (text = v))}"></label>${buttonHtml(
          "Complete",
          () => {
            if (!text.trim()) return toast("Enter a comment");
            d.comment = text;
            closeLayers();
            render();
          },
          "primary",
        )}${buttonHtml(
          `${iconSvg("trash", 14)} ${translate("Remove comments")}`,
          () => {
            d.comment = "";
            closeLayers();
            render();
          },
          "outline",
        )}`,
      "Comment",
    );
  };
  const apply = () => {
    const replacements = selected.map((o) => {
      const n = deepClone(o);
      // A balance adjustment has no category and keeps its direction; only the account may change.
      const adjustment = n.type === "adjustment";
      if (d.category && n.type !== "transfer" && !adjustment) {
        n.category = d.category;
        const a = n.from || n.to;
        n.type = categoryById(d.category).type;
        n.from = n.type === "expense" ? a : null;
        n.to = n.type === "income" ? a : null;
      }
      if (d.account) {
        if (n.type === "transfer") n[d.role === "receiver" ? "to" : "from"] = d.account;
        else if (adjustment) n[n.to ? "to" : "from"] = d.account;
        else if (n.type === "income") n.to = d.account;
        else n.from = d.account;
      }
      if (d.date) n.date = d.date;
      if (d.comment !== null) n.comment = d.comment;
      if (d.clearTags) n.tags = [];
      else
        n.tags = [...new Set([...(n.tags || []), ...d.addTags])].filter(
          (x) => !d.removeTags.includes(x),
        );
      if (!adjustment) validateOp(n);
      return n;
    });
    for (const o of replacements) appData.ops[appData.ops.findIndex((x) => x.id === o.id)] = o;
    uiState.selection = false;
    uiState.selected = [];
    save();
    closeLayers();
    toast("Operations updated");
  };
  openSheet(
    () =>
      `<h2>${translate("Bulk edit")}</h2>${row(
        "Category",
        "categories",
        categoryById(d.category)?.name,
        () =>
          categoryPicker(categoryById(d.category)?.type || "expense", d.category, (v) => {
            d.category = v;
            render();
          }),
        () => (d.category = null),
      )}${row(
        "Account",
        "wallet",
        accountById(d.account)?.name,
        () =>
          accountPicker(d.account, (v) => {
            closeLayers();
            d.account = v;
            if (hasTransfers) askRole();
            else render();
          }),
        () => (d.account = null),
      )}${row(
        "Comment",
        "comment",
        d.comment === null ? "" : d.comment || translate("Remove comments"),
        chooseComment,
        () => (d.comment = null),
      )}${row("Tags", "tag", tagsLabel(), chooseTags, () => {
        d.addTags = [];
        d.removeTags = [];
        d.clearTags = false;
      })}${row(
        "Date",
        "calendar",
        d.date ? dateLabel(d.date) : "",
        () =>
          calendar(d.date || TODAY, (v) => {
            d.date = v;
            render();
          }),
        () => (d.date = null),
      )}${buttonHtml(
        "Confirm",
        () =>
          confirmAction(
            "The selected changes will be applied to all selected operations.",
            apply,
            true,
            "Confirm",
          ),
        "primary",
      )}`,
    "Bulk edit",
  );
}
