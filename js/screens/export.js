/* Export of data: a PDF report or a CSV file of the operations of a period, with filters and parts */
import { APP_ID, iconSvg } from "../core/constants.js";
import { emptyFilters, uiState } from "../core/state.js";
import { csvText } from "../data/csv.js";
import { printReport } from "../data/report.js";
import { saveTextFile, shareTextFile } from "../platform/files.js";
import { visibleOperations } from "../domain/finance.js";
import { render } from "../app/shell.js";
import { openPage } from "../ui/navigation.js";
import { periodBar } from "../ui/period-picker.js";
import { buttonHtml, pageHeader, swipePane, tabsHtml, toast } from "../ui/primitives.js";
import { checkboxHtml } from "./operations/filter-parts.js";
import { filterFieldRows } from "./operations/filters.js";
import { translate } from "../i18n/index.js";

const OPERATION_PARTS = [
  ["type", "Type"],
  ["accounts", "Accounts / categories"],
  ["amount", "Amount"],
  ["comment", "Comment"],
  ["tags", "Tags"],
];
const ACCOUNT_PARTS = [
  ["balance", "Balance"],
  ["goal", "Goal"],
  ["debt", "Debt"],
];

// The page opens on all time; the period shown before comes back when the page is left.
export function openExport() {
  const before = uiState.period;
  uiState.period = { ...before, mode: "all" };
  openPage("export", {
    restore: () => (uiState.period = before),
    draft: {
      format: "pdf",
      filters: emptyFilters(),
      sections: { operations: true, accounts: true },
      parts: Object.fromEntries(
        [...OPERATION_PARTS, ...ACCOUNT_PARTS].map(([part]) => [part, true]),
      ),
    },
  });
}

// A row of the filters: what is chosen, with its icon; "All categories (All subcategories)" gets
// the part in brackets as a second line.
function filterRow(label, value, open, icon) {
  const [main, sub] = value.replace(/\)$/, "").split(" (");
  return buttonHtml(
    `${iconSvg(icon, 24)}<span class="grow"><span>${translate(main)}</span>${sub ? `<small>${translate(sub)}</small>` : ""}</span>`,
    open,
    "export-row",
    `aria-label="${translate(label)}"`,
  );
}
// A row with a checkbox that turns one thing of the report on or off; a row with an icon is a
// part of the report, one without is a field of it.
function choice(label, flags, key, icon = "") {
  return buttonHtml(
    `${icon ? iconSvg(icon, 24) : ""}<span class="grow">${translate(label)}</span>${checkboxHtml(flags[key])}`,
    () => {
      flags[key] = !flags[key];
      render();
    },
    `export-option ${icon ? "export-part" : ""} ${flags[key] ? "on" : ""}`,
  );
}

const CSV_TYPE = "text/csv;charset=utf-8";
// Writes a file into the downloads of the device and says so.
function saveFile(name, content, type) {
  saveTextFile(name, content, type);
  toast("File prepared");
}

// What is exported: the operations in the period that pass the filters, as the report or the file.
function exportNow(draft, deliver) {
  const ops = visibleOperations(draft.filters);
  if (draft.format === "csv")
    return deliver(`${APP_ID}-operations.csv`, "\ufeff" + csvText(ops, draft.parts), CSV_TYPE);
  if (!draft.sections.operations && !draft.sections.accounts) return toast("Choose what to export");
  printReport({ ops, sections: draft.sections, parts: draft.parts });
}

// Export page.
export function exportView(p) {
  const { draft } = p;
  const pdf = draft.format === "pdf";
  const operations = pdf ? draft.sections.operations : true;
  return (
    pageHeader("Export data") +
    swipePane(
      periodBar() +
        `<div class="content export-content">${tabsHtml(
          [
            ["pdf", "PDF"],
            ["csv", "CSV"],
          ],
          draft.format,
          (id) => (draft.format = id),
          "segmented",
        )}<div class="export-rows">${filterFieldRows(draft.filters, ["accounts", "categories", "types", "tags"], filterRow)}</div>${
          pdf
            ? `<h3 class="export-heading">${translate("Include in report")}</h3>${choice("Operations", draft.sections, "operations", "receipt")}${choice("Accounts", draft.sections, "accounts", "wallet")}`
            : ""
        }<h3 class="export-heading">${translate("Fields to include")}</h3>${
          operations
            ? `<p class="export-group">${translate("Operations")}</p>${OPERATION_PARTS.map(([key, label]) => choice(label, draft.parts, key)).join("")}`
            : ""
        }${
          pdf && draft.sections.accounts
            ? `<p class="export-group">${translate("Accounts")}</p>${ACCOUNT_PARTS.map(([key, label]) => choice(label, draft.parts, key)).join("")}`
            : ""
        }</div>`,
    ) +
    `<div class="page-footer">${
      pdf
        ? buttonHtml("Save as PDF", () => exportNow(draft, saveFile), "primary")
        : buttonHtml("Export and share", () => exportNow(draft, shareTextFile), "primary") +
          buttonHtml("Export and save", () => exportNow(draft, saveFile), "secondary")
    }</div>`
  );
}
