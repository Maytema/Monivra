/* Operation editor: pickers, calculator, forms */
import { render } from "../app/shell.js";
import { TODAY, deepClone, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, setPhotoCallback, uiState } from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { save } from "../data/storage.js";
import {
  accountBalance,
  accountById,
  categoryById,
  convertCurrency,
  dateLabel,
  defaultAccountId,
  evaluateExpression,
  parseDate,
  toIsoDate,
} from "../domain/finance.js";
import { keypadDigits, typeKey } from "../domain/keypad.js";
import { deleteOperation, processScheduled, putOperation } from "../domain/operations.js";
import { translate } from "../i18n/index.js";
import { feeBlockHtml, feeDialog, feeLabel } from "./fees.js";
import { accountCardsHtml, accountPicker, categoryPicker, categoryTilesHtml } from "./pickers.js";
import { recurrence, reminder } from "./scheduled-budgets.js";
import {
  calendar,
  closeLayers,
  confirmAction,
  openSheet,
  popupMenu,
  promptText,
  tabsHtml,
} from "../ui/kit.js";
import {
  badgeHtml,
  buttonHtml,
  iconButtonHtml,
  menuRowHtml,
  registerAction,
  registerInput,
  toast,
} from "../ui/primitives.js";

/* The left block is where money comes from, the right block where it goes.
   A category can only be a source (income) or a target (expense), never both,
   so choosing one on a side puts an account on the opposite side. */
// Put a category on the left (incoming) or right side of the operation.
function chooseCategorySide(d, incoming, categoryId) {
  d.category = categoryId;
  d.type = incoming ? "income" : "expense";
  if (incoming) {
    d.from = null;
    d.to = d.to || defaultAccountId();
  } else {
    d.to = null;
    d.from = d.from || defaultAccountId();
  }
}
// Put an account on the left or right side; the other side must be an account too.
function chooseAccountSide(d, incoming, accountId) {
  const other = incoming ? d.to : d.from;
  d.type = "transfer";
  d.category = null;
  d.from = incoming
    ? accountId
    : other && other !== accountId
      ? other
      : defaultAccountId(accountId);
  d.to = incoming
    ? other && other !== accountId
      ? other
      : defaultAccountId(accountId)
    : accountId;
}

// Choose a category or an account from the same sheet.
function counterpartyPicker(direction, d, onChosen = null) {
  const incoming = direction === "from";
  // Open on the tab that matches what the block currently holds.
  let active = d.type === (incoming ? "income" : "expense") ? "category" : "account";
  const title = incoming ? "Take from" : "Add to";
  const done = () => {
    closeLayers();
    if (onChosen) onChosen();
    else render();
  };
  openSheet(
    () =>
      `<h2 class="counterparty-title">${translate(title)}</h2>${tabsHtml(
        [
          ["category", incoming ? "Incomes" : "Expenses"],
          ["account", "Accounts"],
        ],
        active,
        (id) => (active = id),
        "tabs counterparty-tabs",
      )}${
        active === "category"
          ? categoryTilesHtml(
              incoming ? "income" : "expense",
              null,
              (c) => {
                chooseCategorySide(d, incoming, c.id);
                done();
              },
              "counterparty-categories",
            )
          : `<div class="counterparty-accounts">${accountCardsHtml(
              appData.accounts.filter((a) => !a.archived && a.id !== (incoming ? d.to : d.from)),
              null,
              (a) => {
                chooseAccountSide(d, incoming, a.id);
                done();
              },
            )}</div>`
      }`,
    title,
  );
}

// Choose the destination (or source) account of a transfer.
function transferDestinationPicker(d, onChosen = null, side = "to") {
  const excluded = side === "to" ? d.from : d.to;
  const title = side === "from" ? "From account" : "To account";
  openSheet(
    () =>
      `<h2 class="counterparty-title">${translate(title)}</h2><div class="counterparty-accounts">${accountCardsHtml(
        appData.accounts.filter((a) => !a.archived && a.id !== excluded),
        null,
        (a) => {
          d.type = "transfer";
          d.category = null;
          d[side] = a.id;
          closeLayers();
          if (onChosen) onChosen();
          else render();
        },
      )}</div>`,
    title,
  );
}
// Open the operation editor with a fresh draft.
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
    ...deepClone(options),
  };
  d.expr = String((d.amount || 0) / 100);
  d.fresh = !d.id;
  const p = {
    draft: d,
    scheduled,
    editing: !!d.id,
    compact: !!d.id,
  };
  const openEditor = () => openSheet(() => accountCalculatorView(p), "Add an operation");
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
      closeLayers();
      accountPicker(
        null,
        (to) => {
          d.to = to;
          closeLayers();
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
        closeLayers();
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
      closeLayers();
      if (!d.category)
        categoryPicker(d.type, null, (cid) => {
          d.category = cid;
          closeLayers();
          openEditor();
        });
      else openEditor();
    });
    return;
  }
  if (!d.id && !d.category && d.type !== "adjustment" && d.type !== "transfer") {
    categoryPicker(d.type, null, (id) => {
      d.category = id;
      closeLayers();
      openEditor();
    });
    return;
  }
  openEditor();
}

// Validate and store the operation being edited.
export function commitOperation(p) {
  try {
    if (!p.scratchMode && /[+×÷−*/]/.test(String(p.draft.expr).replace(/^-/, "")))
      throw Error("Enable calculator for arithmetic");
    if (p.draft.type === "transfer" && (!p.draft.from || !p.draft.to))
      throw Error("Select both accounts");
    if (p.draft.type === "adjustment" && !(p.draft.from || p.draft.to))
      throw Error("Select an account");
    if (!["transfer", "adjustment"].includes(p.draft.type) && !p.draft.category)
      throw Error("Select a category");
    p.draft.amount = evaluateExpression(p.draft.expr);
    delete p.draft.accountAction;
    putOperation(p.draft, p.scheduled);
    uiState.layers = [];
    save();
    render();
    toast(p.scheduled ? "Payment scheduled" : "Operation saved");
  } catch (e) {
    toast(e.message);
  }
}

// Calculator-style editor for operations between accounts.
function accountCalculatorView(p) {
  const d = p.draft,
    from = accountById(d.from),
    to = accountById(d.to),
    c = categoryById(d.category),
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
  const currency = (from || to)?.currency || appData.settings.currency;
  const tile = (label, item, fn) =>
    buttonHtml(
      `<span class="calc-tile-caption">${translate(label)}</span><span class="calc-tile-value">${item ? badgeHtml(item, true) + `<span>${escapeHtml(item.name)}</span>` : `<span>${translate("Not selected")}</span>`}</span>`,
      fn,
      "calc-tile",
    );
  const chooseSource = () =>
    isAdjustment
      ? accountPicker(d.from || d.to, (id) => {
          if (d.to) d.to = id;
          else d.from = id;
          render();
        })
      : counterpartyPicker("from", d);
  const chooseTarget = () =>
    isAdjustment ? toast("Adjustment is a balance correction") : counterpartyPicker("to", d);
  const calcMode = !!p.scratchMode;
  const primary = from || to,
    secondary = isAdjustment ? null : isTransfer ? to : c;
  const dual = !!(primary && secondary && primary.currency !== secondary.currency);
  if (p.currencySide !== "receive") p.currencySide = "send";
  const sourceToReceive = (v) => convertCurrency(v, primary.currency, secondary.currency);
  const receiveToSource = (v) => convertCurrency(v, secondary.currency, primary.currency);
  const asDecimal = (n) => String(n / 100);
  const receiveExpression = () => {
    try {
      return asDecimal(sourceToReceive(evaluateExpression(calcMode ? p.scratchExpr : d.expr)));
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
      const cents = evaluateExpression(v);
      const source = asDecimal(receiveToSource(cents));
      if (calcMode) p.scratchExpr = source;
      else d.expr = source;
      d.receive = cents;
      d.receiveManual = true;
    } catch {
      // keep the previous value while the expression is incomplete
    }
  };
  if (p.scratchExpr === undefined) p.scratchExpr = String(d.expr || "0");
  const currentExpr = () => displayedExpr();
  // Amount on the sender side for the fee preview; zero while the expression is incomplete.
  const enteredAmount = () => {
    try {
      return evaluateExpression(calcMode ? p.scratchExpr : d.expr);
    } catch {
      return 0;
    }
  };
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
    toast(p.scratchMode ? "Calculator is on" : "Calculator is off");
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
      toast("Double-tap the calculator key to enable calculations");
      return;
    }
    if (k === "⌫" || k === "C") assignExpr(typeKey(currentExpr(), k));
    else if (k === "=") {
      try {
        const result = typeKey(currentExpr(), k);
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
      // After a computed result, a digit starts a new calculation; an operator continues it.
      const startNew = calcMode && p.scratchReady && /[0-9.]/.test(k);
      assignExpr(typeKey(currentExpr(), k, startNew));
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
    openSheet(
      () =>
        `<h2>Additionally</h2>${menuRowHtml(
          "Fill max",
          "wallet",
          () => {
            const a = accountById(d.from);
            if (!a) return toast("Select sender account");
            const max = Math.max(
              0,
              accountBalance(a.id) + (a.type === "Regular" ? a.limit || 0 : 0),
            );
            if (!max) return toast("No available balance");
            d.expr = String(max / 100);
            p.receiveExpr = undefined;
            closeLayers();
            render();
          },
          "Use full sender account balance",
        )}${menuRowHtml("Reminder", "bell", () => reminder(d), d.reminder || "Turned off")}${menuRowHtml("Recur", "repeat", () => recurrence(d), d.recur ? "Enabled" : "Turned off")}${menuRowHtml("Tax", "receipt", () => feeDialog(d, "tax", render), feeLabel(d, "tax"))}${menuRowHtml("Commission", "percent", () => feeDialog(d, "commission", render), feeLabel(d, "commission"))}`,
      "Additionally",
    );
  const nums3 = keypadDigits();
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
  return `<div class="calc-shell ${p.compact ? "ops-compact-editor" : ""}"><div class="calc-top"><div class="calc-date">${iconButtonHtml(
    "left",
    "Previous day",
    () => {
      d.date = toIsoDate(new Date(parseDate(d.date).getTime() - 86400000));
      render();
    },
  )}${buttonHtml(
    iconSvg("calendar", 16) + " " + escapeHtml(dateLabel(d.date, true)),
    () =>
      calendar(d.date, (v) => {
        d.date = v;
        render();
      }),
    "calc-date-label",
  )}${iconButtonHtml("right", "Next day", () => {
    d.date = toIsoDate(new Date(parseDate(d.date).getTime() + 86400000));
    render();
  })}</div><div class="calc-parties">${tile(!isTransfer && !isAdjustment && d.type === "income" ? "Category" : "Account", source, chooseSource)}${tile(isAdjustment ? "Account" : !isTransfer && d.type === "expense" ? "Category" : "Account", target, chooseTarget)}</div>${
    dual
      ? `<div class="calc-number dual-number ${p.currencySide === "send" ? "dual-active" : ""}" data-side="send" style="--tint:${escapeHtml(primary.color || "")}">${buttonHtml(
          escapeHtml(
            p.currencySide === "send" ? currentExpr() : calcMode ? p.scratchExpr : d.expr,
          ) +
            " " +
            escapeHtml(primary.currency),
          () => {
            p.currencySide = "send";
            p.receiveExpr = undefined;
            p.compact = false;
            render();
          },
          "dual-value",
          `aria-label="Edit amount in ${escapeHtml(primary.currency)}" aria-pressed="${p.currencySide === "send"}"`,
        )}</div><div class="calc-number dual-number dual-receive ${p.currencySide === "receive" ? "dual-active" : ""}" style="--tint:${escapeHtml(secondary.color || "")}">${buttonHtml(
          escapeHtml(p.currencySide === "receive" ? currentExpr() : receiveExpression()) +
            " " +
            escapeHtml(secondary.currency),
          () => {
            p.currencySide = "receive";
            p.receiveExpr = receiveExpression();
            p.compact = false;
            render();
          },
          "dual-value",
          `aria-label="Edit amount in ${escapeHtml(secondary.currency)}" aria-pressed="${p.currencySide === "receive"}"`,
        )}</div>`
      : `<div class="calc-number single-tappable" role="button" tabindex="0" onclick="this.closest('.overlay').querySelector('.ops-tap-to-edit button')?.click()"><input style="width:${Math.max(1, String(currentExpr()).length)}ch" aria-label="${calcMode ? "Calculator expression" : "Amount"}" inputmode="none" readonly value="${escapeHtml(currentExpr())}" data-input="${registerInput((v) => assignExpr(v))}"><span>${escapeHtml(currency)}</span></div>`
  }${
    p.compact
      ? `<div class="ops-tap-to-edit">${buttonHtml("Click on the value to edit", () => {
          p.compact = false;
          render();
        })}</div>`
      : ""
  }<div class="calc-extras">${
    d.comment
      ? `<div class="calc-comment"><span>${escapeHtml(d.comment)}</span>${iconButtonHtml(
          "close",
          "Clear comment",
          () => {
            d.comment = "";
            render();
          },
        )}</div>`
      : ""
  }<div class="calc-attachments">${buttonHtml('<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.5v5a4 4 0 0 0 8 0V6.5a3 3 0 0 0-6 0v10a1.5 1.5 0 0 0 3 0V7"/></svg>', () => photoMenu(d), "icon-button", 'aria-label="Attachment"')}${iconButtonHtml(
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
  )}${iconButtonHtml("tag", "Tags", () => tagsPicker(d))}</div>${
    d.tags?.length
      ? `<div class="calc-tags">${d.tags.map((x) => `<span class="tag-chip">${escapeHtml(x)}</span>`).join("")}</div>`
      : ""
  }${
    d.photo
      ? `<div class="calc-photo">${buttonHtml(`<img alt="" src="${escapeHtml(d.photo)}">`, () => photoViewer(d.photo), "calc-photo-open", 'aria-label="Open photo"')}${iconButtonHtml(
          "close",
          "Remove photo",
          () => {
            d.photo = null;
            render();
          },
        )}</div>`
      : ""
  }</div>${feeBlockHtml(
    d,
    enteredAmount(),
    currency,
    dual ? secondary.currency : currency,
    dual ? sourceToReceive : (n) => n,
    render,
  )}</div>${
    p.compact
      ? `<div class="ops-compact-actions">${buttonHtml(
          iconSvg("trash", 28) + "<span>Delete</span>",
          () =>
            confirmAction(
              "Delete this operation?",
              () => {
                deleteOperation(d.id, p.scheduled);
                uiState.layers = [];
                render();
              },
              true,
              "Delete",
            ),
        )}${buttonHtml(iconSvg("copy", 28) + "<span>Duplicate</span>", () => {
          const duplicate = deepClone(d);
          delete duplicate.id;
          operationStart(duplicate, p.scheduled);
        })}${
          p.scheduled
            ? buttonHtml(iconSvg("right", 28) + "<span>Skip</span>", () =>
                confirmAction(
                  "Skip this occurrence?",
                  () => {
                    processScheduled(d.id, false);
                    uiState.layers = [];
                    render();
                  },
                  false,
                  "Skip",
                ),
              ) +
              buttonHtml(iconSvg("plus", 28) + "<span>Add now</span>", () => {
                processScheduled(d.id, true);
                uiState.layers = [];
                render();
                toast("Payment added");
              })
            : ""
        }</div>`
      : `<div class="calc-keypad">${grid
          .map((k) =>
            k === "✓"
              ? buttonHtml(
                  calcMode
                    ? p.scratchReady
                      ? iconSvg("check", 30)
                      : '<span class="calc-equals">=</span>'
                    : iconSvg("check", 30),
                  calcMode
                    ? p.scratchReady
                      ? saveCalculated
                      : () => press("=")
                    : () => commitOperation(p),
                  "calc-key calc-confirm",
                  `aria-label="${calcMode ? (p.scratchReady ? "Save operation with calculated result" : "Calculate equals without saving") : "Save operation"}"`,
                )
              : k === "currency"
                ? `<div class="calc-currency calc-key">${escapeHtml(currency)}</div>`
                : k === "mode"
                  ? buttonHtml(
                      iconSvg("calculator", 26) +
                        '<span class="mode-indicator ' +
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
                      "calc-key calc-toggle" + (calcMode ? " is-on" : ""),
                      `aria-label="Additionally" aria-pressed="${calcMode}" title="${translate("Tap: more options. Double tap: calculator")}"`,
                    )
                  : buttonHtml(k, () => press(k), "calc-key " + (k === "⌫" ? "calc-delete" : "")),
          )
          .join("")}</div>`
  }</div>`;
}
// Sheet for choosing tags of an operation: several can be picked, "+ Add" creates a new one.
export function tagsPicker(d) {
  let chosen = [...(d.tags || [])];
  const addTag = () =>
    promptText(
      "New tag",
      "",
      (v) => {
        const name = v.trim();
        if (!name) return toast("Enter a tag");
        if (!appData.tags.includes(name)) appData.tags.push(name);
        if (!chosen.includes(name)) chosen.push(name);
        save();
        render();
      },
      "Tag name",
    );
  openSheet(
    () =>
      `<h2>${translate("Select tags")}</h2><div class="tag-cloud tag-picker">${appData.tags
        .map((tag) =>
          buttonHtml(
            escapeHtml(tag),
            () => {
              chosen = chosen.includes(tag) ? chosen.filter((x) => x !== tag) : [...chosen, tag];
              render();
            },
            "tag " + (chosen.includes(tag) ? "active" : ""),
            `data-hold="${registerAction((chip) =>
              popupMenu(chip, [
                ["Edit", () => renameTag(tag, chosen)],
                ["Delete", () => deleteTag(tag, chosen)],
              ]),
            )}"`,
          ),
        )
        .join(
          "",
        )}${buttonHtml(`${iconSvg("plus", 14)} ${translate("Add")}`, addTag, "tag tag-add")}</div>${buttonHtml(
        "Complete",
        () => {
          d.tags = chosen.filter((v) => appData.tags.includes(v));
          closeLayers();
          render();
        },
        "primary",
      )}`,
    "Select tags",
  );
}
// Rename a tag everywhere (`chosen` is the selection of the open picker).
function renameTag(tag, chosen) {
  promptText(
    "Rename tag",
    tag,
    (v) => {
      v = v.trim();
      if (!v) return toast("Enter a tag");
      if (v !== tag && appData.tags.includes(v)) return toast("Tag already exists");
      appData.tags = appData.tags.map((t) => (t === tag ? v : t));
      for (const key of ["ops", "scheduled"])
        for (const o of appData[key]) o.tags = (o.tags || []).map((t) => (t === tag ? v : t));
      const i = chosen.indexOf(tag);
      if (i >= 0) chosen[i] = v;
      save();
      render();
    },
    "Name",
  );
}
// Remove a tag from the list and from all operations.
function deleteTag(tag, chosen) {
  confirmAction(
    "Remove this tag from all operations?",
    () => {
      appData.tags = appData.tags.filter((t) => t !== tag);
      for (const key of ["ops", "scheduled"])
        for (const o of appData[key]) o.tags = (o.tags || []).filter((t) => t !== tag);
      const i = chosen.indexOf(tag);
      if (i >= 0) chosen.splice(i, 1);
      save();
      render();
    },
    true,
    "Delete",
  );
}
// Menu for attaching a photo (a new one replaces the old one).
function photoMenu(d) {
  openSheet(
    () =>
      `<h2>${translate("Add photo")}</h2><div class="photo-menu">${menuRowHtml("Take a photo", "camera", () => choosePhoto(d, true))}${menuRowHtml("Choose from gallery", "image", () => choosePhoto(d, false))}</div>`,
    "Add photo",
  );
}
// Full-screen view of an attached photo.
export function photoViewer(src) {
  openSheet(
    () =>
      `<div class="photo-viewer">${iconButtonHtml("close", "Close", () => closeLayers())}<img alt="Photo" src="${escapeHtml(src)}"></div>`,
    "Photo",
    "full",
  );
}
// Open the file chooser for an operation photo.
function choosePhoto(d, camera) {
  if (isTestMode()) {
    toast("File picker requested");
    return;
  }
  setPhotoCallback((data) => {
    d.photo = data;
    closeLayers();
  });
  const e = document.getElementById("photo-file");
  e.value = "";
  if (camera) e.setAttribute("capture", "environment");
  else e.removeAttribute("capture");
  e.click();
}
// Display title of an operation.
export function opTitle(o) {
  return o.type === "adjustment"
    ? "Adjustment"
    : o.type === "transfer"
      ? translate("Transfer")
      : categoryById(o.category)?.name || translate("Category");
}
