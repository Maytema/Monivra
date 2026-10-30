/* Tax and commission settings of an operation */
import { render } from "../app/shell.js";
import { translate } from "../i18n/index.js";
import { closeLayers, openSheet } from "../ui/kit.js";
import { buttonHtml, textFieldHtml, toggleRowHtml } from "../ui/primitives.js";

// Short description shown under the menu row; "Turned off" when nothing is set.
export function feeLabel(fee) {
  if (!fee) return "Turned off";
  const amount = fee.percent ? fee.percent + "%" : String(fee.value);
  return (fee.add ? "+ " : "− ") + amount;
}

// Dialog with a percent or a fixed value; the result is stored in d[key] (null clears it).
export function feeDialog(d, key, title, onDone) {
  const draft = { percent: d[key]?.percent || "", value: d[key]?.value || "", add: !!d[key]?.add };
  openSheet(
    () =>
      `<h2>${translate(title)}</h2>${textFieldHtml("Percent", draft.percent, (v) => {
        draft.percent = v;
        draft.value = "";
      })}<p class="dialog-or">${translate("Or")}</p>${textFieldHtml("Value", draft.value, (v) => {
        draft.value = v;
        draft.percent = "";
      })}${toggleRowHtml("Subtract from operation", !draft.add, () => {
        draft.add = false;
        render();
      })}${toggleRowHtml("Add to operation", draft.add, () => {
        draft.add = true;
        render();
      })}<div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "OK",
        () => {
          const percent = Number(draft.percent),
            value = Number(draft.value);
          d[key] = percent > 0 || value > 0 ? { percent, value, add: draft.add } : null;
          closeLayers();
          onDone();
        },
        "primary",
      )}</div>`,
    title,
    "dialog",
  );
}
