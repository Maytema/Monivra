/* Choice of the account type: a page for a new account, a sheet for an existing one */
import { render } from "../../app/shell.js";
import { iconSvg } from "../../core/constants.js";
import { uiState } from "../../core/state.js";
import { translate } from "../../i18n/index.js";
import { buttonHtml, iconButtonHtml, pageHeader } from "../../ui/primitives.js";
import { closeLayers, openPage, openSheet } from "../../ui/navigation.js";

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
export function accountTypeSheet(d) {
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
