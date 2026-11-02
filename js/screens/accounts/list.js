/* Accounts tab: the header block, the groups of accounts and their totals */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { appData, uiState } from "../../core/state.js";
import { save } from "../../data/storage.js";
import {
  accountBalance,
  accountProgress,
  convertCurrency,
  debtDirection,
  formatMoney,
  moneySpanHtml,
  overallBalance,
} from "../../domain/finance.js";
import { translate } from "../../i18n/index.js";
import { filters } from "../operations/filters.js";
import { toggleOperationSearch } from "../operations/list.js";
import { hintHtml } from "../../ui/hint.js";
import { emptyStateHtml } from "../../ui/empty-state.js";
import { postedNoticeHtml } from "../due-payments.js";
import { badgeHtml, buttonHtml, iconButtonHtml, swipePane, tabsHtml } from "../../ui/primitives.js";
import { registerInput } from "../../ui/handlers.js";
import { openPage } from "../../ui/navigation.js";
import { currencyPicker } from "../../ui/currency-picker.js";
import { accountActions } from "./actions.js";
import { editAccount } from "./edit.js";
import { accountMeter, percentLabel } from "./progress.js";

// Header block of the root screens: title, balance and action buttons.
export function hero() {
  const icon =
    uiState.tab === "accounts"
      ? "plus"
      : uiState.tab === "categories"
        ? "edit"
        : uiState.tab === "statistics"
          ? "filter"
          : uiState.search
            ? "filter"
            : "more";
  const fn =
    uiState.tab === "accounts"
      ? () => editAccount()
      : uiState.tab === "categories"
        ? () => openPage("categoryManage")
        : uiState.tab === "statistics"
          ? filters
          : uiState.search
            ? filters
            : toggleOperationSearch;
  return `<div class="hero ${uiState.tab === "operations" && uiState.search ? "hero-search" : ""}"><div class="caption">${buttonHtml(
    `<span>${translate("Overall balance")}</span>${iconSvg(appData.settings.hidden ? "eye" : "eyeOpen", 20)}`,
    () => {
      appData.settings.hidden = !appData.settings.hidden;
      save();
      render();
      const label = document.querySelector(".hero-balance-label");
      if (label) {
        label.classList.add("balance-pressed");
        setTimeout(() => label.classList.remove("balance-pressed"), 240);
      }
    },
    "hero-balance-label",
    'aria-label="Toggle balance visibility" aria-pressed="' + appData.settings.hidden + '"',
  )}</div>${
    uiState.tab === "operations" && uiState.search
      ? `<div class="ops-hero-search">${iconButtonHtml("back", "Close search", () => {
          uiState.search = false;
          uiState.filters.comment = "";
          render();
        })}<input aria-label="Search by comments" placeholder="Search by comments" value="${escapeHtml(uiState.filters.comment)}" data-input="${registerInput(
          (v) => {
            uiState.filters.comment = v;
            render();
          },
        )}"></div>`
      : `<div class="balance">${formatMoney(overallBalance(), appData.settings.currency, true)}</div>`
  }<div class="hero-action">${iconButtonHtml(icon, icon === "plus" ? "New account" : icon === "edit" ? "Change categories" : icon === "filter" ? "Filters" : "Operation search", fn)}</div></div>`;
}

// Accounts that reached their goal or were paid off while the list was away get a short party.
const CELEBRATION_MS = 1600;

const CONFETTI_COLORS = ["var(--positive)", "var(--accent)", "#f2a313", "#e5384f", "#1f8fe0"];

let wasFinished = new Map();

const celebratingUntil = new Map();

const isFinished = (a) => {
  const p = accountProgress(a);
  return a.type === "Debt" ? accountBalance(a.id) === 0 : !!p && p.kind === "goal" && p.left <= 0;
};

// Finished accounts wait in the "Completed" folder; one that is celebrating stays in the list.
const isCompleted = (a) => isFinished(a) && !((celebratingUntil.get(a.id) || 0) > Date.now());

// Remember which accounts are finished; an account that just turned finished starts celebrating.
function trackFinished() {
  const now = Date.now(),
    next = new Map();
  for (const a of appData.accounts) {
    const finished = isFinished(a);
    if (finished && wasFinished.get(a.id) === false) {
      celebratingUntil.set(a.id, now + CELEBRATION_MS);
      setTimeout(render, CELEBRATION_MS + 50);
    }
    next.set(a.id, finished);
  }
  wasFinished = next;
}

// Pieces of confetti flying out of the middle of the row.
function confettiHtml() {
  const pieces = CONFETTI_COLORS.flatMap((color, c) =>
    [0, 1, 2].map((k) => {
      const angle = ((c * 3 + k) / 15) * Math.PI * 2,
        reach = 46 + ((c + k) % 3) * 16;
      return `<i style="--dx:${Math.round(Math.cos(angle) * reach * 1.6)}px;--dy:${Math.round(Math.sin(angle) * reach * 0.6)}px;--r:${(c * 3 + k) * 67}deg;--c:${color};--d:${k * 60}ms"></i>`;
    }),
  );
  return `<span class="confetti" aria-hidden="true">${pieces.join("")}</span>`;
}

// One row in the accounts list.
function accountLine(a) {
  const n = accountBalance(a.id),
    progress = accountProgress(a),
    celebrate = (celebratingUntil.get(a.id) || 0) > Date.now();
  return buttonHtml(
    `<span class="account-icon-wrap">${badgeHtml(a)}${a.favorite ? '<span class="account-favorite-badge" aria-label="Favorite">★</span>' : ""}</span><span class="grow"><span class="name">${escapeHtml(a.name)}</span><span class="account-money-line">${moneySpanHtml(n, a.currency, false, true)}${progress ? `${accountMeter(progress, a, "account-meter")}<span class="account-pct">${percentLabel(progress.percent)}</span>` : ""}</span></span>${celebrate ? confettiHtml() : ""}`,
    () => accountActions(a),
    "account-row " + (appData.settings.bigAccounts ? "big " : "") + (celebrate ? "celebrate" : ""),
    `data-account="${a.id}"`,
  );
}

// Accounts tab.
export function accountsView() {
  trackFinished();
  const live = appData.accounts.filter((a) => !a.archived),
    archived = appData.accounts.filter((a) => a.archived),
    hasDebts = live.some((a) => a.type === "Debt"),
    tabs = hasDebts ? ["Accounts", "Debts", "Total"] : ["Accounts", "Total"];
  if (!tabs.includes(uiState.accountTab)) uiState.accountTab = "Accounts";
  const list =
    uiState.accountTab === "Debts"
      ? live.filter((a) => a.type === "Debt")
      : live.filter((a) => a.type !== "Debt");
  const completed = list.filter(isCompleted),
    open = list.filter((a) => !isCompleted(a));
  const groups = uiState.accountTab === "Debts" ? ["Owe me", "I owe"] : ["Regular", "Savings"];
  const body =
    uiState.accountTab === "Total"
      ? accountTotals(live)
      : groups
          .map((type) => {
            const rows = open.filter((a) =>
              a.type === "Debt" ? type === debtDirection(a) : a.type === type,
            );
            if (!rows.length && type !== "Savings") return "";
            const total = rows.reduce(
              (n, a) =>
                n + convertCurrency(accountBalance(a.id), a.currency, appData.settings.currency),
              0,
            );
            return `<div class="section-label account-section-heading"><span>${translate(type === "Regular" ? "Accounts" : type)}</span>${moneySpanHtml(total, appData.settings.currency, false, true)}</div>${rows.length ? `<div class="account-group">${rows.map(accountLine).join("")}</div>` : ""}`;
          })
          .join("");
  // A folder that unfolds a list of accounts: the finished goals and debts, or the archive.
  const folder = (title, icon, items, key) => {
    if (!items.length) return "";
    const unfolded = !!uiState.openFolders[key];
    return `<section class="account-folder">${buttonHtml(
      `${iconSvg(icon, 20)}<span class="grow">${translate(title)} (${items.length})</span>${iconSvg(unfolded ? "up" : "down", 14)}`,
      () => {
        uiState.openFolders = { ...uiState.openFolders, [key]: !unfolded };
        render();
      },
      "account-folder-toggle",
      `aria-expanded="${unfolded}"`,
    )}${unfolded ? `<div class="account-group archived-accounts">${items.map(accountLine).join("")}</div>` : ""}</section>`;
  };
  const completedFolder =
    uiState.accountTab === "Total"
      ? ""
      : folder("Completed", "check", completed, "completed-" + uiState.accountTab);
  if (!appData.accounts.length)
    return (
      hero() +
      `<div class="content">${emptyStateHtml(
        "accounts",
        "Accounts and savings will be here",
        "So far, there is not a single financial or savings account. Create your first financial or savings account?",
        buttonHtml("Create", () => editAccount(), "primary"),
      )}</div>`
    );
  return (
    hero() +
    tabsHtml(
      tabs.map((x) => [x, x]),
      uiState.accountTab,
      (x) => (uiState.accountTab = x),
      "tabs account-tabs",
    ) +
    swipePane(
      `<div class="content accounts-content">${postedNoticeHtml()}${list.length > 1 && uiState.accountTab !== "Total" ? hintHtml("account-reorder", "Hold an account to drag and reorder") : ""}${body}${completedFolder}${folder("Archive", "archive", archived, "archive")}</div>`,
    )
  );
}

// Totals strip: all accounts, regular, savings and debt.
function accountTotals(list) {
  return ["Total", "Regular", "Savings", "Debt"]
    .map((type) => {
      const rows = list.filter((a) => type === "Total" || a.type === type),
        currencies = [...new Set(rows.map((a) => a.currency))];
      if (!rows.length) return "";
      const to = appData.settings.totalCurrency?.[type] || appData.settings.currency;
      return `<div class="section-label account-section-heading"><span>${translate(type === "Regular" ? "Accounts" : type === "Debt" ? "Debts" : type)}</span></div><div class="total-card">${currencies
        .map(
          (c) =>
            `<div class="row"><span class="grow">${c}</span>${moneySpanHtml(
              rows.filter((a) => a.currency === c).reduce((n, a) => n + accountBalance(a.id), 0),
              c,
            )}</div>`,
        )
        .join("")}${buttonHtml(
        moneySpanHtml(
          rows.reduce((n, a) => n + convertCurrency(accountBalance(a.id), a.currency, to), 0),
          to,
        ),
        () =>
          currencyPicker(to, (v) => {
            appData.settings.totalCurrency = {
              ...appData.settings.totalCurrency,
              [type]: v,
            };
            save();
            render();
          }),
        "converted-total",
      )}</div>`;
    })
    .join("");
}
