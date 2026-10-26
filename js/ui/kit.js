/* UI kit: pages, sheets, dialogs and pickers */
import { render } from "../app/shell.js";
import {
  CURRENCIES,
  ICONS,
  PALETTE,
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
import {
  buttonHtml,
  iconButtonHtml,
  registerInput,
  textFieldHtml,
  toast,
  translate,
} from "./primitives.js";

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
export function openSheet(fn, title = "", kind = "sheet") {
  uiState.layers.push({ fn, title, kind, id: newId() });
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
  if (uiState.layers.length) uiState.layers.pop();
  else if (uiState.pages.length) uiState.pages.pop();
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
  uiState.pages = [];
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
// Sheet for choosing the period mode and range.
export function periodPicker() {
  openSheet(
    () =>
      `<h2>${translate("Time interval")}</h2><div class="interval-grid">${[
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
            iconSvg("calendar", 32) + translate(label),
            () => {
              if (mode === "range") {
                let [a, b] = periodBounds();
                if (a.startsWith("0000")) a = TODAY;
                if (b.startsWith("9999")) b = TODAY;
                openSheet(
                  () =>
                    `<h2>${translate("Select range")}</h2>${textFieldHtml("From", a, (v) => (a = v), "", "date")}${textFieldHtml("To", b, (v) => (b = v), "", "date")}${buttonHtml(
                      "OK",
                      () => {
                        if (a > b) return toast("Start date must not follow end date");
                        uiState.period = { mode, from: a, to: b, anchor: a };
                        closeLayers(2);
                      },
                      "primary",
                    )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
                  "Select range",
                  "dialog",
                );
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
// Calendar sheet for picking a date.
export function calendar(value, done) {
  let chosen = value,
    month = value.slice(0, 7);
  openSheet(
    () => {
      const d = parseDate(month + "-01"),
        start = d.getUTCDay(),
        days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const move = (n) => {
        d.setUTCMonth(d.getUTCMonth() + n);
        month = toIsoDate(d).slice(0, 7);
        render();
      };
      return `<small>${translate("Select date")}</small><h2>${escapeHtml(dateLabel(chosen))}</h2><input type="date" aria-label="Date" value="${chosen}" data-input="${registerInput(
        (v) => {
          if (v) chosen = v;
        },
      )}"><div class="calendar-head">${iconButtonHtml("left", "Previous month", () => move(-1))}<span>${month}</span>${iconButtonHtml("right", "Next month", () => move(1))}</div><div class="calendar">${["S", "M", "T", "W", "T", "F", "S"].map((x) => `<small>${x}</small>`).join("")}${"<span></span>".repeat(start)}${Array.from(
        { length: days },
        (_, i) => {
          let s = month + "-" + String(i + 1).padStart(2, "0");
          return buttonHtml(
            String(i + 1),
            () => {
              chosen = s;
              render();
            },
            `${s === chosen ? "active" : s === TODAY ? "today" : ""}`,
          );
        },
      ).join(
        "",
      )}</div><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          if (!chosen) return;
          closeLayers();
          done(chosen);
        },
        "primary",
      )}</div>`;
    },
    "Select date",
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
      const matches = CURRENCIES.filter(([id, name]) =>
        (id + " " + name).toLowerCase().includes(q.toLowerCase()),
      );
      const selected = used();
      const groups = [
        ["Currencies used", matches.filter(([id]) => selected.has(id))],
        ["Major currencies", matches.filter(([id]) => majors.includes(id))],
        ["Other currencies", matches.filter(([id]) => !selected.has(id) && !majors.includes(id))],
      ];
      return `<div class="mon-currency-sheet"><div class="mon-currency-sheet-head">${buttonHtml(iconSvg("close", 27), () => closeLayers(), "mon-currency-sheet-close", 'aria-label="Close currency selection"')}<h2>Select currency</h2><span></span></div><div class="mon-currency-sheet-search"><span>${iconSvg("search", 23)}</span><input aria-label="Title or code" placeholder="Title or code" value="${escapeHtml(q)}" data-input="${registerInput(
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
        "mon-currency-sheet-clear",
        'aria-label="Clear search"',
      )}</div><div class="mon-currency-sheet-scroll">${groups
        .map(([label, items]) =>
          items.length
            ? `<h3>${label}</h3>${items
                .map(([id, name]) =>
                  buttonHtml(
                    `<span class="mon-currency-sheet-radio ${value === id ? "selected" : ""}"></span><span class="mon-currency-sheet-name">${escapeHtml(name)}</span><span class="mon-currency-sheet-symbol">${escapeHtml(symbols[id] || id)}</span>`,
                    () => {
                      closeLayers();
                      fn(id);
                    },
                    "mon-currency-sheet-row",
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
  const names = Object.keys(ICONS),
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
      `<div class="mon-customize-setting-row"><span>${label}</span>${buttonHtml(
        `<span class="mon-customize-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "mon-customize-switch",
        `role="switch" aria-checked="${working[key]}" aria-label="${label}"`,
      )}</div>`;
    openSheet(
      () =>
        `<div class="mon-customize-settings"><h2>Setting random selection</h2><p>With this setting, you can exclude icons and colors selected for current accounts and categories from random selection.</p><h3>Icons</h3><div class="mon-customize-setting-card">${item("Exclude selected in accounts", "iconAccounts")}${item("Exclude selected in categories", "iconCategories")}</div><h3>Colors</h3><div class="mon-customize-setting-card">${item("Exclude selected in accounts", "colorAccounts")}${item("Exclude selected in categories", "colorCategories")}</div><div class="mon-customize-setting-actions">${buttonHtml("Cancel", () => closeLayers(), "mon-customize-cancel")}${buttonHtml(
          "Complete",
          () => {
            appData.settings.randomSelectionFlags = working;
            save();
            closeLayers();
          },
          "mon-customize-primary",
        )}</div></div>`,
      "Setting random selection",
      "dialog",
    );
  };
  const iconGroups = [
    [
      "Common",
      [
        "wallet",
        "card",
        "cash",
        "calendar",
        "settings",
        "star",
        "help",
        "info",
        "tag",
        "gift",
        "briefcase",
        "receipt",
      ],
    ],
    ["Food and drink", ["pizza"]],
    ["Buildings", ["home"]],
    ["Health and medicine", ["heart"]],
    ["Delivery", ["transfer", "upload", "download"]],
    ["Leisure", ["bike", "camera", "image", "play"]],
    ["People", ["user", "smile"]],
    ["Nature", ["paw", "sun"]],
    ["Other", names],
  ];
  const chooseIcon = () => {
    let chosen = obj.icon;
    openSheet(() => {
      const usedNames = new Set();
      const groups = iconGroups
        .map(([title, keys]) => [
          title,
          keys.filter((k) => names.includes(k) && !usedNames.has(k) && !!usedNames.add(k)),
        ])
        .filter(([, keys]) => keys.length);
      return `<div class="mon-picker-icon-picker"><div class="mon-picker-head">${buttonHtml(iconSvg("left", 23), () => closeLayers(), "mon-picker-back", 'aria-label="Back"')}<h2>Select an icon</h2>${buttonHtml(iconSvg("gear", 23), () => pickerSettings("icon"), "mon-picker-gear", 'aria-label="Icon selection settings"')}</div><div class="mon-picker-list">${groups
        .map(
          ([title, keys]) =>
            `<div class="mon-picker-icon-group"><div class="mon-picker-group-title"><span>${title}</span></div><div class="mon-picker-icon-grid">${keys
              .map((x) =>
                buttonHtml(
                  iconSvg(x, 25),
                  () => {
                    obj.icon = x;
                    closeLayers();
                  },
                  "mon-picker-icon-cell " + (obj.icon === x ? "selected" : ""),
                  `aria-label="${x}" title="${x}"`,
                ),
              )
              .join("")}</div></div>`,
        )
        .join("")}</div></div>`;
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
      `<div class="mon-picker-setting-row"><span>${label}</span>${buttonHtml(
        `<span class="mon-customize-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "mon-customize-switch",
        `role="switch" aria-checked="${!!working[key]}"`,
      )}</div>`;
    openSheet(
      () =>
        `<div class="mon-picker-settings"><h2>${isColor ? "Colors" : "Icon"} list customization</h2><p>With this setting, you can exclude ${isColor ? "colors" : "icons"} selected for current accounts and categories from the ${isColor ? "colors" : "icons"} list.</p><div class="mon-picker-setting-rows">${row("Exclude selected in accounts", keys[0])}${row("Exclude selected in categories", keys[1])}</div><div class="mon-picker-setting-buttons">${buttonHtml("Cancel", () => closeLayers(), "mon-customize-cancel")}${buttonHtml(
          "Complete",
          () => {
            appData.settings[isColor ? "colorPickerExclusions" : "iconPickerExclusions"] = working;
            save();
            closeLayers();
          },
          "mon-customize-primary",
        )}</div></div>`,
      "List customization",
      "dialog",
    );
  };
  const chooseColor = () => {
    let pending = obj.color;
    const colors = Array.from({ length: 16 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => {
        const hue = (c * 36 + r * 7) % 360;
        const light = 32 + r * 3.3;
        return `hsl(${hue} 75% ${light}%)`;
      }),
    );
    const grid = () =>
      colors
        .map((row, r) =>
          row
            .map((color, c) =>
              buttonHtml(
                pending === color ? iconSvg("check", 19) : "",
                () => {
                  pending = color;
                  render();
                },
                "mon-picker-color-tile",
                `style="background:${color}" aria-label="Color row ${r + 1} column ${c + 1}"`,
              ),
            )
            .join(""),
        )
        .join("");
    openSheet(
      () =>
        `<div class="mon-picker-color-picker mon-picker-color-page"><div class="mon-picker-head">${buttonHtml(iconSvg("left", 23), () => closeLayers(), "mon-picker-back", 'aria-label="Back"')}<h2>Choose color</h2>${buttonHtml(iconSvg("gear", 23), () => pickerSettings("color"), "mon-picker-gear", 'aria-label="Color list customization"')}</div><div class="mon-picker-color-preview" style="color:${pending};background:color-mix(in srgb,${pending} 20%,#fffafe)">${iconSvg(obj.icon, 32)}</div><p class="mon-picker-color-hint">You can scroll colors horizontally or vertically.</p><div class="mon-picker-color-grid">${grid()}</div><div class="mon-picker-color-quick">${PALETTE.map(
          (c) =>
            buttonHtml(
              pending === c ? iconSvg("check", 14) : "",
              () => {
                pending = c;
                render();
              },
              "mon-picker-quick-swatch",
              `style="background:${c}" aria-label="Color ${c}"`,
            ),
        ).join("")}</div>${buttonHtml(
          "Complete",
          () => {
            obj.color = pending;
            closeLayers();
          },
          "mon-customize-complete",
        )}</div>`,
      "Choose color",
    );
  };
  const action = (icon, label, fn) =>
    buttonHtml(
      `<span class="mon-customize-action-icon">${iconSvg(icon, 25)}</span><span>${label}</span>`,
      fn,
      "mon-customize-action",
    );
  openSheet(
    () =>
      `<div class="mon-customize-customize"><div class="mon-customize-preview" style="color:${obj.color};background:color-mix(in srgb,${obj.color} 17%,#fffafe)">${iconSvg(obj.icon, 34)}</div><h2>Customize icon</h2><div class="mon-customize-choices">${action("smile", "Choose an icon", chooseIcon)}${action("palette", "Choose color", chooseColor)}</div><div class="mon-customize-actions">${action("gear", "✦ Setting random selection", randomSettings)}${action("smile", "✦ Random icon", () => chooseRandom("icon"))}${action("palette", "✦ Random color", () => chooseRandom("color"))}${action("spark", "Random icon and color", () => chooseRandom("both"))}</div>${buttonHtml("Complete", () => closeLayers(), "mon-customize-complete")}</div>`,
    "Customize icon",
    "dialog",
  );
}
// Sheet with a calculator keypad for entering an amount.
export function amountPicker(title, value, fn, allowNegative = false) {
  let expr = String(value / 100);
  openSheet(
    () =>
      `<h2>${translate(title)}</h2><input type="text" inputmode="decimal" aria-label="Amount" value="${escapeHtml(expr)}" data-input="${registerInput((v) => (expr = v))}">${calculatorKeys(
        () => expr,
        (v) => (expr = v),
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
// Calculator keypad shared by all amount inputs.
export function calculatorKeys(get, set, done) {
  let nums = appData.settings.reverseKeys
    ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    : ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  const press = (k) => {
    if (k === "⌫") set(get().slice(0, -1) || "0");
    else if (k === "C") set("0");
    else if (k === "=") {
      try {
        set(String(evaluateExpression(get()) / 100));
      } catch (e) {
        toast(e.message);
      }
    } else set((get() === "0" && /[\d.]/.test(k) ? (k === "." ? "0" : "") : get()) + k);
    render();
  };
  const cells = [
    "÷",
    ...nums.slice(0, 3),
    "⌫",
    "×",
    ...nums.slice(3, 6),
    "…",
    "−",
    ...nums.slice(6, 9),
    "+",
    "C",
    "0",
    ".",
  ];
  return `<div class="keypad">${cells.map((k) => buttonHtml(k, k === "…" ? () => optionSheet("Calculator", ["Calculate", "Clear"], null, (v) => press(v === "Clear" ? "C" : "=")) : () => press(k), "key", `aria-label="${k === "⌫" ? "Backspace" : k === "C" ? "Clear amount" : k}"`)).join("")}${buttonHtml(iconSvg("check", 30), done, "key ok", `aria-label="${translate("Save")}"`)}</div>`;
}
