/* Settings: list of sections and the pages for formatting, styles and elements */
import { render } from "../app/shell.js";
import { THEME_COLORS, escapeHtml, iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { NUMBER_FORMATS, formatNumber } from "../domain/finance.js";
import { changeMainCurrency } from "../domain/operations.js";
import { LANGUAGES, translate } from "../i18n/index.js";
import { statsSettings } from "./statistics.js";
import {
  closeLayers,
  monthStartDialog,
  openPage,
  openSheet,
  optionSheet,
  pageHeader,
} from "../ui/kit.js";
import { currencyPicker } from "../ui/currency-picker.js";
import { buttonHtml, menuRowHtml, toggleRowHtml } from "../ui/primitives.js";

// Change a setting, persist it and re-render.
export function setting(key, value) {
  appData.settings[key] = value;
  save();
  render();
}
// Toggle row bound to a boolean setting.
export function switchSetting(label, key, hint = "") {
  return toggleRowHtml(
    label,
    appData.settings[key],
    () => setting(key, !appData.settings[key]),
    hint,
  );
}
// Row with a title and the current choice under it; opens an option sheet.
export function settingOptions(label, key, options) {
  const o = options.find((o) => (Array.isArray(o) ? o[0] : o) === appData.settings[key]);
  return menuRowHtml(
    label,
    null,
    () => optionSheet(label, options, appData.settings[key], (v) => setting(key, v)),
    Array.isArray(o) ? o[1] : (o ?? String(appData.settings[key])),
    "",
  );
}

// Row that opens another settings page.
const linkRow = (title, caption, kind) => menuRowHtml(title, null, () => openPage(kind), caption);

// Settings home: the list of sections.
export function settingsView() {
  return (
    pageHeader("Settings") +
    `<div class="content flush">${[
      ["Formatting", "Main currency, currency format", "receipt", "formatting"],
      ["Styles and elements", "Colour, decorations and themes", "sun", "styles"],
      ["Backups", "Saving data to local backups", "archive", "backups"],
      ["Notifications", "Status, schedule", "bell", "notifications"],
      ["Security", "Protection of the application from outsiders", "lock", "security"],
      ["Privacy", "Hide values from outsiders", "shield", "privacy"],
      ["Exchange rates", "Update and edit", "transfer", "rates"],
    ]
      .map(([label, caption, icon, kind]) =>
        menuRowHtml(label, icon, () => openPage(kind), caption),
      )
      .join("")}</div>`
  );
}

// Dialog with the number format, its switches and a Save button.
function currencyFormatSheet() {
  const draft = {
    numberFormat: appData.settings.numberFormat,
    currencyFirst: appData.settings.currencyFirst,
    groupDigits: appData.settings.groupDigits,
    decimal: appData.settings.decimal,
  };
  openSheet(
    () =>
      `<h2>${translate("Currency format")}</h2>${NUMBER_FORMATS.map((id) =>
        buttonHtml(
          `<span class="grow">${escapeHtml(formatNumber(123456789, id, true, true))} ${escapeHtml(appData.settings.currency)}</span><input type="radio" tabindex="-1" ${draft.numberFormat === id ? "checked" : ""} aria-label="${id}">`,
          () => {
            draft.numberFormat = id;
            render();
          },
          "row",
        ),
      ).join("")}${[
        ["Currency symbol first", "currencyFirst"],
        ["Group by 3 digits", "groupDigits"],
        ["Two decimal places", "decimal"],
      ]
        .map(([label, key]) =>
          toggleRowHtml(label, draft[key], () => {
            draft[key] = !draft[key];
            render();
          }),
        )
        .join("")}${buttonHtml(
        "Save",
        () => {
          Object.assign(appData.settings, draft);
          save();
          closeLayers();
        },
        "primary",
      )}`,
    "Currency format",
  );
}

// Page with the currency, number and date formats.
function formattingPage() {
  const s = appData.settings;
  return (
    pageHeader("Formatting") +
    `<div class="content flush">${menuRowHtml(
      "Main currency",
      null,
      () =>
        currencyPicker(s.currency, (v) => {
          changeMainCurrency(v);
          render();
        }),
      s.currency,
    )}${menuRowHtml(
      "Currency format",
      null,
      currencyFormatSheet,
      `${formatNumber(123456789, s.numberFormat, s.groupDigits, s.decimal || !s.hideCents)} ${s.currency}`,
    )}${switchSetting("Hide cents", "hideCents", "Amounts are shown rounded to whole units")}${settingOptions(
      "Date format",
      "dateFormat",
      [
        ["month", "Month | day | year"],
        ["day", "Day | month | year"],
        ["iso", "Year | month | day"],
      ],
    )}${menuRowHtml(
      "Start of month",
      null,
      () => monthStartDialog(() => render()),
      String(s.monthStart),
    )}${settingOptions("First day of week", "weekStart", [
      [1, "Monday"],
      [2, "Tuesday"],
      [3, "Wednesday"],
      [4, "Thursday"],
      [5, "Friday"],
      [6, "Saturday"],
      [0, "Sunday"],
    ])}</div>`
  );
}

// Page with the groups of appearance settings.
function stylesPage() {
  return (
    pageHeader("Styles and elements") +
    `<div class="content flush">${linkRow("Global", "Appearance of the entire application", "stylesGlobal")}${linkRow("Bottom navigation", "Bottom navigation elements style", "stylesNavigation")}${linkRow("Elements", "Presence on screens", "stylesElements")}${linkRow("Language", "Interface language", "stylesLanguage")}</div>`
  );
}

// Interface mode and the way to the color theme.
function stylesGlobalPage() {
  return (
    pageHeader("Global") +
    `<div class="content flush">${settingOptions("Interface mode", "theme", [
      ["system", "As in the system"],
      ["light", "Light"],
      ["dark", "Dark"],
    ])}${linkRow("Color theme", "Color change for the entire application", "stylesColor")}</div>`
  );
}

// Page with the colors of the application.
function colorThemePage() {
  return (
    pageHeader("Color theme") +
    `<div class="content"><div class="theme-colors">${THEME_COLORS.map((c) =>
      buttonHtml(
        appData.settings.accent === c ? iconSvg("check", 26) : "",
        () => setting("accent", c),
        "theme-color",
        `style="background:${c}" aria-label="${c}"`,
      ),
    ).join("")}</div></div>`
  );
}

// Bottom navigation labels.
function stylesNavigationPage() {
  return (
    pageHeader("Bottom navigation") +
    `<div class="content flush">${settingOptions("Element names", "navLabels", [
      ["always", "Always show"],
      ["active", "Show only for selected"],
      ["never", "Never show"],
    ])}</div>`
  );
}

// Elements shown on the screens.
function stylesElementsPage() {
  return (
    pageHeader("Elements") +
    `<div class="content flush">${linkRow("Operations list", "Elements on the operations list screen", "elementsOperations")}${menuRowHtml("Statistics", null, statsSettings, translate("Elements on the statistics screen"))}${linkRow("Accounts", "Displaying accounts", "elementsAccounts")}${linkRow("Categories", "Displaying categories", "elementsCategories")}${linkRow("Keyboard", "Keyboard inside the application", "elementsKeyboard")}</div>`
  );
}

// Interface language.
function stylesLanguagePage() {
  return (
    pageHeader("Language") +
    `<div class="content flush">${LANGUAGES.map((language) =>
      buttonHtml(
        `<span class="grow">${escapeHtml(language.name)}</span><input type="radio" tabindex="-1" ${appData.settings.language === language.code ? "checked" : ""} aria-label="${escapeHtml(language.name)}">`,
        () => setting("language", language.code),
        "row",
      ),
    ).join("")}</div>`
  );
}

// Small pages with a few switches; the key is the page kind.
const SWITCH_PAGES = {
  elementsOperations: [
    "Operations list screen",
    [
      [
        "Opening and closing balance",
        "opening",
        "Shows the opening and closing balance on the operations list screen.",
      ],
    ],
  ],
  elementsAccounts: ["Accounts", [["Large account rows", "bigAccounts", ""]]],
  elementsCategories: [
    "Categories",
    [
      [
        "Categories in one column",
        "oneColumn",
        "If enabled, categories are shown in a single column.",
      ],
      [
        "Category selection in one column",
        "onePicker",
        "If enabled, the category selection sheet is shown in a single column.",
      ],
      ["Show subcategories", "subcategories", ""],
    ],
  ],
  elementsKeyboard: [
    "Keyboard",
    [
      [
        "Reverse number order",
        "reverseKeys",
        "If enabled, the numbers are arranged in reverse order as in a calculator. If it is turned off, in the usual way as on a regular keyboard.",
      ],
    ],
  ],
};

const SETTINGS_PAGES = {
  formatting: formattingPage,
  styles: stylesPage,
  stylesGlobal: stylesGlobalPage,
  stylesColor: colorThemePage,
  stylesNavigation: stylesNavigationPage,
  stylesElements: stylesElementsPage,
  stylesLanguage: stylesLanguagePage,
  ...Object.fromEntries(
    Object.entries(SWITCH_PAGES).map(([kind, [title, rows]]) => [
      kind,
      () =>
        pageHeader(title) +
        `<div class="content flush">${rows.map(([label, key, hint]) => switchSetting(label, key, hint)).join("")}</div>`,
    ]),
  ),
};
// Kinds of pages handled here.
export const SETTINGS_TREE_KINDS = Object.keys(SETTINGS_PAGES);
// HTML of one settings page.
export const settingsTreePage = (kind) => SETTINGS_PAGES[kind]();
