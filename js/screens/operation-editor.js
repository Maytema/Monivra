/* Operation editor: pickers, calculator, forms */
import { render } from "../app/shell.js";
import { I, TODAY, clone, esc } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  acc,
  bal,
  calculate,
  cat,
  convert,
  dateLabel,
  dateObj,
  iso,
  moneySpan,
  rate,
} from "../domain/finance.js";
import { deleteOperation, putOperation } from "../domain/operations.js";
import { accountPicker, categoryPicker } from "./categories.js";
import { recurLabel } from "./operations.js";
import { recurrence, reminder } from "./scheduled-budgets.js";
import {
  calculatorKeys,
  calendar,
  close,
  confirmAction,
  finish,
  header,
  optionSheet,
  page,
  promptText,
  sheet,
} from "../ui/kit.js";
import {
  B,
  IB,
  badge,
  field,
  inp,
  photoCallback,
  row,
  setPhotoCallback,
  t,
  toast,
  txt,
} from "../ui/primitives.js";

/* Counterparty picker: choose a category or an account from the same sheet. */
function counterpartyPicker(direction, d, onChosen = null) {
  const incoming = direction === "from";
  let active = incoming ? "category" : "category";
  const catType = incoming ? "income" : "expense";
  const title = incoming ? "Take from" : "Add to";
  const tabName = incoming ? "Incomes" : "Expenses";
  const eligible = () =>
    D.accounts.filter((a) => !a.archived && a.id !== (incoming ? d.to : d.from));
  sheet(
    () =>
      `<h2 class="counterparty-title">${t(title)}</h2><div class="tabs counterparty-tabs">${B(
        t(tabName),
        () => {
          active = "category";
          render();
        },
        active === "category" ? "active" : "",
      )}${B(
        t("Accounts"),
        () => {
          active = "account";
          render();
        },
        active === "account" ? "active" : "",
      )}</div>${
        active === "category"
          ? `<div class="grid ${D.settings.onePicker ? "one" : ""} counterparty-categories">${D.categories
              .filter((c) => !c.archived && c.type === catType)
              .map((c) =>
                B(
                  `${badge(c)}<span>${c.parent ? "↳ " : ""}${esc(c.name)}</span>`,
                  () => {
                    if (incoming) {
                      d.type = "income";
                      d.from = null;
                      d.category = c.id;
                    } else {
                      d.type = "expense";
                      d.to = null;
                      d.category = c.id;
                    }
                    close();
                    if (onChosen) onChosen();
                    else render();
                  },
                  "cat-tile",
                ),
              )
              .join("")}</div>`
          : `<div class="counterparty-accounts">${eligible().filter((a) => a.type !== "Savings").length ? `<div class="picker-group-title">${t("Accounts")}</div>` : ""}${eligible()
              .filter((a) => a.type !== "Savings")
              .map((a) =>
                B(
                  `${badge(a, true)}<span class="grow">${esc(a.name)}</span>${moneySpan(bal(a.id), a.currency, false, true)}`,
                  () => {
                    d.type = "transfer";
                    d.category = null;
                    if (incoming) d.from = a.id;
                    else d.to = a.id;
                    close();
                    if (onChosen) onChosen();
                    else render();
                  },
                  "row",
                ),
              )
              .join("")}<div class="picker-group-title">${t("Savings")}</div>${eligible()
              .filter((a) => a.type === "Savings")
              .map((a) =>
                B(
                  `${badge(a, true)}<span class="grow">${esc(a.name)}</span>${moneySpan(bal(a.id), a.currency, false, true)}`,
                  () => {
                    d.type = "transfer";
                    d.category = null;
                    if (incoming) d.from = a.id;
                    else d.to = a.id;
                    close();
                    if (onChosen) onChosen();
                    else render();
                  },
                  "row",
                ),
              )
              .join(
                "",
              )}${!eligible().length ? '<p class="footnote">No available accounts</p>' : ""}</div>`
      }`,
    title,
  );
}

/* Transfers use a dedicated destination-account selector,
   not the mixed expenses/accounts counterparty picker. */
function transferDestinationPicker(d, onChosen = null, side = "to") {
  const excluded = side === "to" ? d.from : d.to;
  sheet(
    () => {
      const available = D.accounts.filter((a) => !a.archived && a.id !== excluded);
      const groups = [
        ["Regular", "Accounts"],
        ["Savings", "Savings"],
        ["I owe", "I owe"],
        ["Owe me", "Owe me"],
      ];
      return `<h2 class="counterparty-title">${side === "from" ? "From account" : "To account"}</h2><div class="counterparty-accounts">${groups
        .map(([kind, label]) => {
          const rows = available.filter((a) =>
            kind === "Regular" || kind === "Savings"
              ? a.type === kind
              : a.type === "Debt" && a.debt === kind,
          );
          if (!rows.length) return "";
          return `<div class="picker-group-title">${t(label)}</div>${rows
            .map((a) =>
              B(
                `${badge(a, true)}<span class="grow"><span class="name">${esc(a.name)}</span>${moneySpan(bal(a.id), a.currency, false, true)}</span>`,
                () => {
                  d.type = "transfer";
                  d.category = null;
                  d[side] = a.id;
                  close();
                  if (onChosen) onChosen();
                  else render();
                },
                "row account-row",
              ),
            )
            .join("")}`;
        })
        .join(
          "",
        )}${!available.length ? '<p class="footnote">No available accounts</p>' : ""}</div>`;
    },
    side === "from" ? "From account" : "To account",
  );
}
export function operationStart(options = {}, scheduled = false) {
  const d = {
    type: "expense",
    from: null,
    to: null,
    category: null,
    amount: 0,
    date: TODAY,
    comment: "",
    tags: [],
    photo: null,
    recur: null,
    reminder: null,
    ...clone(options),
  };
  d.expr = String((d.amount || 0) / 100);
  d.fresh = !d.id;
  const p = {
    draft: d,
    scheduled,
    editing: !!d.id,
    sheet: !scheduled,
    compact: !!d.id,
  };
  const openEditor = () => sheet(() => operationView(p), "Add an operation");
  if (scheduled) {
    page("operation", p);
    return;
  }
  // An account-action choice is a separate state. No calculator layer exists
  // until a counterparty has actually been selected.
  if (!d.id && d.accountAction) {
    if (d.accountAction === "transfer") transferDestinationPicker(d, openEditor);
    else counterpartyPicker(d.accountAction === "topup" ? "from" : "to", d, openEditor);
    return;
  }
  if (!d.id && d.type === "transfer" && !d.from) {
    accountPicker(null, (id) => {
      d.from = id;
      close();
      accountPicker(
        null,
        (to) => {
          d.to = to;
          close();
          openEditor();
        },
        id,
      );
    });
    return;
  }
  if (!d.id && d.type === "transfer" && !d.to) {
    accountPicker(
      null,
      (id) => {
        d.to = id;
        close();
        openEditor();
      },
      d.from,
    );
    return;
  }
  if (!d.id && !d.from && !d.to) {
    accountPicker(null, (id) => {
      if (d.type === "income") d.to = id;
      else d.from = id;
      close();
      if (!d.category)
        categoryPicker(d.type, null, (cid) => {
          d.category = cid;
          close();
          openEditor();
        });
      else openEditor();
    });
    return;
  }
  if (!d.id && !d.category && d.type !== "adjustment" && d.type !== "transfer") {
    categoryPicker(d.type, null, (id) => {
      d.category = id;
      close();
      openEditor();
    });
    return;
  }
  openEditor();
}

export function commitOperation(p) {
  try {
    if (p.sheet && !p.scratchMode && /[+×÷−*/]/.test(String(p.draft.expr).replace(/^-/, "")))
      throw Error("Enable calculator for arithmetic");
    if (p.draft.type === "transfer" && (!p.draft.from || !p.draft.to))
      throw Error("Select both accounts");
    if (p.draft.type === "adjustment" && !(p.draft.from || p.draft.to))
      throw Error("Select an account");
    if (!["transfer", "adjustment"].includes(p.draft.type) && !p.draft.category)
      throw Error("Select a category");
    p.draft.amount = calculate(p.draft.expr);
    delete p.draft.accountAction;
    putOperation(p.draft, p.scheduled);
    if (p.sheet) {
      U.layers = [];
      save();
      render();
      toast("Operation saved");
    } else finish(p.scheduled ? "Scheduled payment saved" : "Operation saved");
  } catch (e) {
    toast(e.message);
  }
}

function accountCalculatorView(p) {
  const d = p.draft,
    from = acc(d.from),
    to = acc(d.to),
    c = cat(d.category),
    isTransfer = d.type === "transfer";
  const isAdjustment = d.type === "adjustment";
  const source = isAdjustment ? from || to : isTransfer ? from : d.type === "income" ? c : from,
    target = isAdjustment
      ? { name: "Adjustment", icon: "edit", color: "#94949c" }
      : isTransfer
        ? to
        : d.type === "income"
          ? to
          : c;
  const currency = (from || to)?.currency || D.settings.currency;
  const tile = (label, item, fn) =>
    B(
      `<span class="mon-calc-tile-caption">${t(label)}</span><span class="mon-calc-tile-value">${item ? badge(item, true) + `<span>${esc(item.name)}</span>` : `<span>${t("Not selected")}</span>`}</span>`,
      fn,
      "mon-calc-tile",
    );
  const chooseSource = () =>
    isAdjustment
      ? accountPicker(d.from || d.to, (id) => {
          if (d.to) d.to = id;
          else d.from = id;
          render();
        })
      : isTransfer
        ? transferDestinationPicker(d, null, "from")
        : counterpartyPicker("from", d);
  const chooseTarget = () =>
    isAdjustment
      ? toast("Adjustment is a balance correction")
      : isTransfer
        ? transferDestinationPicker(d, null, "to")
        : counterpartyPicker("to", d);
  const calcMode = !!p.scratchMode;
  const primary = from || to,
    secondary = isAdjustment ? null : isTransfer ? to : c;
  const dual = !!(primary && secondary && primary.currency !== secondary.currency);
  if (p.currencySide !== "receive") p.currencySide = "send";
  const sourceToReceive = (v) => convert(v, primary.currency, secondary.currency);
  const receiveToSource = (v) => convert(v, secondary.currency, primary.currency);
  const asDecimal = (n) => String(n / 100);
  const receiveExpression = () => {
    try {
      return asDecimal(sourceToReceive(calculate(calcMode ? p.scratchExpr : d.expr)));
    } catch {
      return "0";
    }
  };
  const displayedExpr = () =>
    dual && p.currencySide === "receive"
      ? p.receiveExpr === undefined
        ? receiveExpression()
        : p.receiveExpr
      : calcMode
        ? p.scratchExpr
        : d.expr;
  const setReceiveExpr = (v) => {
    p.receiveExpr = v;
    p.scratchReady = false;
    try {
      const cents = calculate(v);
      const source = asDecimal(receiveToSource(cents));
      if (calcMode) p.scratchExpr = source;
      else d.expr = source;
      d.receive = cents;
      d.receiveManual = true;
    } catch {}
  };
  if (p.scratchExpr === undefined) p.scratchExpr = String(d.expr || "0");
  const currentExpr = () => displayedExpr();
  const assignExpr = (v) => {
    if (dual && p.currencySide === "receive") {
      setReceiveExpr(v);
      return;
    }
    if (calcMode) {
      p.scratchExpr = v;
      p.scratchReady = false;
      p.receiveExpr = undefined;
      d.receiveManual = false;
    } else {
      if (/[+×÷−*/]/.test(v)) {
        toast("Enable calculator for arithmetic");
        return;
      }
      d.expr = v;
      p.receiveExpr = undefined;
      d.receiveManual = false;
    }
  };
  const switchMode = () => {
    p.scratchMode = !p.scratchMode;
    if (p.scratchMode) {
      /* Carry the current amount into scratch; never modify the operation until Save. */ p.scratchExpr =
        String(d.expr || "0");
      p.scratchReady = false;
    }
    p.receiveExpr = undefined;
    render();
  };
  const press = (k) => {
    if (!calcMode && ["÷", "×", "−", "+", "="].includes(k)) {
      toast("Double-tap the nine dots to enable calculations");
      return;
    }
    if (k === "⌫") assignExpr(String(currentExpr()).slice(0, -1) || "0");
    else if (k === "C") assignExpr("0");
    else if (k === "=") {
      try {
        const result = String(calculate(currentExpr()) / 100);
        if (dual && p.currencySide === "receive") {
          setReceiveExpr(result);
        } else {
          p.scratchExpr = result;
          p.receiveExpr = undefined;
        }
        p.scratchReady = true;
      } catch (e) {
        toast(e.message);
        return;
      }
    } else {
      const old = String(currentExpr());
      // After a computed result, a digit starts a new calculation; an operator continues it.
      const startNew = calcMode && p.scratchReady && /[0-9.]/.test(k);
      const base = startNew ? "0" : old;
      assignExpr((base === "0" && /[0-9]/.test(k) ? "" : base) + k);
    }
    render();
  };
  const saveCalculated = () => {
    if (!p.scratchReady) return toast("Press = first");
    /* One checkmark saves the actual operation after '='; no second confirmation. */
    d.expr = p.scratchExpr;
    commitOperation(p);
  };
  const additionally = () =>
    sheet(
      () =>
        `<h2>Additionally</h2>${row(
          "Fill max",
          "wallet",
          () => {
            const a = acc(d.from);
            if (!a) return toast("Select sender account");
            const max = Math.max(0, bal(a.id) + (a.type === "Regular" ? a.limit || 0 : 0));
            if (!max) return toast("No available balance");
            d.expr = String(max / 100);
            p.receiveExpr = undefined;
            close();
            render();
          },
          "Use full sender account balance",
        )}${row("Reminder", "bell", () => reminder(d), d.reminder || "Turned off")}${row("Recur", "repeat", () => recurrence(d), d.recur ? "Enabled" : "Turned off")}${row("Tax", "receipt", () => toast("Tax settings are not yet verified"))}${row("Commission", "percent", () => toast("Commission settings are not yet verified"))}`,
      "Additionally",
    );
  const nums3 = D.settings.reverseKeys
    ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    : ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  const grid = [
    "÷",
    ...nums3.slice(0, 3),
    "⌫",
    "×",
    ...nums3.slice(3, 6),
    "mode",
    "−",
    ...nums3.slice(6, 9),
    "✓",
    "+",
    "currency",
    "0",
    ".",
  ];
  return `<div class="mon-calc-shell ${p.compact ? "ops-compact-editor" : ""}"><div class="mon-calc-date">${IB(
    "left",
    "Previous day",
    () => {
      d.date = iso(new Date(dateObj(d.date).getTime() - 86400000));
      render();
    },
  )}${B(
    I("calendar", 16) + " " + esc(dateLabel(d.date, true)),
    () =>
      calendar(d.date, (v) => {
        d.date = v;
        render();
      }),
    "mon-calc-date-label",
  )}${IB("right", "Next day", () => {
    d.date = iso(new Date(dateObj(d.date).getTime() + 86400000));
    render();
  })}</div><div class="mon-calc-parties">${tile(!isTransfer && !isAdjustment && d.type === "income" ? "Category" : "Account", source, chooseSource)}${tile(isAdjustment ? "Account" : !isTransfer && d.type === "expense" ? "Category" : "Account", target, chooseTarget)}</div>${
    dual
      ? `<div class="mon-calc-number mon-dual-number ${p.currencySide === "send" ? "mon-dual-active" : ""}" data-side="send">${B(
          esc(p.currencySide === "send" ? currentExpr() : calcMode ? p.scratchExpr : d.expr) +
            " " +
            esc(primary.currency),
          () => {
            p.currencySide = "send";
            p.receiveExpr = undefined;
            p.compact = false;
            render();
          },
          "mon-dual-value",
          `aria-label="Edit amount in ${esc(primary.currency)}" aria-pressed="${p.currencySide === "send"}"`,
        )}</div><div class="mon-calc-number mon-dual-number mon-dual-receive ${p.currencySide === "receive" ? "mon-dual-active" : ""}">${B(
          esc(p.currencySide === "receive" ? currentExpr() : receiveExpression()) +
            " " +
            esc(secondary.currency),
          () => {
            p.currencySide = "receive";
            p.receiveExpr = receiveExpression();
            p.compact = false;
            render();
          },
          "mon-dual-value",
          `aria-label="Edit amount in ${esc(secondary.currency)}" aria-pressed="${p.currencySide === "receive"}"`,
        )}</div><div class="mon-calc-rate mon-dual-rate mon-dual-rate-line">1 ${esc(primary.currency)} = ${(rate(primary.currency) / rate(secondary.currency)).toFixed(4)} ${esc(secondary.currency)} · ${p.currencySide === "receive" ? "Edit second currency" : "Edit first currency"}</div>`
      : `<div class="mon-calc-number mon-single-tappable" role="button" tabindex="0" onclick="this.closest('.overlay').querySelector('.ops-tap-to-edit button')?.click()"><input style="width:${Math.max(1, String(currentExpr()).length)}ch" aria-label="${calcMode ? "Calculator expression" : "Amount"}" inputmode="none" readonly value="${esc(currentExpr())}" data-input="${inp((v) => assignExpr(v))}"><span>${esc(currency)}</span></div>`
  }${
    p.compact
      ? `<div class="ops-tap-to-edit">${B("Click on the value to edit", () => {
          p.compact = false;
          render();
        })}</div>`
      : ""
  }<div class="mon-calc-attachments">${B('<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.5v5a4 4 0 0 0 8 0V6.5a3 3 0 0 0-6 0v10a1.5 1.5 0 0 0 3 0V7"/></svg>', () => photoMenu(d), "icon-button", 'aria-label="Attachment"')}${IB(
    "comment",
    "Comment",
    () =>
      promptText(
        "Comment",
        d.comment,
        (v) => {
          d.comment = v;
          render();
        },
        "Comment",
      ),
  )}${IB("tag", "Tags", () => tagsPicker(d))}</div>${d.comment ? `<p class="mon-calc-note">${esc(d.comment)}</p>` : ""}${d.tags?.length ? `<div class="tag-cloud">${d.tags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}${
    p.compact
      ? `<div class="ops-compact-actions">${B(I("trash", 28) + "<span>Delete</span>", () =>
          confirmAction(
            "Delete this operation?",
            () => {
              deleteOperation(d.id, false);
              U.layers = [];
              render();
            },
            true,
            "Delete",
          ),
        )}${B(I("copy", 28) + "<span>Duplicate</span>", () => {
          const duplicate = clone(d);
          delete duplicate.id;
          operationStart(duplicate);
        })}</div>`
      : `<div class="mon-calc-keypad">${grid
          .map((k) =>
            k === "✓"
              ? B(
                  calcMode
                    ? p.scratchReady
                      ? I("check", 30)
                      : '<span class="mon-calc-equals">=</span>'
                    : I("check", 30),
                  calcMode
                    ? p.scratchReady
                      ? saveCalculated
                      : () => press("=")
                    : () => commitOperation(p),
                  "mon-calc-key mon-calc-confirm",
                  `aria-label="${calcMode ? (p.scratchReady ? "Save operation with calculated result" : "Calculate equals without saving") : "Save operation"}"`,
                )
              : k === "currency"
                ? `<div class="mon-calc-currency mon-calc-key">${esc(currency)}</div>`
                : k === "mode"
                  ? B(
                      '<span class="mon-nine-dots" aria-hidden="true">' +
                        Array(9).fill("<i></i>").join("") +
                        '</span><span class="mon-mode-indicator ' +
                        (calcMode ? "is-active" : "") +
                        '" aria-hidden="true"></span>',
                      () => {
                        const now = Date.now();
                        if (p.lastModeTap && now - p.lastModeTap < 340) {
                          p.lastModeTap = 0;
                          clearTimeout(p.modeMenuTimer);
                          switchMode();
                        } else {
                          p.lastModeTap = now;
                          clearTimeout(p.modeMenuTimer);
                          p.modeMenuTimer = setTimeout(() => {
                            p.lastModeTap = 0;
                            additionally();
                          }, 350);
                        }
                      },
                      "mon-calc-key mon-calc-toggle",
                      `aria-label="Additionally"`,
                    )
                  : B(k, () => press(k), "mon-calc-key " + (k === "⌫" ? "mon-calc-delete" : "")),
          )
          .join("")}</div>`
  }</div>`;
}
export function operationView(p) {
  if (p.sheet && !p.scheduled) return accountCalculatorView(p);
  const d = p.draft,
    a = acc(d.from || d.to),
    chooseCat = (id) => {
      d.category = id;
      const type = cat(id).type;
      if (d.type !== type) {
        const account = d.from || d.to;
        d.from = type === "expense" ? account : null;
        d.to = type === "income" ? account : null;
        d.type = type;
      }
      render();
    };
  return (
    (p.sheet
      ? ""
      : header(
          p.scheduled ? "Scheduled payments" : p.editing ? "Edit operation" : "Add an operation",
        )) +
    `<div class="content operation-form"><div class="calc-tools">${B(
      esc(t(d.type === "expense" ? "Expenses" : d.type === "income" ? "Incomes" : "Transfer")) +
        " " +
        I("down", 15),
      () =>
        optionSheet(
          "Type",
          [
            ["expense", "Expenses"],
            ["income", "Incomes"],
            ["transfer", "Transfer"],
          ],
          d.type,
          (v) => {
            const account = d.from || d.to;
            d.type = v;
            d.from = v === "income" ? null : account;
            d.to = v === "income" ? account : null;
            d.category = null;
            render();
          },
        ),
      "text-button",
    )}${B(
      I("calendar", 17) + " " + esc(dateLabel(d.date, true)),
      () =>
        calendar(d.date, (v) => {
          d.date = v;
          render();
        }),
      "text-button",
    )}</div><div class="calc-pickers">${field(
      d.type === "income" ? "Add to" : "Take from",
      a ? badge(a, true) + " " + esc(a.name) : t("Not selected"),
      () =>
        accountPicker(
          d.from || d.to,
          (id) => {
            if (d.type === "income") d.to = id;
            else d.from = id;
            render();
          },
          d.type === "transfer" ? d.to : null,
        ),
    )}${
      d.type === "transfer"
        ? field(
            "Add to",
            acc(d.to) ? badge(acc(d.to), true) + " " + esc(acc(d.to).name) : t("Not selected"),
            () =>
              accountPicker(
                d.to,
                (id) => {
                  d.to = id;
                  render();
                },
                d.from,
              ),
          )
        : field(
            "Category",
            cat(d.category)
              ? badge(cat(d.category), true) + " " + esc(cat(d.category).name)
              : t("Not selected"),
            () => categoryPicker(d.type, d.category, chooseCat),
          )
    }</div><label class="calc-amount"><input inputmode="decimal" type="text" aria-label="Amount" value="${esc(d.expr)}" data-input="${inp((v) => (d.expr = v))}"><span>${esc(a?.currency || D.settings.currency)}</span></label>${d.type === "transfer" && d.to && a?.currency !== acc(d.to)?.currency ? `<p class="calc-hint">1 ${a.currency} = ${(rate(a.currency) / rate(acc(d.to).currency)).toFixed(4)} ${acc(d.to).currency}</p>` : ""}<div class="calc-tools">${IB(
      "comment",
      "Comment",
      () =>
        promptText(
          "Comment",
          d.comment,
          (v) => {
            d.comment = v;
            render();
          },
          "Comment",
        ),
    )}${IB("tag", "Tags", () => tagsPicker(d))}${IB("clip", "Photo", () => photoMenu(d))}</div>${d.comment ? `<p class="calc-hint">${esc(d.comment)}</p>` : ""}${d.tags?.length ? `<div class="tag-cloud">${d.tags.map((v) => `<span class="tag">${esc(v)}</span>`).join("")}</div>` : ""}${d.photo ? `<img class="preview-photo" src="${d.photo}" alt="Attached photo">` : ""}${
      p.scheduled
        ? `<div class="fields">${field("Date", esc(dateLabel(d.date)), () =>
            calendar(d.date, (v) => {
              d.date = v;
              render();
            }),
          )}${field("Recur", recurLabel(d.recur), () => recurrence(d))}${field("Reminder", d.reminder ? esc((d.reminderLead || "At the time") + " · " + d.reminder) : t("Turned off"), () => reminder(d))}</div>`
        : ""
    }${calculatorKeys(
      () => d.expr,
      (v) => (d.expr = v),
      () => commitOperation(p),
    )}</div>`
  );
}
export function tagsPicker(d) {
  let chosen = [...(d.tags || [])],
    q = "";
  sheet(
    () =>
      `<h2>${t("Tags")}</h2>${txt("Search or add tag", q, (v) => (q = v))}<div class="tag-cloud">${D.tags
        .map((tag) =>
          B(
            esc(tag),
            () => {
              chosen = chosen.includes(tag) ? chosen.filter((x) => x !== tag) : [...chosen, tag];
              render();
            },
            "tag " + (chosen.includes(tag) ? "active" : ""),
          ),
        )
        .join("")}</div>${row("Manage tags", "gear", () => manageTags(chosen))}${B(
        "Add",
        () => {
          const x = q.trim();
          if (!x) return toast("Enter a tag");
          if (!D.tags.includes(x)) D.tags.push(x);
          if (!chosen.includes(x)) chosen.push(x);
          q = "";
          save();
          render();
        },
        "outline",
      )}${B(
        "Save",
        () => {
          d.tags = chosen.filter((v) => D.tags.includes(v));
          close();
        },
        "primary",
      )}${B("Cancel", () => close(), "outline")}`,
    "Tags",
  );
}
function manageTags(chosen) {
  sheet(
    () =>
      `<h2>Manage tags</h2>${D.tags
        .map(
          (tag) =>
            `<div class="row"><span class="grow">${esc(tag)}</span>${IB(
              "edit",
              "Rename " + tag,
              () =>
                promptText(
                  "Rename tag",
                  tag,
                  (v) => {
                    v = v.trim();
                    if (!v) return toast("Enter a tag");
                    if (v !== tag && D.tags.includes(v)) return toast("Tag already exists");
                    D.tags = D.tags.map((t) => (t === tag ? v : t));
                    for (const key of ["ops", "scheduled"])
                      for (const o of D[key])
                        o.tags = (o.tags || []).map((t) => (t === tag ? v : t));
                    const i = chosen.indexOf(tag);
                    if (i >= 0) chosen[i] = v;
                    save();
                    render();
                  },
                  "Name",
                ),
            )}${IB("trash", "Delete " + tag, () =>
              confirmAction(
                "Remove this tag from all operations?",
                () => {
                  D.tags = D.tags.filter((t) => t !== tag);
                  for (const key of ["ops", "scheduled"])
                    for (const o of D[key]) o.tags = (o.tags || []).filter((t) => t !== tag);
                  let i = chosen.indexOf(tag);
                  if (i >= 0) chosen.splice(i, 1);
                  save();
                  render();
                },
                true,
                "Delete",
              ),
            )}</div>`,
        )
        .join("")}${B("Complete", () => close(), "primary")}`,
    "Manage tags",
  );
}
function photoMenu(d) {
  sheet(
    () =>
      `<h2>${t("Photo")}</h2>${row("Camera", "camera", () => choosePhoto(d, true))}${row("Gallery", "image", () => choosePhoto(d, false))}${
        d.photo
          ? row("Delete photo", "trash", () => {
              d.photo = null;
              close();
            })
          : ""
      }<p class="footnote">DEMO: camera availability depends on the browser. Images are stored locally with the operation.</p>`,
    "Photo",
  );
}
function choosePhoto(d, camera) {
  if (window.__MONIVRA_TEST__) {
    toast("File picker requested");
    return;
  }
  setPhotoCallback((data) => {
    d.photo = data;
    close();
  });
  const e = document.getElementById("photo-file");
  e.value = "";
  if (camera) e.setAttribute("capture", "environment");
  else e.removeAttribute("capture");
  e.click();
}
export function opTitle(o) {
  return o.type === "adjustment"
    ? "Adjustment"
    : o.type === "transfer"
      ? t("Transfer")
      : cat(o.category)?.name || t("Category");
}
