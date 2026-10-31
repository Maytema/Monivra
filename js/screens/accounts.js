/* Accounts screens */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg, newId } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  accountBalance,
  accountById,
  accountProgress,
  convertCurrency,
  currencyRatio,
  quoteRate,
  debtDirection,
  formatMoney,
  moneySpanHtml,
  overallBalance,
} from "../domain/finance.js";
import {
  accountHasRecords,
  changeAccountCurrency,
  planCurrencyChange,
  deleteAccount,
  putOperation,
  toggleFavoriteAccount,
  validateOp,
} from "../domain/operations.js";
import { currencyName, translate, translateCount, translateWith } from "../i18n/index.js";
import { operationStart } from "./operation-editor.js";
import { filters, operationsMenu } from "./operations.js";
import { accountPicker } from "./pickers.js";
import { hintHtml } from "../ui/hint.js";
import { rateText } from "../ui/rate-line.js";
import {
  actionTileHtml,
  amountPicker,
  closeLayers,
  confirmAction,
  finishFlow,
  goBack,
  goHome,
  iconPicker,
  openPage,
  openSheet,
  optionSheet,
  pageHeader,
  swipePane,
  tabsHtml,
} from "../ui/kit.js";
import { currencyPicker } from "../ui/currency-picker.js";
import {
  badgeHtml,
  buttonHtml,
  fieldButtonHtml,
  iconButtonHtml,
  registerInput,
  textFieldHtml,
  toast,
  toggleRowHtml,
} from "../ui/primitives.js";

// Header block of the root screens: title, balance and action buttons.
export function hero() {
  let icon =
    uiState.tab === "accounts"
      ? "plus"
      : uiState.tab === "categories"
        ? "edit"
        : uiState.tab === "statistics"
          ? "filter"
          : uiState.search
            ? "filter"
            : "more";
  let fn =
    uiState.tab === "accounts"
      ? () => editAccount()
      : uiState.tab === "categories"
        ? () => openPage("categoryManage")
        : uiState.tab === "statistics"
          ? filters
          : uiState.search
            ? filters
            : operationsMenu;
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

// Percent with up to two decimals, the digits after the point set smaller.
function percentLabel(percent) {
  const parts = percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").split(".");
  return `<span class="goal-pct-main">${parts[0]}</span>${parts[1] ? `<span class="goal-pct-frac">.${parts[1]}</span>` : ""}<span class="goal-pct-unit">%</span>`;
}
// A debt I still have to pay back is shown in a soft red, everything else in green.
const isOwed = (p, a) => p.kind === "debt" && p.left > 0 && debtDirection(a) === "I owe";
// Progress meter: a thin outlined track with the fill a little inside it.
function meterHtml(p, a, extraClass = "") {
  return `<span class="meter ${isOwed(p, a) ? "owed" : ""} ${extraClass}"><i style="width:${Math.max(0, p.percent)}%"></i></span>`;
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
    `<span class="account-icon-wrap">${badgeHtml(a)}${a.favorite ? '<span class="account-favorite-badge" aria-label="Favorite">★</span>' : ""}</span><span class="grow"><span class="name">${escapeHtml(a.name)}</span><span class="account-money-line">${moneySpanHtml(n, a.currency, false, true)}${progress ? `${meterHtml(progress, a, "account-meter")}<span class="account-pct">${percentLabel(progress.percent)}</span>` : ""}</span></span>${celebrate ? confettiHtml() : ""}`,
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
  let body =
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
  if (!body && !completed.length) body = `<div class="empty">${translate("Empty")}</div>`;
  // A folder row that unfolds a list of accounts: the archive or the finished goals and debts.
  const folder = (title, icon, items, key) => {
    const unfolded = !!uiState.openFolders[key];
    if (!items.length) return "";
    return (
      buttonHtml(
        `${iconSvg(icon, 18)} ${translate(title)} (${items.length}) ${iconSvg(unfolded ? "up" : "down", 14)}`,
        () => {
          uiState.openFolders = { ...uiState.openFolders, [key]: !unfolded };
          render();
        },
        "accounts-archive-toggle",
      ) +
      (unfolded
        ? `<div class="account-group archived-accounts">${items.map(accountLine).join("")}</div>`
        : "")
    );
  };
  const completedFolder =
    uiState.accountTab === "Total"
      ? ""
      : folder("Completed", "check", completed, "completed-" + uiState.accountTab);
  return (
    hero() +
    tabsHtml(
      tabs.map((x) => [x, x]),
      uiState.accountTab,
      (x) => (uiState.accountTab = x),
      "tabs account-tabs",
    ) +
    swipePane(
      `<div class="content accounts-content">${list.length > 1 && uiState.accountTab !== "Total" ? hintHtml("account-reorder", "Hold an account to drag and reorder") : ""}${body}${completedFolder}${folder("Archive", "archive", archived, "archive")}</div>`,
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

// An account action replaces the account sheet, so one "back" returns to the list.
function startFromAccount(options) {
  closeLayers();
  operationStart(options);
}
// Target, progress meter and what is left, shown in the account sheet.
function progressBlockHtml(a) {
  const p = accountProgress(a);
  if (!p) return "";
  const money = (n) => formatMoney(n, a.currency);
  const say = (text, amount) => translateWith(text, { amount: money(amount) });
  let status;
  if (p.kind === "limit") status = say("Used: {amount}", p.used);
  else if (p.kind === "debt")
    status = p.left > 0 ? say("Left to repay: {amount}", p.left) : translate("Debt repaid");
  else if (p.left > 0) status = say("Left: {amount}", p.left);
  else if (p.left < 0) status = say("Goal exceeded by {amount}", -p.left);
  else status = translate("Goal reached");
  const title = { goal: "Goal", debt: "Total debt", limit: "Limit" }[p.kind];
  return `<div class="account-progress ${isOwed(p, a) ? "owed" : ""}"><div class="account-progress-line"><span>${translate(title)} ${money(p.target)}</span><span class="account-progress-percent">${percentLabel(p.percent)}</span></div>${meterHtml(p, a, "sheet-meter")}${status ? `<div class="account-progress-left">${status}</div>` : ""}</div>`;
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

// Open the account editor (new account when no argument is given).
export function editAccount(a) {
  const d = a
    ? deepClone(a)
    : {
        id: null,
        name: "",
        type: "Regular",
        opening: 0,
        icon: "wallet",
        color: "#9d00b5",
        currency: appData.settings.currency,
        goal: 0,
        limit: 0,
        include: true,
        archived: false,
        favorite: false,
        description: "",
        debt: "Owe me",
        considerExpense: false,
        considerIncome: false,
        showExpense: false,
        showIncome: false,
      };
  d.balance = a ? accountBalance(a.id) : 0;
  if (a?.type === "Debt") d.debt = debtDirection(a);
  if (d.type === "Debt" && d.totalDebt === undefined)
    d.totalDebt = Math.abs(a?.opening || d.balance);
  d.createOperation = false;
  d.counterpart = appData.accounts.find(
    (x) => !x.archived && x.id !== d.id && x.type === "Regular",
  )?.id;
  openPage(a ? "accountEdit" : "accountType", { draft: d, editing: !!a });
}
// Validate and store the account being edited.
export function saveAccount(p) {
  const d = deepClone(p.draft);
  d.name = String(d.name || "").trim();
  if (!d.name) return toast("Enter a name");
  if (d.name.length > 64) return toast("Name is too long");
  if (!["Regular", "Savings", "Debt"].includes(d.type)) return toast("Select account type");
  if (!appData.rates[d.currency] || appData.rates[d.currency] <= 0)
    return toast("Select account currency");
  for (const key of ["balance", "goal", "limit"])
    if (!Number.isSafeInteger(d[key] || 0)) return toast("Invalid amount");
  if (d.type === "Savings" && d.goal < 0) return toast("Goal cannot be negative");
  if (d.type === "Regular" && d.limit < 0) return toast("Credit limit cannot be negative");
  if (d.type === "Debt") {
    d.balance = (d.debt === "I owe" ? -1 : 1) * Math.abs(d.balance);
    if (d.totalDebt === undefined) d.totalDebt = Math.abs(d.balance);
    if (!Number.isSafeInteger(d.totalDebt) || d.totalDebt < 0) return toast("Invalid total debt");
  }
  const existing = accountById(d.id);
  if (existing && existing.currency !== d.currency && accountHasRecords(existing))
    return currencyChangeDialog(existing, d.currency, (mode) => storeAccount(d, mode));
  storeAccount(d, "spent");
}
// Ask how an account changes its currency: recalculate what was spent (default) or convert all.
// The sheet shows what each choice does to this account and to the accounts it sent money to.
function currencyChangeDialog(a, currency, done) {
  let explain = false;
  const money = (n, code) => formatMoney(n, code);
  const quoted = quoteRate(a.currency, currency, currencyRatio(a.currency, currency));
  const pick = (mode) => () => {
    closeLayers();
    done(mode);
  };
  const lines = (plan) => {
    const rows = [
      translateWith("Balance: {before} → {after}", {
        before: money(plan.before, a.currency),
        after: money(plan.after, currency),
      }),
    ];
    if (plan.spentBefore !== plan.spentAfter)
      rows.push(
        translateWith("{operations}: {before} → {after}", {
          operations: translateCount("{n} operation taken", "{n} operations taken", plan.taken),
          before: money(plan.spentBefore, a.currency),
          after: money(plan.spentAfter, currency),
        }),
      );
    for (const [id, delta] of plan.others) {
      const other = accountById(id);
      rows.push(
        translateWith("{name}: received {amount}", {
          name: other.name,
          amount: (delta > 0 ? "+" : "") + money(delta, other.currency),
        }),
      );
    }
    return `<ul class="currency-change-list">${rows.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
  };
  const explanation = [
    "Operations that took money from this account (expenses and transfers out) are recalculated at the rate above. The old amount stays under the operation as “was”.",
    "A transfer out also changes what the other account received, so that account’s balance changes too.",
    "Income, transfers in, balance corrections and the opening balance keep their numbers and only get the new currency. That is why the balance can differ from the old one.",
    "Category totals and statistics follow the new amounts.",
    "Changing the currency back recalculates the same operations again; the numbers return with small rounding differences.",
    "“Convert everything” converts every amount, so the balance is the old balance at the current rate.",
  ];
  openSheet(
    () => {
      const spent = planCurrencyChange(a.id, currency, "spent"),
        all = planCurrencyChange(a.id, currency, "all");
      return `<h2>${translate("Change account currency")}</h2><p class="currency-change-rate">${rateText(quoted, "Rate today: 1 {from} = {rate} {to}")}</p>${lines(spent)}${buttonHtml("Change currency", pick("spent"), "primary")}${buttonHtml("Convert everything at the current rate", pick("all"), "outline")}<p class="hint currency-change-hint">${translateWith(
        "Convert everything: balance {after}",
        { after: money(all.after, currency) },
      )}</p>${buttonHtml(
        `${iconSvg("info", 20)}<span>${translate("Important: how this works")}</span>`,
        () => {
          explain = !explain;
          render();
        },
        "currency-change-info",
        `aria-expanded="${explain}"`,
      )}${explain ? `<div class="currency-change-explain">${explanation.map((t) => `<p>${translate(t)}</p>`).join("")}</div>` : ""}${buttonHtml("Cancel", () => closeLayers(), "outline")}`;
    },
    "Change account currency",
    "dialog",
  );
}
// Store the validated draft; `mode` is how a currency change treats the operations (see
// `changeAccountCurrency`).
function storeAccount(d, mode) {
  let old = accountById(d.id);
  if (old && old.currency !== d.currency) {
    // Fields the user did not touch follow the conversion; edited ones are taken as typed.
    const keys = ["balance", "goal", "limit", "totalDebt"],
      read = (a) => ({ ...a, balance: accountBalance(a.id) }),
      before = read(old);
    changeAccountCurrency(old.id, d.currency, mode);
    const after = read(old);
    for (const key of keys) if (d[key] === before[key]) d[key] = after[key];
  }
  const change = d.balance - (old ? accountBalance(old.id) : 0);
  if (
    d.createOperation &&
    d.type === "Debt" &&
    (!accountById(d.counterpart) || d.counterpart === d.id)
  )
    return toast("Select a different account"); // Validate debt-operation conversion before mutating account state.
  if (d.createOperation && d.type === "Debt" && change) {
    const other = accountById(d.counterpart);
    if (!other) return toast("Select a different account");
    const candidate = change > 0 ? convertCurrency(change, d.currency, other.currency) : -change;
    if (!Number.isSafeInteger(candidate) || candidate <= 0)
      return toast("Invalid debt transfer amount");
    const received =
      change > 0
        ? convertCurrency(candidate, other.currency, d.currency)
        : convertCurrency(candidate, d.currency, other.currency);
    if (!Number.isSafeInteger(received) || received <= 0)
      return toast("Converted debt amount is too small");
  }
  // The starting balance of a new account is an Adjustment operation, visible in the list and
  // editable like any other; debts keep it as the opening balance.
  const startsWithAdjustment = !old && d.type !== "Debt" && d.balance !== 0;
  const temp = {
    ...d,
    id: d.id || newId(),
    opening: old ? old.opening : startsWithAdjustment ? 0 : d.balance,
  };
  delete temp.balance;
  if (temp.type !== "Debt") delete temp.totalDebt;
  delete temp.createOperation;
  delete temp.counterpart;
  if (old) Object.assign(old, temp);
  else appData.accounts.push(temp);
  if ((old && change && !(d.createOperation && d.type === "Debt")) || startsWithAdjustment) {
    appData.ops.push({
      id: newId(),
      type: "adjustment",
      date: TODAY,
      from: change < 0 ? temp.id : null,
      to: change > 0 ? temp.id : null,
      amount: Math.abs(change),
      comment: "Manual balance adjustment",
      tags: [],
    });
  }
  if (d.createOperation && d.type === "Debt" && change) {
    const target = accountById(temp.id),
      other = accountById(d.counterpart);
    let op = {
      type: "transfer",
      date: TODAY,
      comment: "Debt balance adjustment",
      tags: [],
    };
    if (change > 0) {
      op.from = other.id;
      op.to = target.id;
      op.amount = convertCurrency(change, target.currency, other.currency);
    } else {
      op.from = target.id;
      op.to = other.id;
      op.amount = -change;
    }
    validateOp(op);
    target.opening -= op.to === target.id ? op.receive : -op.amount;
    putOperation(op);
  }
  finishFlow("Account saved");
}
// Regular / Savings / Debt: title, explanation, icon and its color.
const ACCOUNT_TYPES = [
  ["Regular", "Card, card or a bank account. For everyday income and expenses.", "card", "#3f7ff0"],
  [
    "Savings",
    "Put money aside, with or without a goal — for a dream, a big purchase or a buffer for future events.",
    "pig",
    "#25b57a",
  ],
  [
    "Debt",
    "Money you borrowed or lent. Track who owes whom and how debt repayment is progressing.",
    "document",
    "#f2812f",
  ],
];
// Cards of the account types; `pick(type)` runs for the chosen one.
const accountTypeCards = (pick) =>
  `<div class="account-type-choices">${ACCOUNT_TYPES.map(([v, desc, icon, color]) =>
    buttonHtml(
      `<span class="type-icon" style="--type:${color}">${iconSvg(icon, 28)}</span><span class="type-text"><strong>${translate(v)}</strong><small>${translate(desc)}</small></span><span class="type-chevron">›</span>`,
      () => pick(v),
      "account-type-choice",
    ),
  ).join("")}</div>`;
// Give the draft the chosen type.
function setAccountType(d, type) {
  d.type = type;
  if (type === "Debt" && !d.debt) d.debt = "Owe me";
}
// Sheet for changing the type of the account being edited.
function accountTypeSheet(d) {
  openSheet(
    () =>
      `<div class="account-type-header">${iconButtonHtml("back", "Back", () => closeLayers())}<h2>${translate("Account type")}</h2><span class="spacer"></span></div>${accountTypeCards(
        (type) => {
          closeLayers();
          setAccountType(d, type);
          render();
        },
      )}`,
    "Account type",
    "full",
  );
}
// First step of a new account: choose its type (back leaves without creating anything).
export function accountTypeView(p) {
  return (
    pageHeader("New account") +
    `<div class="content">${accountTypeCards((type) => {
      setAccountType(p.draft, type);
      uiState.pages.pop();
      openPage("accountEdit", { draft: p.draft, editing: false });
    })}</div>`
  );
}
// Account editor form.
export function accountEditView(p) {
  const d = p.draft,
    debt = d.type === "Debt",
    savings = d.type === "Savings",
    regular = d.type === "Regular",
    current = p.editing;
  return (
    pageHeader(current ? "Change account" : "New account") +
    `<div class="content account-editor-content account-editor-reference"><div class="fields">${textFieldHtml("Title", d.name, (v) => (d.name = v), "Enter a name")}${fieldButtonHtml("Icon", badgeHtml(d), () => iconPicker(d))}${textFieldHtml("Description", d.description, (v) => (d.description = v))}${fieldButtonHtml("Account type", translate(d.type), () => accountTypeSheet(d))}${
      debt
        ? fieldButtonHtml("Type of debt", translate(d.debt), () =>
            optionSheet("Type of debt", ["Owe me", "I owe"], d.debt, (v) => {
              d.debt = v;
              render();
            }),
          )
        : ""
    }${fieldButtonHtml("Account currency", escapeHtml(currencyName(d.currency)), () =>
      currencyPicker(d.currency, (v) => {
        d.currency = v;
        render();
      }),
    )}${fieldButtonHtml(
      debt ? (current ? "Current debt" : "Amount of debt") : "Current balance",
      formatMoney(debt ? Math.abs(d.balance) : d.balance, d.currency),
      () =>
        amountPicker(
          debt ? "Amount of debt" : "Current balance",
          d.balance,
          (v) => {
            d.balance = v;
            render();
          },
          !debt,
          d.currency,
        ),
    )}${
      debt && current
        ? fieldButtonHtml(
            "Total debt",
            formatMoney(d.totalDebt ?? Math.abs(d.opening || 0), d.currency),
            () =>
              amountPicker(
                "Total debt",
                d.totalDebt ?? Math.abs(d.opening || 0),
                (v) => {
                  d.totalDebt = Math.abs(v);
                  render();
                },
                false,
                d.currency,
              ),
          )
        : ""
    }${
      regular
        ? fieldButtonHtml("Credit limit", formatMoney(d.limit, d.currency), () =>
            amountPicker(
              "Credit limit",
              d.limit,
              (v) => {
                d.limit = v;
                render();
              },
              false,
              d.currency,
            ),
          )
        : ""
    }${
      savings
        ? fieldButtonHtml("Goal", formatMoney(d.goal, d.currency), () =>
            amountPicker(
              "Goal",
              d.goal,
              (v) => {
                d.goal = v;
                render();
              },
              false,
              d.currency,
            ),
          )
        : ""
    }${
      debt && !current
        ? toggleRowHtml(
            "Create operation",
            d.createOperation,
            () => {
              d.createOperation = !d.createOperation;
              render();
            },
            "Create an operation about receiving or sending the amount of this debt",
          )
        : ""
    }${
      debt && !current && d.createOperation
        ? fieldButtonHtml(
            "Account",
            escapeHtml(accountById(d.counterpart)?.name || translate("Not selected")),
            () =>
              accountPicker(
                d.counterpart,
                (v) => {
                  d.counterpart = v;
                  render();
                },
                d.id,
              ),
          )
        : ""
    }${toggleRowHtml(
      "Include in overall balance",
      d.include,
      () => {
        d.include = !d.include;
        render();
      },
      "Include the account value in the total at the top of the application",
    )}${
      debt
        ? ["considerExpense", "showExpense", "considerIncome", "showIncome"]
            .map((key, i) =>
              toggleRowHtml(
                ["Consider as expense", "Show in expenses", "Consider as income", "Show in income"][
                  i
                ],
                d[key],
                () => {
                  d[key] = !d[key];
                  render();
                },
                [
                  "Consider transfers to this account as expenses",
                  "Show this account among expense categories",
                  "Consider transfers from this account as incomes",
                  "Show this account among income categories",
                ][i],
              ),
            )
            .join("")
        : ""
    }</div><div class="account-editor-bottom">${buttonHtml(current ? "Save" : "Create", () => saveAccount(p), "primary")}${
      current
        ? buttonHtml(
            d.archived ? "Return from archive" : "Move to archive",
            () => {
              const a = accountById(d.id);
              if (a) {
                a.archived = !a.archived;
                save();
                goBack();
              }
            },
            "account-editor-archive",
          )
        : ""
    }${
      current
        ? buttonHtml(
            "Delete",
            () =>
              confirmAction(
                "Delete this account and all linked operations?",
                () => {
                  deleteAccount(d.id);
                  uiState.layers = [];
                  goBack();
                },
                true,
                "Delete",
              ),
            "account-editor-delete",
          )
        : ""
    }</div></div>`
  );
}
