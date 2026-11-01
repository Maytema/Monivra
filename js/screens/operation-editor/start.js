import { deepClone, TODAY } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { accountById, categoryById } from "../../domain/finance.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { accountPicker, categoryPicker } from "../pickers.js";
import { createEditor } from "./editor.js";
import { counterpartyPicker, transferDestinationPicker } from "./parties.js";
import { editorHtml } from "./view.js";

function newDraft(options) {
  const draft = {
    type: "expense",
    from: null,
    to: null,
    category: null,
    amount: 0,
    date: TODAY,
    comment: "",
    tags: [],
    photos: [],
    recur: null,
    reminder: null,
    ...deepClone(options),
  };
  // An amount that was typed in another currency is edited as it was entered.
  if (draft.foreign) {
    draft.entryCurrency = draft.foreign.currency;
    draft.expr = String(draft.foreign.amount / 100);
  } else draft.expr = String((draft.amount || 0) / 100);
  draft.fresh = !draft.id;
  if (!draft.id) return draft;

  if (draft.type === "adjustment" && draft.receive === undefined) {
    // Older corrections have one amount: both sides show it, as they did when it was made.
    const account = accountById(draft.from || draft.to);
    if (account && account.currency !== appData.settings.currency) draft.receive = draft.amount;
  }
  const stored = draft.categoryAmount;
  if (stored && stored.currency === categoryById(draft.category)?.currency) {
    // The amount in the category's currency is the second amount of the editor.
    draft.receive = stored.amount;
    draft.receiveManual = true;
  } else if (draft.receive !== undefined && !draft.fees?.length) draft.receiveManual = true;
  return draft;
}

// A new operation needs its accounts and category first: ask for whatever is missing, then
// open the editor. Returns false when nothing is missing.
function askForMissingParts(draft, openEditor) {
  // An account-action choice is a separate state. No calculator layer exists
  // until a counterparty has actually been selected.
  if (draft.accountAction) {
    if (draft.accountAction === "transfer") transferDestinationPicker(draft, openEditor);
    else counterpartyPicker(draft.accountAction === "topup" ? "from" : "to", draft, openEditor);
    return true;
  }
  if (draft.type === "transfer" && !draft.from) {
    accountPicker(null, (from) => {
      draft.from = from;
      closeLayers();
      accountPicker(
        null,
        (to) => {
          draft.to = to;
          closeLayers();
          openEditor();
        },
        from,
      );
    });
    return true;
  }
  if (draft.type === "transfer" && !draft.to) {
    accountPicker(
      null,
      (to) => {
        draft.to = to;
        closeLayers();
        openEditor();
      },
      draft.from,
    );
    return true;
  }
  if (!draft.from && !draft.to) {
    accountPicker(null, (id) => {
      if (draft.type === "income") draft.to = id;
      else draft.from = id;
      closeLayers();
      if (draft.category) openEditor();
      else
        categoryPicker(draft.type, null, (category) => {
          draft.category = category;
          closeLayers();
          openEditor();
        });
    });
    return true;
  }
  if (!draft.category && draft.type !== "adjustment" && draft.type !== "transfer") {
    categoryPicker(draft.type, null, (category) => {
      draft.category = category;
      closeLayers();
      openEditor();
    });
    return true;
  }
  return false;
}

// Open the operation editor with a fresh draft.
export function operationStart(options = {}, scheduled = false) {
  const draft = newDraft(options);
  const editor = createEditor(draft, scheduled);
  const openEditor = () => openSheet(() => editorHtml(editor, operationStart), "Add an operation");
  if (draft.id || !askForMissingParts(draft, openEditor)) openEditor();
}
