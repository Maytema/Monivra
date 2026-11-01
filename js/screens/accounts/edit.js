import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { forgetDeleted, uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { accountById, formatMoney } from "../../domain/finance.js";
import {
  accountDraft,
  changesCurrencyOfUsedAccount,
  checkedAccountDraft,
  deleteAccount,
  storeAccount,
} from "../../domain/accounts.js";
import { currencyName, translate } from "../../i18n/index.js";
import { accountPicker } from "../pickers.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  pageHeader,
  textFieldHtml,
  toggleRowHtml,
} from "../../ui/primitives.js";
import { amountPicker } from "../../ui/number-picker.js";
import { finishFlow, goBack, openPage } from "../../ui/navigation.js";
import { confirmAction, optionSheet } from "../../ui/dialogs.js";
import { iconPicker } from "../../ui/icon-picker.js";
import { currencyPicker } from "../../ui/currency-picker.js";
import { currencyChangeDialog } from "./currency-change.js";
import { accountTypeSheet } from "./type.js";

// Open the account editor (new account when no argument is given).
export function editAccount(account) {
  openPage(account ? "accountEdit" : "accountType", {
    draft: accountDraft(account),
    editing: Boolean(account),
  });
}

// Validate and store the account being edited; a currency change of a used account asks first.
// A refused draft throws a message that the click handler shows.
function saveAccount(page) {
  const draft = checkedAccountDraft(page.draft);
  const store = (mode) => {
    storeAccount(draft, mode);
    finishFlow("Account saved");
  };
  if (changesCurrencyOfUsedAccount(draft))
    currencyChangeDialog(accountById(draft.id), draft.currency, store);
  else store("spent");
}

const amountField = (label, value, currency, onChange, signed = false, shownAs = label) =>
  fieldButtonHtml(shownAs, formatMoney(value, currency), () =>
    amountPicker(label, value, onChange, signed, currency),
  );

const toggleField = (draft, key, label, hint) =>
  toggleRowHtml(
    label,
    draft[key],
    () => {
      draft[key] = !draft[key];
      render();
    },
    hint,
  );

const DEBT_SWITCHES = [
  ["considerExpense", "Consider as expense", "Consider transfers to this account as expenses"],
  ["showExpense", "Show in expenses", "Show this account among expense categories"],
  ["considerIncome", "Consider as income", "Consider transfers from this account as incomes"],
  ["showIncome", "Show in income", "Show this account among income categories"],
];

// The fields that depend on the type of the account.
function typeFieldsHtml(draft, editing) {
  const set = (key) => (value) => {
    draft[key] = value;
    render();
  };
  const debt = draft.type === "Debt";
  const totalDebt = draft.totalDebt ?? Math.abs(draft.opening || 0);
  const pickDebtKind = () =>
    optionSheet("Type of debt", ["Owe me", "I owe"], draft.debt, (value) => {
      draft.debt = value;
      render();
    });
  const balanceLabel = debt ? "Amount of debt" : "Current balance";
  const balance = fieldButtonHtml(
    debt && editing ? "Current debt" : balanceLabel,
    formatMoney(debt ? Math.abs(draft.balance) : draft.balance, draft.currency),
    () => amountPicker(balanceLabel, draft.balance, set("balance"), !debt, draft.currency),
  );
  const chooseCounterpart = () => accountPicker(draft.counterpart, set("counterpart"), draft.id);
  const counterpart = fieldButtonHtml(
    "Account",
    escapeHtml(accountById(draft.counterpart)?.name || translate("Not selected")),
    chooseCounterpart,
  );
  return [
    debt ? fieldButtonHtml("Type of debt", translate(draft.debt), pickDebtKind) : "",
    fieldButtonHtml("Account currency", escapeHtml(currencyName(draft.currency)), () =>
      currencyPicker(draft.currency, set("currency")),
    ),
    balance,
    debt && editing
      ? amountField("Total debt", totalDebt, draft.currency, (v) => set("totalDebt")(Math.abs(v)))
      : "",
    draft.type === "Regular"
      ? amountField("Credit limit", draft.limit, draft.currency, set("limit"))
      : "",
    draft.type === "Savings" ? amountField("Goal", draft.goal, draft.currency, set("goal")) : "",
    debt && !editing
      ? toggleField(
          draft,
          "createOperation",
          "Create operation",
          "Create an operation about receiving or sending the amount of this debt",
        )
      : "",
    debt && !editing && draft.createOperation ? counterpart : "",
  ].join("");
}

// Archive and delete buttons of an existing account.
function accountEditorActionsHtml(draft) {
  const toggleArchive = () => {
    const account = accountById(draft.id);
    if (!account) return;
    account.archived = !account.archived;
    save();
    goBack();
  };
  const remove = () =>
    confirmAction(
      "Delete this account and all linked operations?",
      () => {
        forgetDeleted(deleteAccount(draft.id));
        uiState.layers = [];
        goBack();
      },
      true,
      "Delete",
    );
  return `${buttonHtml(draft.archived ? "Return from archive" : "Move to archive", toggleArchive, "account-editor-archive")}${buttonHtml("Delete", remove, "account-editor-delete")}`;
}

// Account editor form.
export function accountEditView(page) {
  const { draft, editing } = page;
  const debtSwitches =
    draft.type === "Debt"
      ? DEBT_SWITCHES.map(([key, label, hint]) => toggleField(draft, key, label, hint)).join("")
      : "";
  return (
    pageHeader(editing ? "Change account" : "New account") +
    `<div class="content account-editor-content account-editor-reference"><div class="fields">${textFieldHtml("Title", draft.name, (v) => (draft.name = v), "Enter a name")}${fieldButtonHtml("Icon", badgeHtml(draft), () => iconPicker(draft))}${textFieldHtml("Description", draft.description, (v) => (draft.description = v))}${fieldButtonHtml("Account type", translate(draft.type), () => accountTypeSheet(draft))}${typeFieldsHtml(draft, editing)}${toggleField(draft, "include", "Include in overall balance", "Include the account value in the total at the top of the application")}${debtSwitches}</div><div class="account-editor-bottom">${buttonHtml(editing ? "Save" : "Create", () => saveAccount(page), "primary")}${editing ? accountEditorActionsHtml(draft) : ""}</div></div>`
  );
}
