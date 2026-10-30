/* One-time hint banner with a close button; dismissed hints are remembered in the settings */
import { render } from "../app/shell.js";
import { iconSvg } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { translate } from "../i18n/index.js";
import { iconButtonHtml } from "./primitives.js";

// Banner for the hint `id`; empty once the person has dismissed it.
export function hintHtml(id, text) {
  const dismissed = appData.settings.dismissedHints || [];
  if (dismissed.includes(id)) return "";
  return `<div class="hint-banner">${iconSvg("info", 20)}<span class="grow">${translate(text)}</span>${iconButtonHtml(
    "close",
    "Dismiss",
    () => {
      appData.settings.dismissedHints = [...dismissed, id];
      save();
      render();
    },
  )}</div>`;
}
