/* Deletion page: the ways to delete data, each with how much of it goes */
import { appData, setAppData } from "../../core/state.js";
import { createEmptyData, withoutFinanceData } from "../../data/defaults.js";
import { save } from "../../data/storage.js";
import { translate, translateCount, translateWith } from "../../i18n/index.js";
import { confirmAction } from "../../ui/dialogs.js";
import { goHome } from "../../ui/navigation.js";
import { menuRowHtml, pageHeader, toast } from "../../ui/primitives.js";

// The kinds of data, with the number held and the counted wording in both forms.
const KINDS = {
  accounts: [(d) => d.accounts.length, "{n} account", "{n} accounts"],
  categories: [(d) => d.categories.length, "{n} category", "{n} categories"],
  ops: [(d) => d.ops.length, "{n} operation", "{n} operations"],
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

const FINANCE = ["accounts", "categories", "ops", "scheduled", "budgets"];
// Each way: what it removes (kinds), the line under its title (what goes, counted) and the data
// that is left.
const DELETIONS = [
  {
    title: "Delete operations",
    kinds: ["ops"],
    result: (data) => ({ ...data, ops: [] }),
    backupFirst: true,
  },
  {
    title: "Partial deletion",
    kinds: FINANCE,
    result: withoutFinanceData,
    backupFirst: true,
  },
  {
    title: "Delete backups",
    kinds: ["backups"],
    result: (data) => ({ ...data, backups: [] }),
    backupFirst: false,
  },
  {
    title: "Delete local data",
    note: "Everything: the data, backups, settings and reminders",
    kinds: [...FINANCE, "backups"],
    settings: true,
    result: createEmptyData,
    backupFirst: false,
  },
];

// The text of the question: what goes, with the counts, and the settings when they go too.
function questionText(list, settings) {
  if (!settings) return translateWith("{list} will be deleted. This cannot be undone.", { list });
  return list
    ? translateWith("{list}, settings and reminders will be deleted. This cannot be undone.", {
        list,
      })
    : translate("Settings and reminders will be deleted. This cannot be undone.");
}

function askToDelete({ kinds, result, backupFirst, settings = false }) {
  const list = countedList(appData, kinds);
  if (!list && !settings) return toast("There is nothing to delete");
  confirmAction(
    questionText(list, settings),
    () => {
      setAppData(result(appData));
      save();
      goHome("accounts");
      toast("Data deleted");
    },
    backupFirst,
    "Delete",
  );
}

// The line under a way: its own text, or what it deletes with the counts.
const noteOf = (way) =>
  way.note || countedList(appData, way.kinds) || translate("There is nothing to delete");

export function deletionView() {
  return (
    pageHeader("Deletion") +
    `<div class="content flush"><p class="deletion-intro">${translate("Deleted data cannot be restored.")}</p>${DELETIONS.map(
      (way) => menuRowHtml(way.title, "trash", () => askToDelete(way), noteOf(way), ""),
    ).join("")}</div>`
  );
}
