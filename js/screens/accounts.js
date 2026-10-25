/* Accounts screens */
import { render } from "../app/shell.js";
import { CURRENCIES, I, TODAY, clone, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import { acc, bal, convert, money, moneySpan, overall } from "../domain/finance.js";
import { deleteAccount, putOperation, validateOp } from "../domain/operations.js";
import { accountPicker } from "./categories.js";
import { operationStart } from "./operation-editor.js";
import { filters, operationsMenu } from "./operations.js";
import {
  amountPicker,
  back,
  close,
  confirmAction,
  currencyPicker,
  finish,
  header,
  home,
  iconPicker,
  optionSheet,
  page,
  sheet,
} from "../ui/kit.js";
import { B, IB, badge, field, inp, t, toast, toggle, txt } from "../ui/primitives.js";

export function hero() {
  let icon =
    U.tab === "accounts"
      ? "plus"
      : U.tab === "categories"
        ? "edit"
        : U.tab === "statistics"
          ? "filter"
          : U.search
            ? "filter"
            : "more";
  let fn =
    U.tab === "accounts"
      ? () => editAccount()
      : U.tab === "categories"
        ? () => page("categoryManage")
        : U.tab === "statistics"
          ? filters
          : U.search
            ? filters
            : operationsMenu;
  return `<div class="hero ${U.tab === "operations" && U.search ? "hero-search" : ""}"><div class="caption">${B(
    `<span>${t("Overall balance")}</span>${I(D.settings.hidden ? "eye" : "eyeOpen", 20)}`,
    () => {
      D.settings.hidden = !D.settings.hidden;
      save();
      render();
      const label = document.querySelector(".hero-balance-label");
      if (label) {
        label.classList.add("balance-pressed");
        setTimeout(() => label.classList.remove("balance-pressed"), 240);
      }
    },
    "hero-balance-label",
    'aria-label="Toggle balance visibility" aria-pressed="' + D.settings.hidden + '"',
  )}</div>${
    U.tab === "operations" && U.search
      ? `<div class="ops-hero-search">${IB("back", "Close search", () => {
          U.search = false;
          U.filters.comment = "";
          render();
        })}<input aria-label="Search by comments" placeholder="Search by comments" value="${esc(U.filters.comment)}" data-input="${inp(
          (v) => {
            U.filters.comment = v;
            render();
          },
        )}"></div>`
      : `<div class="balance">${money(overall(), D.settings.currency, true)}</div>`
  }<div class="hero-action">${IB(icon, icon === "plus" ? "New account" : icon === "edit" ? "Change categories" : icon === "filter" ? "Filters" : "Operation search", fn)}</div></div><!--MONIVRA_HERO_END-->`;
}

// Show fractional progress without rounding an incomplete goal up to 100%.
// All balances and goals are integer minor currency units. Limit precision to 2 decimals.
function savingsPercent(balance, goal) {
  if (!(goal > 0)) return 0;
  if (balance >= goal) return 100;
  return Math.max(0, Math.min(99.99, Math.floor((Math.max(0, balance) / goal) * 10000) / 100));
}
function savingsPercentLabel(balance, goal) {
  const n = savingsPercent(balance, goal);
  const parts = n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").split(".");
  return `<span class="mon-goal-pct-main">${parts[0]}</span>${parts[1] ? `<span class="mon-goal-pct-frac">.${parts[1]}</span>` : ""}<span class="mon-goal-pct-unit">%</span>`;
}
function accountLine(a) {
  const n = bal(a.id),
    goal = a.type === "Savings" && a.goal > 0;
  const percent = goal ? savingsPercent(n, a.goal) : 0;
  return B(
    `<span class="account-icon-wrap">${badge(a)}${a.favorite ? '<span class="account-favorite-badge" aria-label="Favorite">★</span>' : ""}</span><span class="grow"><span class="name">${esc(a.name)}</span>${moneySpan(n, a.currency, false, true)}${a.type === "Regular" && a.limit > 0 ? `<span class="mon-account-available">Available: ${money(n + a.limit, a.currency)}</span>` : ""}</span>${goal ? `<span class="goal-info">${n > a.goal ? "+" + money(n - a.goal, a.currency) : money(Math.max(0, a.goal - n), a.currency)}<br>${savingsPercentLabel(n, a.goal)}</span><span class="goal-strip" style="height:${percent}%;background:#18c99b"></span>` : ""}`,
    () => accountActions(a),
    "account-row " +
      (a.type === "Debt" && bal(a.id) === 0 ? "mon-debt-completed " : "") +
      (D.settings.bigAccounts ? "big" : ""),
  );
}
export function accountsView() {
  const live = D.accounts.filter((a) => !a.archived),
    archived = D.accounts.filter((a) => a.archived),
    hasDebts = live.some((a) => a.type === "Debt"),
    tabs = hasDebts ? ["Accounts", "Debts", "Total"] : ["Accounts", "Total"];
  if (!tabs.includes(U.accountTab)) U.accountTab = "Accounts";
  const list =
    U.accountTab === "Debts"
      ? live.filter((a) => a.type === "Debt")
      : live.filter((a) => a.type !== "Debt");
  const groups =
    U.accountTab === "Debts"
      ? ["Owe me", "I owe", "Owe me - Completed", "I owe - Completed"]
      : ["Regular", "Savings"];
  let body =
    U.accountTab === "Total"
      ? accountTotals(live)
      : groups
          .map((type) => {
            const rows = list.filter((a) =>
              a.type === "Debt"
                ? type === a.debt + (bal(a.id) === 0 ? " - Completed" : "")
                : a.type === type,
            );
            if (!rows.length && type !== "Savings") return "";
            const total = rows.reduce(
              (n, a) => n + convert(bal(a.id), a.currency, D.settings.currency),
              0,
            );
            return `<div class="section-label account-section-heading"><span>${t(type === "Regular" ? "Accounts" : type)}</span>${moneySpan(total, D.settings.currency, false, true)}</div>${rows.length ? `<div class="account-group">${rows.map(accountLine).join("")}</div>` : ""}`;
          })
          .join("");
  if (!body) body = `<div class="empty">${t("Empty")}</div>`;
  return (
    hero() +
    `<div class="tabs account-tabs">${tabs
      .map((x) =>
        B(
          t(x),
          () => {
            U.accountTab = x;
            render();
          },
          U.accountTab === x ? "active" : "",
        ),
      )
      .join("")}</div><div class="content accounts-content">${body}${
      archived.length
        ? B(
            `${I("archive", 18)} ${t("Archive")} ${I(U.archive ? "up" : "down", 14)}`,
            () => {
              U.archive = !U.archive;
              render();
            },
            "accounts-archive-toggle",
          )
        : ""
    }${U.archive && archived.length ? `<div class="account-group">${archived.map(accountLine).join("")}</div>` : ""}</div>`
  );
}
function accountTotals(list) {
  return ["Total", "Regular", "Savings", "Debt"]
    .map((type) => {
      const rows = list.filter((a) => type === "Total" || a.type === type),
        currencies = [...new Set(rows.map((a) => a.currency))];
      if (!rows.length) return "";
      const to = D.settings.totalCurrency?.[type] || D.settings.currency;
      return `<div class="section-label account-section-heading"><span>${t(type === "Regular" ? "Accounts" : type === "Debt" ? "Debts" : type)}</span></div><div class="total-card">${currencies
        .map(
          (c) =>
            `<div class="row"><span class="grow">${c}</span>${moneySpan(
              rows.filter((a) => a.currency === c).reduce((n, a) => n + bal(a.id), 0),
              c,
            )}</div>`,
        )
        .join("")}${B(
        moneySpan(
          rows.reduce((n, a) => n + convert(bal(a.id), a.currency, to), 0),
          to,
        ),
        () =>
          currencyPicker(to, (v) => {
            D.settings.totalCurrency = {
              ...D.settings.totalCurrency,
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

export function accountActions(a) {
  const n = bal(a.id),
    available = a.type === "Regular" && a.limit > 0;
  const act = (icon, label, fn) =>
    B(
      `<span class="account-action-icon">${I(icon, 23)}</span><span>${t(label)}</span>`,
      fn,
      "account-action-tile",
    );
  sheet(
    () =>
      `<div class="account-detail-head">${badge(a)}<div class="grow"><strong>${esc(a.name)}</strong><div class="account-detail-label">${t("Current balance")}</div><div class="account-detail-money">${moneySpan(n, a.currency, false, true)}</div>${available ? `<div class="account-detail-label">${t("Available balance")}</div><div class="account-detail-money">${moneySpan(n + a.limit, a.currency, false, true)}</div>` : ""}</div>${B(
        I("star", 23),
        () => {
          a.favorite = !a.favorite;
          save();
          render();
        },
        "account-favorite" + (a.favorite ? " is-favorite" : ""),
        'aria-label="Favorite"',
      )}</div><div class="account-actions-six" role="group" aria-label="Account actions">${act("edit", "Edit", () => editAccount(a))}${act(
        "archive",
        a.archived ? "Return from archive" : "Move to archive",
        () => {
          a.archived = !a.archived;
          save();
          close();
        },
      )}${act("receipt", "Operations", () => {
        U.filters.accounts = [a.id];
        U.period = { mode: "all", anchor: TODAY };
        home("operations");
      })}${act("income", "Top up", () => operationStart({ type: "income", to: a.id, accountAction: "topup" }))}${act("transfer", "Transfer", () => operationStart({ type: "transfer", from: a.id, accountAction: "transfer" }))}${act("expense", "Debit", () => operationStart({ type: "expense", from: a.id, accountAction: "debit" }))}</div>`,
    a.name,
  );
}

export function editAccount(a) {
  const d = a
    ? clone(a)
    : {
        id: null,
        name: "",
        type: "Regular",
        opening: 0,
        icon: "wallet",
        color: "#9d00b5",
        currency: D.settings.currency,
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
  d.balance = a ? bal(a.id) : 0;
  if (d.type === "Debt" && d.totalDebt === undefined)
    d.totalDebt = Math.abs(a?.opening || d.balance);
  d.createOperation = false;
  d.counterpart = D.accounts.find((x) => !x.archived && x.id !== d.id && x.type === "Regular")?.id;
  page("accountEdit", { draft: d, editing: !!a });
  if (!a) accountTypeReferenceSheet(d);
}
export function saveAccount(p) {
  const d = clone(p.draft);
  d.name = String(d.name || "").trim();
  if (!d.name) return toast("Enter a name");
  if (d.name.length > 64) return toast("Name is too long");
  if (!["Regular", "Savings", "Debt"].includes(d.type)) return toast("Select account type");
  if (!D.rates[d.currency] || D.rates[d.currency] <= 0) return toast("Select account currency");
  for (const key of ["balance", "goal", "limit"])
    if (!Number.isSafeInteger(d[key] || 0)) return toast("Invalid amount");
  if (d.type === "Savings" && d.goal < 0) return toast("Goal cannot be negative");
  if (d.type === "Regular" && d.limit < 0) return toast("Credit limit cannot be negative");
  if (d.type === "Debt") {
    d.balance = (d.debt === "I owe" ? -1 : 1) * Math.abs(d.balance);
    if (d.totalDebt === undefined) d.totalDebt = Math.abs(d.balance);
    if (!Number.isSafeInteger(d.totalDebt) || d.totalDebt < 0) return toast("Invalid total debt");
  }
  let old = acc(d.id),
    change = d.balance - (old ? bal(old.id) : 0);
  if (d.createOperation && d.type === "Debt" && (!acc(d.counterpart) || d.counterpart === d.id))
    return toast("Select a different account"); // Validate debt-operation conversion before mutating account state.
  if (d.createOperation && d.type === "Debt" && change) {
    const other = acc(d.counterpart);
    if (!other) return toast("Select a different account");
    const candidate = change > 0 ? convert(change, d.currency, other.currency) : -change;
    if (!Number.isSafeInteger(candidate) || candidate <= 0)
      return toast("Invalid debt transfer amount");
    const received =
      change > 0
        ? convert(candidate, other.currency, d.currency)
        : convert(candidate, d.currency, other.currency);
    if (!Number.isSafeInteger(received) || received <= 0)
      return toast("Converted debt amount is too small");
  }
  const temp = {
    ...d,
    id: d.id || uid(),
    opening: old ? old.opening : d.balance,
  };
  delete temp.balance;
  if (temp.type !== "Debt") delete temp.totalDebt;
  delete temp.createOperation;
  delete temp.counterpart;
  if (old) Object.assign(old, temp);
  else D.accounts.push(temp);
  if (old && change && !(d.createOperation && d.type === "Debt")) {
    D.ops.push({
      id: uid(),
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
    const target = acc(temp.id),
      other = acc(d.counterpart);
    let op = {
      type: "transfer",
      date: TODAY,
      comment: "Debt balance adjustment",
      tags: [],
    };
    if (change > 0) {
      op.from = other.id;
      op.to = target.id;
      op.amount = convert(change, target.currency, other.currency);
    } else {
      op.from = target.id;
      op.to = other.id;
      op.amount = -change;
    }
    validateOp(op);
    target.opening -= op.to === target.id ? op.receive : -op.amount;
    putOperation(op);
  }
  finish("Account saved");
}
function accountTypeReferenceSheet(d) {
  const types = [
    [
      "Regular",
      "Card, card or a bank account. For everyday income and expenses.",
      "card",
      "#e8efff",
    ],
    [
      "Savings",
      "Put money aside, with or without a goal — for a dream, a big purchase or a buffer for future events.",
      "savings",
      "#dff9ee",
    ],
    [
      "Debt",
      "Money you borrowed or lent. Track who owes whom and how debt repayment is progressing.",
      "receipt",
      "#ffebdf",
    ],
  ];
  sheet(
    () =>
      `<div class="account-type-header">${IB("back", "Back", () => close())}<h2>${t("Account type")}</h2><span style="width:42px"></span></div><div class="mon-account-type-choices">${types
        .map(([v, desc, icon, bg]) =>
          B(
            `<span class="mon-type-icon" style="background:${bg}">${I(icon, 23)}</span><span class="mon-type-text"><strong>${t(v)}</strong><small>${desc}</small></span><span class="mon-type-chevron">›</span>`,
            () => {
              close();
              d.type = v;
              if (v === "Debt" && !d.debt) d.debt = "Owe me";
              render();
            },
            "mon-account-type-choice",
          ),
        )
        .join("")}</div>`,
    "Account type",
    "full",
  );
}
export function accountEditView(p) {
  const d = p.draft,
    debt = d.type === "Debt",
    savings = d.type === "Savings",
    regular = d.type === "Regular",
    current = p.editing;
  return (
    header(current ? "Change account" : "New account") +
    `<div class="content account-editor-content account-editor-reference"><div class="fields">${txt("Title", d.name, (v) => (d.name = v), "Enter a name")}${field("Icon", badge(d), () => iconPicker(d))}${txt("Description", d.description, (v) => (d.description = v))}${field("Account type", t(d.type), () => accountTypeReferenceSheet(d))}${
      debt
        ? field("Type of debt", t(d.debt), () =>
            optionSheet("Type of debt", ["Owe me", "I owe"], d.debt, (v) => {
              d.debt = v;
              render();
            }),
          )
        : ""
    }${field(
      "Account currency",
      esc(CURRENCIES.find(([id]) => id === d.currency)?.[1] || d.currency),
      () =>
        currencyPicker(d.currency, (v) => {
          d.currency = v;
          render();
        }),
    )}${field(
      debt ? (current ? "Current debt" : "Amount of debt") : "Current balance",
      money(debt ? Math.abs(d.balance) : d.balance, d.currency),
      () =>
        amountPicker(
          debt ? "Amount of debt" : "Current balance",
          d.balance,
          (v) => {
            d.balance = v;
            render();
          },
          !debt,
        ),
    )}${
      debt && current
        ? field("Total debt", money(d.totalDebt ?? Math.abs(d.opening || 0), d.currency), () =>
            amountPicker(
              "Total debt",
              d.totalDebt ?? Math.abs(d.opening || 0),
              (v) => {
                d.totalDebt = Math.abs(v);
                render();
              },
              false,
            ),
          )
        : ""
    }${
      regular
        ? field("Credit limit", money(d.limit, d.currency), () =>
            amountPicker("Credit limit", d.limit, (v) => {
              d.limit = v;
              render();
            }),
          )
        : ""
    }${
      savings
        ? field("Goal", money(d.goal, d.currency), () =>
            amountPicker("Goal", d.goal, (v) => {
              d.goal = v;
              render();
            }),
          )
        : ""
    }${
      debt && !current
        ? toggle(
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
        ? field("Account", esc(acc(d.counterpart)?.name || t("Not selected")), () =>
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
    }${toggle(
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
              toggle(
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
                  "Consider transfers to this account as incomes",
                  "Show this account among income categories",
                ][i],
              ),
            )
            .join("")
        : ""
    }</div><div class="account-editor-bottom">${B(current ? "Save" : "Create", () => saveAccount(p), "primary")}${
      current
        ? B(
            d.archived ? "Return from archive" : "Move to archive",
            () => {
              const a = acc(d.id);
              if (a) {
                a.archived = !a.archived;
                save();
                back();
              }
            },
            "account-editor-archive",
          )
        : ""
    }${
      current
        ? B(
            "Delete",
            () =>
              confirmAction(
                "Delete this account and all linked operations?",
                () => {
                  deleteAccount(d.id);
                  U.layers = [];
                  back();
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
