/* Sheet for choosing an icon and a color */
import { wheelHtml, wheelValues } from "../app/color-wheel.js";
import { render } from "../app/shell.js";
import { isHex, shadesOf } from "../core/color.js";
import { ICON_GROUPS, iconSvg, PALETTE, QUICK_COLORS } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { translate } from "../i18n/index.js";
import { buttonHtml, toast } from "./primitives.js";
import { registerInput } from "./handlers.js";
import { closeLayers, openSheet } from "./navigation.js";

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
    const working = {
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
    const working = {
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
