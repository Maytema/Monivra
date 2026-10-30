/* UI kit: pages, sheets, dialogs and pickers */
import { wheelHtml, wheelValues } from "../app/color-wheel.js";
import { render } from "../app/shell.js";
import { isHex, shadesOf } from "../core/color.js";
import {
  CURRENCIES,
  ICON_GROUPS,
  PALETTE,
  QUICK_COLORS,
  TODAY,
  escapeHtml,
  iconSvg,
  newId,
} from "../core/constants.js";
import { appData, locked, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  addDays,
  createBackup,
  dateLabel,
  evaluateExpression,
  parseDate,
  periodBounds,
  periodTitle,
  toIsoDate,
} from "../domain/finance.js";
import { keypadDigits, typeKey } from "../domain/keypad.js";
import { currencyName, currentLocale, translate } from "../i18n/index.js";
import { hintHtml } from "./hint.js";
import { buttonHtml, iconButtonHtml, registerInput, toast } from "./primitives.js";

// Wrap the part of a root screen that slides when swiping between tabs or periods.
export function swipePane(html) {
  return `<div class="swipe-pane">${html}</div>`;
}
// Push a full-screen page onto the page stack.
export function openPage(kind, params = {}) {
  uiState.pages.push({ kind, ...params });
  uiState.layers = [];
  render(true);
}
// Open a bottom sheet or dialog layer.
export function openSheet(fn, title = "", kind = "sheet", anchor = null) {
  uiState.layers.push({ fn, title, kind, anchor, id: newId() });
  render();
}
// Close the top n sheet/dialog layers.
export function closeLayers(n = 1) {
  uiState.layers.splice(Math.max(0, uiState.layers.length - n), n);
  render();
}
// Go back one step: close the top layer, otherwise pop the top page.
export function goBack() {
  if (locked) return;
  if (uiState.numpad) uiState.numpad = null;
  else if (uiState.layers.length) uiState.layers.pop();
  else if (uiState.pages.length) uiState.pages.pop().restore?.();
  else if (uiState.selection) {
    uiState.selection = false;
    uiState.selected = [];
  } else if (uiState.search) {
    uiState.search = false;
  } else if (uiState.tab !== "accounts") uiState.tab = "accounts";
  render();
}
// Reset all pages and layers and show a root tab.
export function goHome(tab) {
  uiState.tab = tab;
  while (uiState.pages.length) uiState.pages.pop().restore?.();
  uiState.layers = [];
  uiState.selection = false;
  uiState.selected = [];
  uiState.search = false;
  render(true);
}
// Close all layers, pop the current page, save, re-render and show a confirmation toast.
export function finishFlow(message = "Saved") {
  uiState.layers = [];
  if (uiState.pages.length) uiState.pages.pop();
  save();
  render();
  toast(message);
}
// Dialog with a title, a message and an OK button.
export function showInfo(message, title = "DEMO") {
  openSheet(
    () =>
      `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${buttonHtml("OK", () => closeLayers(), "primary")}`,
    title,
    "dialog",
  );
}
// Confirmation dialog with an optional "create backup first" checkbox.
export function confirmAction(message, fn, backupOption = true, label = "Confirm") {
  let doBackup = false;
  openSheet(
    () =>
      `<div style="text-align:center;color:var(--negative)">${iconSvg("info", 32)}</div><h2>${translate("Are you sure?")}</h2><p style="text-align:center">${escapeHtml(message)}</p>${backupOption ? `<label class="checkrow"><input type="checkbox" data-input="${registerInput((v) => (doBackup = v))}"><span>${translate("Create a backup first")}</span></label>` : ""}${buttonHtml(
        label,
        () => {
          if (doBackup) createBackup();
          closeLayers();
          try {
            fn();
          } catch (e) {
            toast(e.message);
          }
        },
        label === "Delete" ? "danger" : "primary",
      )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    "Are you sure?",
    "dialog",
  );
}
// Dialog asking for a single line of text.
export function promptText(title, value, fn, label = "Name") {
  let draft = value;
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><label><small>${translate(label)}</small><input aria-label="${escapeHtml(translate(label))}" value="${escapeHtml(draft)}" data-input="${registerInput((v) => (draft = v))}"></label><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          fn(draft);
        },
        "primary",
      )}</div>`,
    title,
    "dialog",
  );
}
// Bottom sheet with radio options.
export function optionSheet(title, options, value, fn) {
  openSheet(
    () =>
      `<h2>${translate(title)}</h2>${options
        .map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return buttonHtml(
            `<span class="grow">${escapeHtml(translate(l))}</span><input type="radio" tabindex="-1" ${value == v ? "checked" : ""} aria-label="${escapeHtml(translate(l))}">`,
            () => {
              closeLayers();
              fn(v);
            },
            "row",
          );
        })
        .join("")}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    title,
  );
}
// Header of a full-screen page: back button, title and extra controls.
export function pageHeader(title, extra = "") {
  return `<div class="topbar">${iconButtonHtml("back", "Back", goBack)}<h1>${translate(title)}</h1>${extra || '<span class="spacer"></span>'}</div>`;
}
// Small menu next to an element (a long press on a chip, say); `items` are [label, handler].
export function popupMenu(element, items) {
  const box = document.getElementById("app").getBoundingClientRect(),
    at = element.getBoundingClientRect();
  const height = items.length * 48 + 16;
  // Below the element when there is room, otherwise above it.
  const below = at.bottom + height + 8 < box.bottom;
  openSheet(
    () =>
      items
        .map(([label, fn]) =>
          buttonHtml(
            label,
            () => {
              closeLayers();
              fn();
            },
            "popup-item",
          ),
        )
        .join(""),
    "Menu",
    "popup",
    { x: at.left - box.left, y: (below ? at.bottom + 4 : at.top - height - 4) - box.top },
  );
}
// Round-cornered tile with a colored icon and a caption, for the action sheets.
export const actionTileHtml = (icon, label, tone, fn) =>
  buttonHtml(
    `<span class="sheet-action-icon" style="--tone:${tone}">${iconSvg(icon, 26)}</span><span>${translate(label)}</span>`,
    fn,
    "sheet-action",
  );
// Period selector bar with previous/next arrows.
export function periodBar() {
  return `<div class="period">${iconButtonHtml("left", "Previous period", () => shiftPeriod(-1))}${buttonHtml(escapeHtml(periodTitle()) + " " + iconSvg("down", 14), periodPicker, "label")}${iconButtonHtml("right", "Next period", () => shiftPeriod(1))}</div>`;
}
// Move the selected period forward or backward.
function shiftPeriod(n) {
  const p = uiState.period;
  if (p.mode === "all") return toast("Choose a period first");
  if (p.mode === "range") {
    const days = Math.round((parseDate(p.to) - parseDate(p.from)) / 86400000) + 1;
    p.from = addDays(p.from, n * days);
    p.to = addDays(p.to, n * days);
  } else if (p.mode === "month" || p.mode === "year") {
    let d = parseDate(p.anchor);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n * (p.mode === "year" ? 12 : 1));
    p.anchor = toIsoDate(d);
  } else p.anchor = addDays(p.anchor, n * (p.mode === "week" ? 7 : 1));
  uiState.donut = null;
  render();
}
// Dialog for the day on which a month starts (payday instead of the 1st).
export function monthStartDialog(onDone) {
  numberPicker("Month starts on", appData.settings.monthStart, (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      toast("Use a day from 1 to 31");
      return false;
    }
    appData.settings.monthStart = n;
    save();
    onDone();
  });
}
// Small caption of an interval tile: the range it would select right now.
function intervalNote(mode) {
  if (!["week", "today", "year", "month"].includes(mode)) return "";
  const period = { mode: mode === "today" ? "day" : mode, anchor: TODAY };
  const [from, to] = periodBounds(period);
  // A week inside one month reads "October 25 - 31".
  if (mode === "week" && from.slice(0, 7) === to.slice(0, 7))
    return `${dateLabel(from, true)} - ${Number(to.slice(8))}`;
  return periodTitle(period);
}
// Sheet for choosing the period mode and range.
export function periodPicker() {
  openSheet(
    () =>
      `<h2>${translate("Time interval")}</h2>${hintHtml("month-start", "Your month can start on payday instead of the 1st. Tap to set it up.", () => monthStartDialog(() => render()))}<div class="interval-grid">${[
        ["range", "Select date range"],
        ["all", "All time"],
        ["day", "Choose a day"],
        ["week", "Week"],
        ["today", "Today"],
        ["year", "Year"],
        ["month", "Month"],
      ]
        .map(([mode, label]) =>
          buttonHtml(
            iconSvg("calendar", 32) +
              translate(label) +
              (intervalNote(mode) ? `<small>${intervalNote(mode)}</small>` : ""),
            () => {
              if (mode === "range") {
                // A period that is already a range is shown, otherwise both ends are still empty.
                const [a, b] = uiState.period.mode === "range" ? periodBounds() : [null, null];
                rangeDialog(a, b, (from, to) => {
                  uiState.period = { mode, from, to, anchor: from };
                  closeLayers();
                });
              } else if (mode === "day")
                calendar(uiState.period.anchor, (s) => {
                  uiState.period = { mode: "day", anchor: s };
                  closeLayers();
                });
              else {
                uiState.period = {
                  mode: mode === "today" ? "day" : mode,
                  anchor: TODAY,
                };
                closeLayers();
              }
            },
            "",
          ),
        )
        .join("")}</div>${buttonHtml("Cancel", () => closeLayers(), "text-button")}`,
    "Time interval",
    "dialog",
  );
}
// Month names and weekday letters in the language of the interface.
const monthTitle = (month) => {
  const title = parseDate(month + "-01").toLocaleDateString(currentLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return title.charAt(0).toUpperCase() + title.slice(1);
};
const weekdayLetters = () => {
  const first = Number(appData.settings.weekStart);
  // 2026-11-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    parseDate(`2026-11-${String(1 + ((first + i) % 7)).padStart(2, "0")}`).toLocaleDateString(
      currentLocale(),
      { weekday: "short", timeZone: "UTC" },
    ),
  );
};
// Month grid of the calendar dialog; `view.month` is the shown month. The title opens a grid
// of years, the arrows move by a month, `pick(date)` handles a tap on a day.
function monthGridHtml(view, chosen, pick) {
  const first = parseDate(view.month + "-01"),
    lead = (first.getUTCDay() - Number(appData.settings.weekStart) + 7) % 7,
    days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const move = (n) => {
    first.setUTCMonth(first.getUTCMonth() + n);
    view.month = toIsoDate(first).slice(0, 7);
    render();
  };
  const year = first.getUTCFullYear();
  const title = buttonHtml(
    `${escapeHtml(monthTitle(view.month))}<span class="calendar-caret ${view.years ? "open" : ""}">${iconSvg("down", 16)}</span>`,
    () => {
      view.years = !view.years;
      render();
    },
    "calendar-title",
  );
  const head = view.years
    ? `<div class="calendar-head">${title}</div>`
    : `<div class="calendar-head">${iconButtonHtml("left", "Previous month", () => move(-1))}${title}${iconButtonHtml("right", "Next month", () => move(1))}</div>`;
  if (view.years)
    return `${head}<div class="calendar-years">${Array.from({ length: 21 }, (_, i) => year - 10 + i)
      .map((y) =>
        buttonHtml(
          String(y),
          () => {
            view.month = `${y}${view.month.slice(4)}`;
            view.years = false;
            render();
          },
          y === year ? "active" : "",
        ),
      )
      .join("")}</div>`;
  return `${head}<div class="calendar">${weekdayLetters()
    .map((x) => `<small>${escapeHtml(x)}</small>`)
    .join("")}${"<span></span>".repeat(lead)}${Array.from({ length: days }, (_, i) => {
    const date = `${view.month}-${String(i + 1).padStart(2, "0")}`;
    return buttonHtml(
      String(i + 1),
      () => pick(date),
      `calendar-day ${date === TODAY ? "today" : ""} ${date === chosen ? "active" : ""}`,
    );
  }).join("")}</div>`;
}
// Calendar dialog for picking a date.
export function calendar(value, done) {
  let chosen = value;
  const view = { month: value.slice(0, 7), years: false };
  openSheet(
    () =>
      `<small class="calendar-caption">${translate("Select date")}</small><h2>${escapeHtml(dateLabel(chosen))}</h2>${monthGridHtml(
        view,
        chosen,
        (date) => {
          chosen = date;
          render();
        },
      )}<div class="dialog-actions">${buttonHtml(
        "Today",
        () => {
          chosen = TODAY;
          view.month = TODAY.slice(0, 7);
          view.years = false;
          render();
        },
        "text-button calendar-today",
      )}${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          done(chosen);
        },
        "primary",
      )}</div>`,
    "Select date",
    "dialog",
  );
}
// Dialog for a period: two tiles open the calendar for the first and the last day.
export function rangeDialog(from, to, done) {
  const tile = (label, date, set) =>
    buttonHtml(
      `${iconSvg("calendar", 28)}<small>${translate(label)}</small><strong>${date ? escapeHtml(dateLabel(date, true)) : translate("Select date")}</strong>`,
      () =>
        calendar(date || TODAY, (picked) => {
          set(picked);
          render();
        }),
      `range-tile ${date ? "chosen" : ""}`,
    );
  openSheet(
    () =>
      `<h2>${translate("Select range")}</h2><div class="range-tiles">${tile("From", from, (d) => (from = d))}${tile("To", to, (d) => (to = d))}</div><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          closeLayers();
          done(...[from, to].sort());
        },
        "primary",
        from && to ? "" : "disabled",
      )}</div>`,
    "Select range",
    "dialog",
  );
}
// Sheet for choosing a currency with search.
export function currencyPicker(value, fn) {
  let q = "";
  const majors = ["AUD", "GBP", "CAD", "CNY", "EUR", "JPY", "CHF", "USD"];
  const symbols = {
    KGS: "KGS",
    USD: "$",
    EUR: "€",
    RUB: "₽",
    TJS: "TJS",
    KZT: "₸",
    CNY: "CN¥",
    GBP: "£",
    AUD: "A$",
    CAD: "CA$",
    JPY: "¥",
    CHF: "CHF",
  };
  const used = () =>
    new Set([
      appData.settings.currency,
      ...appData.accounts.map((a) => a.currency),
      ...appData.categories.map((c) => c.currency),
    ]);
  openSheet(
    () => {
      const matches = CURRENCIES.map(([id, english]) => [
        id,
        currencyName(id, english),
        english,
      ]).filter(([id, name, english]) =>
        (id + " " + name + " " + english).toLowerCase().includes(q.toLowerCase()),
      );
      const selected = used();
      const groups = [
        ["Currencies used", matches.filter(([id]) => selected.has(id))],
        ["Major currencies", matches.filter(([id]) => majors.includes(id))],
        ["Other currencies", matches.filter(([id]) => !selected.has(id) && !majors.includes(id))],
      ];
      return `<div class="currency-sheet"><div class="currency-sheet-head">${buttonHtml(iconSvg("close", 27), () => closeLayers(), "currency-sheet-close", 'aria-label="Close currency selection"')}<h2>Select currency</h2><span></span></div><div class="currency-sheet-search"><span>${iconSvg("search", 23)}</span><input aria-label="Title or code" placeholder="Title or code" value="${escapeHtml(q)}" data-input="${registerInput(
        (v) => {
          q = v;
          render();
        },
      )}">${buttonHtml(
        iconSvg("close", 23),
        () => {
          q = "";
          render();
        },
        "currency-sheet-clear",
        'aria-label="Clear search"',
      )}</div><div class="currency-sheet-scroll">${groups
        .map(([label, items]) =>
          items.length
            ? `<h3>${label}</h3>${items
                .map(([id, name]) =>
                  buttonHtml(
                    `<span class="currency-sheet-radio ${value === id ? "selected" : ""}"></span><span class="currency-sheet-name">${escapeHtml(name)}</span><span class="currency-sheet-symbol">${escapeHtml(symbols[id] || id)}</span>`,
                    () => {
                      closeLayers();
                      fn(id);
                    },
                    "currency-sheet-row",
                    `aria-label="${escapeHtml(name)} ${escapeHtml(id)}"`,
                  ),
                )
                .join("")}`
            : "",
        )
        .join(
          "",
        )}${!matches.length ? '<div class="empty">No currencies found</div>' : ""}</div></div>`;
    },
    "Select currency",
    "full",
  );
}
// Sheet for choosing an icon and color for an account or category.
export function iconPicker(obj) {
  const names = ICON_GROUPS.flatMap(([, keys]) => keys),
    excluded = () => appData.settings.randomSelectionFlags || {};
  const used = (key, kind) =>
    new Set(
      (kind === "accounts" ? appData.accounts : appData.categories).map((x) =>
        String(x[key] || "").toLowerCase(),
      ),
    );
  const allowedIcons = () =>
    names.filter(
      (x) =>
        !(excluded().iconAccounts && used("icon", "accounts").has(x.toLowerCase())) &&
        !(excluded().iconCategories && used("icon", "categories").has(x.toLowerCase())),
    );
  const allowedColors = () =>
    PALETTE.filter(
      (x) =>
        !(excluded().colorAccounts && used("color", "accounts").has(x.toLowerCase())) &&
        !(excluded().colorCategories && used("color", "categories").has(x.toLowerCase())),
    );
  const chooseRandom = (what) => {
    const icons = allowedIcons(),
      colors = allowedColors();
    if (
      ((what === "icon" || what === "both") && !icons.length) ||
      ((what === "color" || what === "both") && !colors.length)
    )
      return toast("No icons or colors available");
    if (what !== "color") obj.icon = icons[Math.floor(Math.random() * icons.length)];
    if (what !== "icon") obj.color = colors[Math.floor(Math.random() * colors.length)];
    render();
  };
  const randomSettings = () => {
    let working = {
      iconAccounts: false,
      iconCategories: false,
      colorAccounts: false,
      colorCategories: false,
      ...excluded(),
    };
    const item = (label, key) =>
      `<div class="customize-setting-row"><span>${label}</span>${buttonHtml(
        `<span class="customize-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "customize-switch",
        `role="switch" aria-checked="${working[key]}" aria-label="${label}"`,
      )}</div>`;
    openSheet(
      () =>
        `<div class="customize-settings"><h2>Setting random selection</h2><p>With this setting, you can exclude icons and colors selected for current accounts and categories from random selection.</p><h3>Icons</h3><div class="customize-setting-card">${item("Exclude selected in accounts", "iconAccounts")}${item("Exclude selected in categories", "iconCategories")}</div><h3>Colors</h3><div class="customize-setting-card">${item("Exclude selected in accounts", "colorAccounts")}${item("Exclude selected in categories", "colorCategories")}</div><div class="customize-setting-actions">${buttonHtml("Cancel", () => closeLayers(), "customize-cancel")}${buttonHtml(
          "Complete",
          () => {
            appData.settings.randomSelectionFlags = working;
            save();
            closeLayers();
          },
          "customize-primary",
        )}</div></div>`,
      "Setting random selection",
      "dialog",
    );
  };
  const chooseIcon = () => {
    openSheet(() => {
      return `<div class="picker-icon-picker"><div class="picker-head">${buttonHtml(iconSvg("left", 23), () => closeLayers(), "picker-back", 'aria-label="Back"')}<h2>Select an icon</h2>${buttonHtml(iconSvg("gear", 23), () => pickerSettings("icon"), "picker-gear", 'aria-label="Icon selection settings"')}</div><div class="picker-list">${ICON_GROUPS.map(
        ([title, keys]) =>
          `<div class="picker-icon-group"><div class="picker-icon-group-title"><span>${translate(title)}</span></div><div class="picker-icon-grid">${keys
            .map((x) =>
              buttonHtml(
                iconSvg(x, 25),
                () => {
                  obj.icon = x;
                  closeLayers();
                },
                "picker-icon-cell " + (obj.icon === x ? "selected" : ""),
                `aria-label="${x}" title="${x}"`,
              ),
            )
            .join("")}</div></div>`,
      ).join("")}</div></div>`;
    }, "Select an icon");
  };
  const pickerSettings = (mode = "icon") => {
    const isColor = mode === "color";
    let working = {
      ...(appData.settings[isColor ? "colorPickerExclusions" : "iconPickerExclusions"] || {}),
    };
    const keys = isColor
      ? ["colorAccounts", "colorCategories"]
      : ["iconAccounts", "iconCategories"];
    const row = (label, key) =>
      `<div class="picker-setting-row"><span>${label}</span>${buttonHtml(
        `<span class="customize-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "customize-switch",
        `role="switch" aria-checked="${!!working[key]}"`,
      )}</div>`;
    openSheet(
      () =>
        `<div class="picker-settings"><h2>${translate(isColor ? "Colors list customization" : "Icon list customization")}</h2><p>${translate(isColor ? "With this setting, you can exclude colors selected for current accounts and categories from the colors list." : "With this setting, you can exclude icons selected for current accounts and categories from the icons list.")}</p><div class="picker-setting-rows">${row("Exclude selected in accounts", keys[0])}${row("Exclude selected in categories", keys[1])}</div><div class="picker-setting-buttons">${buttonHtml("Cancel", () => closeLayers(), "customize-cancel")}${buttonHtml(
          "Complete",
          () => {
            appData.settings[isColor ? "colorPickerExclusions" : "iconPickerExclusions"] = working;
            save();
            closeLayers();
          },
          "customize-primary",
        )}</div></div>`,
      "List customization",
      "dialog",
    );
  };
  const chooseColor = () => {
    let pending = obj.color,
      lastHue = 0;
    const swatch = (color, size) =>
      buttonHtml(
        pending.toLowerCase() === color.toLowerCase() ? iconSvg("check", 16) : "",
        () => {
          pending = color;
          render();
        },
        `picker-swatch ${size}`,
        `style="background:${color}" aria-label="Color ${color}"`,
      );
    openSheet(() => {
      lastHue = wheelValues(pending, lastHue)[0];
      return `<div class="picker-color-picker picker-color-page" style="--picked:${pending}"><div class="picker-head">${buttonHtml(iconSvg("left", 23), () => closeLayers(), "picker-back", 'aria-label="Back"')}<h2>Choose color</h2>${buttonHtml(iconSvg("gear", 23), () => pickerSettings("color"), "picker-gear", 'aria-label="Color list customization"')}</div><div class="picker-scroll"><div class="picker-color-preview">${iconSvg(obj.icon, 32)}</div>${wheelHtml(
        pending,
        lastHue,
        (c) => (pending = c),
        () => render(),
      )}<div class="picker-row picker-quick">${QUICK_COLORS.map((c) => swatch(c, "large")).join("")}</div><div class="picker-row picker-shades">${shadesOf(
        pending,
      )
        .map((c) => swatch(c, "small"))
        .join(
          "",
        )}</div><label class="picker-hex"><span>HEX</span><input aria-label="Color code" maxlength="7" autocapitalize="off" spellcheck="false" value="${pending}" data-input="${registerInput(
        (v) => {
          const code = v.startsWith("#") ? v : "#" + v;
          if (!isHex(code)) return;
          pending = code.toLowerCase();
          render();
        },
      )}"></label></div>${buttonHtml(
        "Complete",
        () => {
          obj.color = pending;
          closeLayers();
        },
        "customize-complete",
      )}</div>`;
    }, "Choose color");
  };
  const action = (icon, label, fn) =>
    buttonHtml(
      `<span class="customize-action-icon">${iconSvg(icon, 25)}</span><span>${label}</span>`,
      fn,
      "customize-action",
    );
  openSheet(
    () =>
      `<div class="customize-customize"><div class="customize-preview" style="color:${obj.color};background:color-mix(in srgb,${obj.color} 17%,#fffafe)">${iconSvg(obj.icon, 34)}</div><h2>Customize icon</h2><div class="customize-choices">${action("smile", "Choose an icon", chooseIcon)}${action("palette", "Choose color", chooseColor)}</div><div class="customize-actions">${action("gear", "✦ Setting random selection", randomSettings)}${action("smile", "✦ Random icon", () => chooseRandom("icon"))}${action("palette", "✦ Random color", () => chooseRandom("color"))}${action("spark", "Random icon and color", () => chooseRandom("both"))}</div>${buttonHtml("Complete", () => closeLayers(), "customize-complete")}</div>`,
    "Customize icon",
    "dialog",
  );
}
// Sheet with a calculator keypad for entering an amount: the typed expression is shown
// at the top, "=" replaces the check mark while an operation is waiting to be calculated.
export function amountPicker(title, value, fn, allowNegative = false, currency = "") {
  let expr = String(value / 100);
  // The first digit typed over a shown value starts a new number; an operator continues it.
  let fresh = value !== 0;
  const unit = currency || appData.settings.currency;
  openSheet(
    () =>
      `<div class="calc-readout" aria-live="polite" aria-label="${translate("Amount")}">${escapeHtml(
        expr.replace(/[\d.]+/g, (n) => `${n} ${unit}`).replace(/[÷×−+]/g, " $& "),
      )}</div>${calculatorKeys(
        () => expr,
        (v) => (expr = v),
        () => {
          const was = fresh;
          fresh = false;
          return was;
        },
        () => {
          try {
            let n = evaluateExpression(expr);
            if (n < 0 && !allowNegative) throw Error("Use a non-negative amount");
            closeLayers();
            fn(n);
          } catch (e) {
            toast(e.message);
          }
        },
      )}`,
    title,
  );
}
// Digit keypad shared by the number sheet and the docked keypad: the digits and a backspace
// in four columns, the tall confirm key at the right, the zero filling the last row
// (next to the dot when decimals are allowed; the dot is off once the number has one).
function digitPadHtml(press, confirm, decimal, text = "") {
  const digits = keypadDigits();
  const digit = (i) => buttonHtml(digits[i], () => press(digits[i]), "key");
  return `<div class="keypad digit-pad ${decimal ? "has-dot" : ""}">${digit(0)}${digit(1)}${digit(2)}${buttonHtml(
    iconSvg("backspace", 26),
    () => press("⌫"),
    "key",
    `aria-label="${translate("Backspace")}"`,
  )}${digit(3)}${digit(4)}${digit(5)}${buttonHtml(
    iconSvg("check", 30),
    confirm,
    "key ok",
    `aria-label="${translate("Save")}"`,
  )}${digit(6)}${digit(7)}${digit(8)}${buttonHtml("0", () => press("0"), "key zero-wide")}${
    decimal ? buttonHtml(".", () => press("."), "key", text.includes(".") ? "disabled" : "") : ""
  }</div>`;
}
// The text after a key of the digit keypad; `maxLength` limits the digits.
function typeDigit(text, key, { decimal = false, maxLength = 12 }, fresh = false) {
  const base = fresh ? "" : text;
  if (key === "⌫") return base.slice(0, -1);
  if (key === "." && (!decimal || base.includes("."))) return base;
  if (base.length >= maxLength) return base;
  return base + (key === "." && !base ? "0." : key);
}
// Sheet with a digit keypad for a plain number (a day, an exchange rate).
// `fn` gets the typed text; returning false keeps the sheet open.
export function numberPicker(title, value, fn, options = {}) {
  let text = value === null || value === undefined ? "" : String(value);
  let fresh = text !== "";
  const press = (k) => {
    text = typeDigit(text, k, options, fresh && k !== "⌫");
    fresh = false;
    render();
  };
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><div class="number-display" aria-live="polite">${escapeHtml(options.mask ? "•".repeat(text.length) : text) || "&nbsp;"}</div>${digitPadHtml(
        press,
        () => {
          if (fn(text) !== false) closeLayers();
        },
        options.decimal,
        text,
      )}`,
    title,
  );
}
// Form field that shows a number. Tapping it docks the digit keypad at the bottom of the screen
// and the digits go straight into the field.
export const numberFieldHtml = (label, value, fn, options = {}) => {
  const active = uiState.numpad?.label === label;
  const text = active
    ? uiState.numpad.text
    : value === null || value === undefined
      ? ""
      : String(value);
  const shown = options.mask ? "•".repeat(text.length) : text;
  return buttonHtml(
    `<span class="field-label">${translate(label)}</span><span class="value">${escapeHtml(shown) || (active || options.hint ? "" : "—")}${active ? '<i class="typing-caret"></i>' : ""}${!shown && options.hint ? `<small class="field-hint">${translate(options.hint)}</small>` : ""}</span>`,
    () => {
      uiState.numpad = {
        label,
        text: String(value ?? ""),
        fresh: String(value ?? "") !== "",
        fn,
        options,
      };
      render();
    },
    `field ${active ? "is-active" : ""}`,
    `data-numfield="${escapeHtml(label)}" aria-label="${escapeHtml(translate(label))}"`,
  );
};
// The docked keypad of the field being typed in, or an empty string.
export function numpadDockHtml() {
  const pad = uiState.numpad;
  if (!pad) return "";
  const press = (k) => {
    pad.text = typeDigit(pad.text, k, pad.options, pad.fresh && k !== "⌫");
    pad.fresh = false;
    pad.fn(pad.text);
    render();
  };
  return `<div class="numpad-dock">${digitPadHtml(
    press,
    () => {
      uiState.numpad = null;
      render();
    },
    pad.options.decimal,
    pad.text,
  )}</div>`;
}

// Calculator keypad shared by all amount inputs. The operators stand in the first column,
// the digits in the middle, the backspace and the tall confirm key at the right.
function calculatorKeys(get, set, takeFresh, done) {
  const press = (k) => {
    try {
      const startsNumber = takeFresh() && /^[\d.]$/.test(k);
      set(typeKey(get(), k, startsNumber));
    } catch (e) {
      toast(e.message);
    }
    render();
  };
  const digits = keypadDigits();
  const pending = /\d[÷×−+]/.test(get());
  const key = (label, fn, cls = "", attrs = "") =>
    buttonHtml(label, fn, `key ${cls}`.trim(), attrs);
  const digit = (i) => key(digits[i], () => press(digits[i]));
  const op = (symbol) => key(symbol, () => press(symbol), "calc-op");
  // Placed row by row; the confirm key spans the three lower rows of the last column.
  return `<div class="keypad calc-pad">${op("÷")}${digit(0)}${digit(1)}${digit(2)}${key(
    iconSvg("backspace", 26),
    () => press("⌫"),
    "",
    `aria-label="${translate("Backspace")}"`,
  )}${op("×")}${digit(3)}${digit(4)}${digit(5)}${key(
    pending ? "=" : iconSvg("check", 30),
    pending ? () => press("=") : done,
    "ok",
    `aria-label="${translate(pending ? "Calculate" : "Save")}"`,
  )}${op("−")}${digit(6)}${digit(7)}${digit(8)}${op("+")}${key("0", () => press("0"), "calc-zero")}${key(".", () => press("."), "", /\.\d*$/.test(get()) ? "disabled" : "")}</div>`;
}

/* Empty states: a small illustration with a title and a hint; it plays once, the first time it is shown. */
const EMPTY_ILLUSTRATIONS = {
  // One sheet of paper rolled up at the top and the bottom, with a lens that finds nothing.
  operations: `<svg class="empty-art" viewBox="-6 -6 342 342" aria-hidden="true"><g class="empty-paper"><path class="empty-edge" d="M263 6H96A48 48 0 0 0 48 54V128M48 138V143M48 171V270M266 67V262C266 300 252 328 238 328"/><path class="empty-roll" d="M263 6h40a25 25 0 0 1 25 25V67H263zM7 270H188C188 305 206 328 238 328H37A30 30 0 0 1 7 298z"/></g><path class="empty-line" style="--i:0" pathLength="1" d="M89 65H235"/><path class="empty-line" style="--i:1" pathLength="1" d="M89 115H208"/><path class="empty-line" style="--i:2" pathLength="1" d="M89 168H152"/><path class="empty-line" style="--i:3" pathLength="1" d="M89 220H152"/><g class="empty-search"><circle class="empty-lens" cx="259" cy="152" r="62"/><path class="empty-handle" d="m303 197 24 28"/><path class="empty-cross" d="m237 130 44 44m0-44-44 44"/></g></svg>`,
  statistics: `<svg class="empty-art" viewBox="0 0 120 120" aria-hidden="true"><rect class="bar" style="--i:0" x="10" y="80" width="12" height="20" rx="4"/><rect class="bar" style="--i:1" x="28" y="68" width="12" height="32" rx="4"/><rect class="bar" style="--i:2" x="46" y="56" width="12" height="44" rx="4"/><rect class="bar" style="--i:3" x="64" y="44" width="12" height="56" rx="4"/><rect class="bar" style="--i:4" x="82" y="32" width="12" height="68" rx="4"/><rect class="bar" style="--i:5" x="100" y="20" width="12" height="80" rx="4"/><path class="empty-arrow" pathLength="1" d="M12 52C40 54 70 30 106 4L93.0 4.9 106 4 101.1 16.0"/></svg>`,
};
// When each illustration was first shown (ms); the play class lasts while its animation runs.
const firstShown = {};
const PLAY_MS = 3800;
// Empty-state block; `kind` is "operations" or "statistics".
export function emptyStateHtml(kind, title, hint) {
  firstShown[kind] ??= performance.now();
  const elapsed = performance.now() - firstShown[kind];
  // A redraw while the animation runs continues it from where it was.
  const art = EMPTY_ILLUSTRATIONS[kind].replace(
    "<svg ",
    elapsed < PLAY_MS ? `<svg data-play style="--elapsed:-${Math.round(elapsed)}ms" ` : "<svg ",
  );
  return `<div class="empty-state">${art}<h3>${translate(title)}</h3><p>${translate(hint)}</p></div>`;
}

// Strip of tabs: `tabs` are [id, label] pairs; `onChange(id)` runs before the redraw.
export function tabsHtml(tabs, active, onChange, className = "tabs") {
  return `<div class="${className}">${tabs
    .map(([id, label]) =>
      buttonHtml(
        translate(label),
        () => {
          onChange(id);
          render();
        },
        active === id ? "active" : "",
      ),
    )
    .join("")}</div>`;
}
