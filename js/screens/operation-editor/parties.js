import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { accountById, categoryById } from "../../domain/finance.js";
import { putAccountOnSide, putCategoryOnSide } from "../../domain/sides.js";
import { translate } from "../../i18n/index.js";
import { badgeHtml, buttonHtml, tabsHtml } from "../../ui/primitives.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { accountCardsHtml, accountPicker, categoryTilesHtml } from "../pickers.js";

// A balance correction has no real counterpart: "Adjustment" stands on the side the money comes
// from (a raise) or goes to (a cut) and can be replaced like any category or account.
const ADJUSTMENT = { name: "Adjustment", icon: "edit", color: "#94949c" };

// Who takes part in the operation and how the editor shows it: tiles, currencies, kind of amount.
export function describeParties(draft) {
  const from = accountById(draft.from);
  const to = accountById(draft.to);
  const category = categoryById(draft.category);
  const isTransfer = draft.type === "transfer";
  const isAdjustment = draft.type === "adjustment";
  const isIncome = draft.type === "income";
  // A subcategory is chosen on a row under the tiles; the tile itself always shows its category.
  const root = category?.parent ? categoryById(category.parent) : category;
  const subcategories =
    root && appData.settings.subcategories
      ? appData.categories.filter((x) => x.parent === root.id && !x.archived)
      : [];
  const raise = isAdjustment && Boolean(draft.to);
  const own = from || to;

  let source = from;
  let target = root;
  if (isAdjustment) [source, target] = raise ? [ADJUSTMENT, to] : [from, ADJUSTMENT];
  else if (isTransfer) [source, target] = [from, to];
  else if (isIncome) [source, target] = [root, to];

  // The two amounts of the operation: the one that leaves, the one that arrives.
  const adjustmentSide = { currency: appData.settings.currency, color: ADJUSTMENT.color };
  const primary = isAdjustment ? (raise ? adjustmentSide : own) : own;
  const secondary = isAdjustment ? (raise ? own : adjustmentSide) : isTransfer ? to : category;
  const dual = Boolean(primary && secondary && primary.currency !== secondary.currency);
  const accountCurrency = own?.currency || appData.settings.currency;
  // The amount can be typed in another currency; it is converted to the account's one on saving.
  const canPickCurrency = !dual && (draft.type === "income" || draft.type === "expense");
  const currency = (canPickCurrency && draft.entryCurrency) || accountCurrency;

  return {
    isTransfer,
    isAdjustment,
    raise,
    root,
    subcategories,
    source,
    target,
    primary,
    secondary,
    dual,
    accountCurrency,
    canPickCurrency,
    currency,
    category,
  };
}

// Choose a category or an account from the same sheet.
export function counterpartyPicker(direction, draft, onChosen = null) {
  const incoming = direction === "from";
  // Open on the tab that matches what the block currently holds.
  let active = draft.type === (incoming ? "income" : "expense") ? "category" : "account";
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
              (category) => {
                putCategoryOnSide(draft, incoming, category.id);
                done();
              },
              "counterparty-categories",
            )
          : `<div class="counterparty-accounts">${accountCardsHtml(
              appData.accounts.filter(
                (a) => !a.archived && a.id !== (incoming ? draft.to : draft.from),
              ),
              null,
              (account) => {
                putAccountOnSide(draft, incoming, account.id);
                done();
              },
            )}</div>`
      }`,
    title,
  );
}

// Choose the destination (or source) account of a transfer.
export function transferDestinationPicker(draft, onChosen = null, side = "to") {
  const excluded = side === "to" ? draft.from : draft.to;
  const title = side === "from" ? "From account" : "To account";
  openSheet(
    () =>
      `<h2 class="counterparty-title">${translate(title)}</h2><div class="counterparty-accounts">${accountCardsHtml(
        appData.accounts.filter((a) => !a.archived && a.id !== excluded),
        null,
        (account) => {
          draft.type = "transfer";
          draft.category = null;
          draft[side] = account.id;
          closeLayers();
          if (onChosen) onChosen();
          else render();
        },
      )}</div>`,
    title,
  );
}

function tileHtml(label, item, onTap) {
  const value = item
    ? badgeHtml(item, true) + `<span>${escapeHtml(item.name)}</span>`
    : `<span>${translate("Not selected")}</span>`;
  return buttonHtml(
    `<span class="calc-tile-caption">${translate(label)}</span><span class="calc-tile-value">${value}</span>`,
    onTap,
    "calc-tile",
  );
}

// The two tiles at the top of the editor, and the row of subcategories under them.
export function partiesHtml(draft, parties) {
  const { isTransfer, isAdjustment, raise, source, target, root, subcategories } = parties;
  const chooseOwnAccount = () =>
    accountPicker(draft.from || draft.to, (id) => {
      if (draft.to) draft.to = id;
      else draft.from = id;
      render();
    });
  const chooseSource = () =>
    isAdjustment && !raise ? chooseOwnAccount() : counterpartyPicker("from", draft);
  const chooseTarget = () =>
    isAdjustment && raise ? chooseOwnAccount() : counterpartyPicker("to", draft);
  const sourceLabel =
    !isTransfer && !isAdjustment && draft.type === "income" ? "Category" : "Account";
  const targetLabel = isAdjustment
    ? "Account"
    : !isTransfer && draft.type === "expense"
      ? "Category"
      : "Account";
  // A tapped subcategory is chosen; tapping it again goes back to the category itself.
  const pickSubcategory = (id) => {
    draft.category = draft.category === id ? root.id : id;
    render();
  };
  const subcategoryRow = subcategories.length
    ? `<div class="calc-subs">${subcategories
        .map((x) =>
          buttonHtml(
            escapeHtml(x.name),
            () => pickSubcategory(x.id),
            `calc-sub ${draft.category === x.id ? "active" : ""}`,
            `aria-pressed="${draft.category === x.id}"`,
          ),
        )
        .join("")}</div>`
    : "";
  return `<div class="calc-parties">${tileHtml(sourceLabel, source, chooseSource)}${tileHtml(targetLabel, target, chooseTarget)}</div>${subcategoryRow}`;
}
