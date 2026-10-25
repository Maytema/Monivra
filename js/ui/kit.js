/* UI kit: pages, sheets, dialogs and pickers */
import { render } from "../app/shell.js";
import { CURRENCIES, I, ICONS, PALETTE, TODAY, esc, uid } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  addDays,
  backup,
  bounds,
  calculate,
  dateLabel,
  dateObj,
  iso,
  periodTitle,
} from "../domain/finance.js";
import { B, IB, inp, locked, t, toast, txt } from "./primitives.js";

export function page(kind, params = {}) {
  U.pages.push({ kind, ...params });
  U.layers = [];
  render(true);
}
export function sheet(fn, title = "", kind = "sheet") {
  U.layers.push({ fn, title, kind, id: uid() });
  render();
}
export function close(n = 1) {
  U.layers.splice(Math.max(0, U.layers.length - n), n);
  render();
}
export function back() {
  if (locked) return;
  if (U.layers.length) U.layers.pop();
  else if (U.pages.length) U.pages.pop();
  else if (U.selection) {
    U.selection = false;
    U.selected = [];
  } else if (U.search) {
    U.search = false;
  } else if (U.tab !== "accounts") U.tab = "accounts";
  render();
}
export function home(tab) {
  U.tab = tab;
  U.pages = [];
  U.layers = [];
  U.selection = false;
  U.selected = [];
  U.search = false;
  render(true);
}
export function finish(message = "Saved") {
  U.layers = [];
  if (U.pages.length) U.pages.pop();
  save();
  render();
  toast(message);
}
export function info(message, title = "DEMO") {
  sheet(
    () => `<h2>${esc(title)}</h2><p>${esc(message)}</p>${B("OK", () => close(), "primary")}`,
    title,
    "dialog",
  );
}
export function confirmAction(message, fn, backupOption = true, label = "Confirm") {
  let doBackup = false;
  sheet(
    () =>
      `<div style="text-align:center;color:var(--negative)">${I("info", 32)}</div><h2>${t("Are you sure?")}</h2><p style="text-align:center">${esc(message)}</p>${backupOption ? `<label class="checkrow"><input type="checkbox" data-input="${inp((v) => (doBackup = v))}"><span>${t("Create a backup first")}</span></label>` : ""}${B(
        label,
        () => {
          if (doBackup) backup();
          close();
          try {
            fn();
          } catch (e) {
            toast(e.message);
          }
        },
        label === "Delete" ? "danger" : "primary",
      )}${B("Cancel", () => close(), "outline")}`,
    "Are you sure?",
    "dialog",
  );
}
export function promptText(title, value, fn, label = "Name") {
  let draft = value;
  sheet(
    () =>
      `<h2>${t(title)}</h2><label><small>${t(label)}</small><input aria-label="${esc(t(label))}" value="${esc(draft)}" data-input="${inp((v) => (draft = v))}"></label><div class="dialog-actions">${B("Cancel", () => close(), "text-button")}${B(
        "OK",
        () => {
          close();
          fn(draft);
        },
        "primary",
      )}</div>`,
    title,
    "dialog",
  );
}
export function optionSheet(title, options, value, fn) {
  sheet(
    () =>
      `<h2>${t(title)}</h2>${options
        .map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return B(
            `<span class="grow">${esc(t(l))}</span><input type="radio" tabindex="-1" ${value == v ? "checked" : ""} aria-label="${esc(t(l))}">`,
            () => {
              close();
              fn(v);
            },
            "row",
          );
        })
        .join("")}${B("Cancel", () => close(), "outline")}`,
    title,
  );
}
export function header(title, extra = "") {
  return `<div class="topbar">${IB("back", "Back", back)}<h1>${t(title)}</h1>${extra || '<span class="spacer"></span>'}</div>`;
}
export function periodBar() {
  return `<div class="period">${IB("left", "Previous period", () => shiftPeriod(-1))}${B(esc(periodTitle()) + " " + I("down", 14), periodPicker, "label")}${IB("right", "Next period", () => shiftPeriod(1))}</div>`;
}
function shiftPeriod(n) {
  const p = U.period;
  if (p.mode === "all") return toast("Choose a period first");
  if (p.mode === "range") {
    const days = Math.round((dateObj(p.to) - dateObj(p.from)) / 86400000) + 1;
    p.from = addDays(p.from, n * days);
    p.to = addDays(p.to, n * days);
  } else if (p.mode === "month" || p.mode === "year") {
    let d = dateObj(p.anchor);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n * (p.mode === "year" ? 12 : 1));
    p.anchor = iso(d);
  } else p.anchor = addDays(p.anchor, n * (p.mode === "week" ? 7 : 1));
  U.donut = null;
  render();
}
export function periodPicker() {
  sheet(
    () =>
      `<h2>${t("Time interval")}</h2><div class="interval-grid">${[
        ["range", "Select date range"],
        ["all", "All time"],
        ["day", "Choose a day"],
        ["week", "Week"],
        ["today", "Today"],
        ["year", "Year"],
        ["month", "Month"],
      ]
        .map(([mode, label]) =>
          B(
            I("calendar", 32) + t(label),
            () => {
              if (mode === "range") {
                let [a, b] = bounds();
                if (a.startsWith("0000")) a = TODAY;
                if (b.startsWith("9999")) b = TODAY;
                sheet(
                  () =>
                    `<h2>${t("Select range")}</h2>${txt("From", a, (v) => (a = v), "", "date")}${txt("To", b, (v) => (b = v), "", "date")}${B(
                      "OK",
                      () => {
                        if (a > b) return toast("Start date must not follow end date");
                        U.period = { mode, from: a, to: b, anchor: a };
                        close(2);
                      },
                      "primary",
                    )}${B("Cancel", () => close(), "outline")}`,
                  "Select range",
                  "dialog",
                );
              } else if (mode === "day")
                calendar(U.period.anchor, (s) => {
                  U.period = { mode: "day", anchor: s };
                  close();
                });
              else {
                U.period = {
                  mode: mode === "today" ? "day" : mode,
                  anchor: TODAY,
                };
                close();
              }
            },
            "",
          ),
        )
        .join("")}</div>${B("Cancel", () => close(), "text-button")}`,
    "Time interval",
    "dialog",
  );
}
export function calendar(value, done) {
  let chosen = value,
    month = value.slice(0, 7);
  sheet(
    () => {
      const d = dateObj(month + "-01"),
        start = d.getUTCDay(),
        days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const move = (n) => {
        d.setUTCMonth(d.getUTCMonth() + n);
        month = iso(d).slice(0, 7);
        render();
      };
      return `<small>${t("Select date")}</small><h2>${esc(dateLabel(chosen))}</h2><input type="date" aria-label="Date" value="${chosen}" data-input="${inp(
        (v) => {
          if (v) chosen = v;
        },
      )}"><div class="calendar-head">${IB("left", "Previous month", () => move(-1))}<span>${month}</span>${IB("right", "Next month", () => move(1))}</div><div class="calendar">${["S", "M", "T", "W", "T", "F", "S"].map((x) => `<small>${x}</small>`).join("")}${"<span></span>".repeat(start)}${Array.from(
        { length: days },
        (_, i) => {
          let s = month + "-" + String(i + 1).padStart(2, "0");
          return B(
            String(i + 1),
            () => {
              chosen = s;
              render();
            },
            `${s === chosen ? "active" : s === TODAY ? "today" : ""}`,
          );
        },
      ).join("")}</div><div class="dialog-actions">${B("Cancel", () => close(), "text-button")}${B(
        "OK",
        () => {
          if (!chosen) return;
          close();
          done(chosen);
        },
        "primary",
      )}</div>`;
    },
    "Select date",
    "dialog",
  );
}
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
      D.settings.currency,
      ...D.accounts.map((a) => a.currency),
      ...D.categories.map((c) => c.currency),
    ]);
  sheet(
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
      return `<div class="mon65-currency-picker"><div class="mon65-currency-head">${B(I("close", 27), () => close(), "mon65-currency-close", 'aria-label="Close currency selection"')}<h2>Select currency</h2><span></span></div><div class="mon65-currency-search"><span>${I("search", 23)}</span><input aria-label="Title or code" placeholder="Title or code" value="${esc(q)}" data-input="${inp(
        (v) => {
          q = v;
          render();
        },
      )}">${B(
        I("close", 23),
        () => {
          q = "";
          render();
        },
        "mon65-search-clear",
        'aria-label="Clear search"',
      )}</div><div class="mon65-currency-scroll">${groups
        .map(([label, items]) =>
          items.length
            ? `<h3>${label}</h3>${items
                .map(([id, name]) =>
                  B(
                    `<span class="mon65-currency-radio ${value === id ? "selected" : ""}"></span><span class="mon65-currency-name">${esc(name)}</span><span class="mon65-currency-symbol">${esc(symbols[id] || id)}</span>`,
                    () => {
                      close();
                      fn(id);
                    },
                    "mon65-currency-row",
                    `aria-label="${esc(name)} ${esc(id)}"`,
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
export function iconPicker(obj) {
  const names = Object.keys(ICONS),
    excluded = () => D.settings.randomSelectionFlags || {};
  const used = (key, kind) =>
    new Set(
      (kind === "accounts" ? D.accounts : D.categories).map((x) =>
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
      `<div class="mon61-setting-row"><span>${label}</span>${B(
        `<span class="mon61-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "mon61-switch",
        `role="switch" aria-checked="${working[key]}" aria-label="${label}"`,
      )}</div>`;
    sheet(
      () =>
        `<div class="mon61-settings"><h2>Setting random selection</h2><p>With this setting, you can exclude icons and colors selected for current accounts and categories from random selection.</p><h3>Icons</h3><div class="mon61-setting-card">${item("Exclude selected in accounts", "iconAccounts")}${item("Exclude selected in categories", "iconCategories")}</div><h3>Colors</h3><div class="mon61-setting-card">${item("Exclude selected in accounts", "colorAccounts")}${item("Exclude selected in categories", "colorCategories")}</div><div class="mon61-setting-actions">${B("Cancel", () => close(), "mon61-cancel")}${B(
          "Complete",
          () => {
            D.settings.randomSelectionFlags = working;
            save();
            close();
          },
          "mon61-primary",
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
    sheet(() => {
      const usedNames = new Set();
      const groups = iconGroups
        .map(([title, keys]) => [
          title,
          keys.filter((k) => names.includes(k) && !usedNames.has(k) && !!usedNames.add(k)),
        ])
        .filter(([, keys]) => keys.length);
      return `<div class="mon62-icon-picker"><div class="mon62-picker-head">${B(I("left", 23), () => close(), "mon62-back", 'aria-label="Back"')}<h2>Select an icon</h2>${B(I("gear", 23), () => pickerSettings("icon"), "mon62-gear", 'aria-label="Icon selection settings"')}</div><div class="mon62-picker-list">${groups
        .map(
          ([title, keys]) =>
            `<div class="mon62-icon-group"><div class="mon62-group-title"><span>${title}</span></div><div class="mon62-icon-grid">${keys
              .map((x) =>
                B(
                  I(x, 25),
                  () => {
                    obj.icon = x;
                    close();
                  },
                  "mon62-icon-cell " + (obj.icon === x ? "selected" : ""),
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
      ...(D.settings[isColor ? "colorPickerExclusions" : "iconPickerExclusions"] || {}),
    };
    const keys = isColor
      ? ["colorAccounts", "colorCategories"]
      : ["iconAccounts", "iconCategories"];
    const row = (label, key) =>
      `<div class="mon64-setting-row"><span>${label}</span>${B(
        `<span class="mon61-toggle ${working[key] ? "on" : ""}"><i></i></span>`,
        () => {
          working[key] = !working[key];
          render();
        },
        "mon61-switch",
        `role="switch" aria-checked="${!!working[key]}"`,
      )}</div>`;
    sheet(
      () =>
        `<div class="mon64-picker-settings"><h2>${isColor ? "Colors" : "Icon"} list customization</h2><p>With this setting, you can exclude ${isColor ? "colors" : "icons"} selected for current accounts and categories from the ${isColor ? "colors" : "icons"} list.</p><div class="mon64-setting-rows">${row("Exclude selected in accounts", keys[0])}${row("Exclude selected in categories", keys[1])}</div><div class="mon64-setting-buttons">${B("Cancel", () => close(), "mon61-cancel")}${B(
          "Complete",
          () => {
            D.settings[isColor ? "colorPickerExclusions" : "iconPickerExclusions"] = working;
            save();
            close();
          },
          "mon61-primary",
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
              B(
                pending === color ? I("check", 19) : "",
                () => {
                  pending = color;
                  render();
                },
                "mon64-color-tile",
                `style="background:${color}" aria-label="Color row ${r + 1} column ${c + 1}"`,
              ),
            )
            .join(""),
        )
        .join("");
    sheet(
      () =>
        `<div class="mon62-color-picker mon64-color-picker"><div class="mon62-picker-head">${B(I("left", 23), () => close(), "mon62-back", 'aria-label="Back"')}<h2>Choose color</h2>${B(I("gear", 23), () => pickerSettings("color"), "mon62-gear", 'aria-label="Color list customization"')}</div><div class="mon62-color-preview" style="color:${pending};background:color-mix(in srgb,${pending} 20%,#fffafe)">${I(obj.icon, 32)}</div><p class="mon62-color-hint">You can scroll colors horizontally or vertically.</p><div class="mon64-color-grid">${grid()}</div><div class="mon63-color-quick">${PALETTE.map(
          (c) =>
            B(
              pending === c ? I("check", 14) : "",
              () => {
                pending = c;
                render();
              },
              "mon63-quick-swatch",
              `style="background:${c}" aria-label="Color ${c}"`,
            ),
        ).join("")}</div>${B(
          "Complete",
          () => {
            obj.color = pending;
            close();
          },
          "mon61-complete",
        )}</div>`,
      "Choose color",
    );
  };
  const action = (icon, label, fn) =>
    B(
      `<span class="mon61-action-icon">${I(icon, 25)}</span><span>${label}</span>`,
      fn,
      "mon61-action",
    );
  sheet(
    () =>
      `<div class="mon61-customize"><div class="mon61-preview" style="color:${obj.color};background:color-mix(in srgb,${obj.color} 17%,#fffafe)">${I(obj.icon, 34)}</div><h2>Customize icon</h2><div class="mon61-choices">${action("smile", "Choose an icon", chooseIcon)}${action("palette", "Choose color", chooseColor)}</div><div class="mon61-actions">${action("gear", "✦ Setting random selection", randomSettings)}${action("smile", "✦ Random icon", () => chooseRandom("icon"))}${action("palette", "✦ Random color", () => chooseRandom("color"))}${action("spark", "Random icon and color", () => chooseRandom("both"))}</div>${B("Complete", () => close(), "mon61-complete")}</div>`,
    "Customize icon",
    "dialog",
  );
}
export function amountPicker(title, value, fn, allowNegative = false) {
  let expr = String(value / 100);
  sheet(
    () =>
      `<h2>${t(title)}</h2><input type="text" inputmode="decimal" aria-label="Amount" value="${esc(expr)}" data-input="${inp((v) => (expr = v))}">${calculatorKeys(
        () => expr,
        (v) => (expr = v),
        () => {
          try {
            let n = calculate(expr);
            if (n < 0 && !allowNegative) throw Error("Use a non-negative amount");
            close();
            fn(n);
          } catch (e) {
            toast(e.message);
          }
        },
      )}`,
    title,
  );
}
export function calculatorKeys(get, set, done) {
  let nums = D.settings.reverseKeys
    ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    : ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  const press = (k) => {
    if (k === "⌫") set(get().slice(0, -1) || "0");
    else if (k === "C") set("0");
    else if (k === "=") {
      try {
        set(String(calculate(get()) / 100));
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
  return `<div class="keypad">${cells.map((k) => B(k, k === "…" ? () => optionSheet("Calculator", ["Calculate", "Clear"], null, (v) => press(v === "Clear" ? "C" : "=")) : () => press(k), "key", `aria-label="${k === "⌫" ? "Backspace" : k === "C" ? "Clear amount" : k}"`)).join("")}${B(I("check", 30), done, "key ok", `aria-label="${t("Save")}"`)}</div>`;
}
