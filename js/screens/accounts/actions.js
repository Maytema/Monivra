import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg, TODAY } from "../../core/constants.js";
import { uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { accountBalance, moneySpanHtml } from "../../domain/finance.js";
import { toggleFavoriteAccount } from "../../domain/accounts.js";
import { translate } from "../../i18n/index.js";
import { operationStart } from "../operation-editor/start.js";
import { actionTileHtml, badgeHtml, buttonHtml } from "../../ui/primitives.js";
import { closeLayers, goHome, openSheet } from "../../ui/navigation.js";
import { editAccount } from "./edit.js";
import { progressBlockHtml } from "./progress.js";

// An account action replaces the account sheet, so one "back" returns to the list.
function startFromAccount(options) {
  closeLayers();
  operationStart(options);
}

// Action sheet shown when an account is tapped.
export function accountActions(a) {
  const n = accountBalance(a.id),
    available = a.type === "Regular" && a.limit > 0;
  const act = actionTileHtml;
  const figure = (label, amount) =>
    `<div class="account-detail-figure"><div class="account-detail-label">${translate(label)}</div><div class="account-detail-money">${moneySpanHtml(amount, a.currency, false, true)}</div></div>`;
  openSheet(
    () =>
      `<div class="account-detail-head"><div class="account-detail-top">${badgeHtml(a)}<strong>${escapeHtml(a.name)}</strong>${buttonHtml(
        iconSvg("star", 26),
        () => {
          toggleFavoriteAccount(a.id);
          render();
        },
        "account-favorite" + (a.favorite ? " is-favorite" : ""),
        'aria-label="Favorite"',
      )}</div><div class="account-detail-figures">${figure("Current balance", n)}${available ? figure("Available balance", n + a.limit) : ""}</div>${progressBlockHtml(a)}</div><div class="sheet-actions" role="group" aria-label="Account actions">${act("edit", "Edit", "#c04fd8", () => editAccount(a))}${act(
        "archive",
        a.archived ? "Return from archive" : "Move to archive",
        "#7d7886",
        () => {
          a.archived = !a.archived;
          save();
          closeLayers();
        },
      )}${act("receipt", "Operations", "#1f8fe0", () => {
        uiState.filters.accounts = [a.id];
        uiState.period = { mode: "all", anchor: TODAY };
        goHome("operations");
      })}${act("income", "Top up", "#22b573", () => startFromAccount({ type: "income", to: a.id, accountAction: "topup" }))}${act("transfer", "Transfer", "#f2a313", () => startFromAccount({ type: "transfer", from: a.id, accountAction: "transfer" }))}${act("expense", "Debit", "#e5384f", () => startFromAccount({ type: "expense", from: a.id, accountAction: "debit" }))}</div>`,
    a.name,
  );
}
