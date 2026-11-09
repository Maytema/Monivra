/* Export of data in three ways: a financial summary (PDF), the detailed list of operations (PDF) and
   a CSV file of the operations. Each has its own settings, a preview, and Save, Share and (for PDF)
   Print. The period and the filters are shared. */
import { iconSvg } from "../core/constants.js";
import { emptyFilters, uiState } from "../core/state.js";
import { buildCsvJob, buildReportJob, releaseJob } from "../data/report-job.js";
import { render } from "../app/shell.js";
import { openPage } from "../ui/navigation.js";
import { periodBar } from "../ui/period-picker.js";
import { printDelivery, saveDelivery, shareDelivery, withProgress } from "../ui/file-actions.js";
import { buttonHtml, pageHeader, swipePane, toast } from "../ui/primitives.js";
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
// The parts of the financial summary that can be left out.
const SUMMARY_SECTIONS = [
  ["charts", "Charts and trends", "stats"],
  ["accounts", "Accounts", "wallet"],
  ["savings", "Savings", "pig"],
  ["debts", "Debts", "debt"],
  ["budgets", "Budgets", "budget"],
];
// The three ways to export: title, a line about each and its icon.
const MODES = [
  ["summary", "Financial summary", "PDF · overview, charts, accounts, budgets", "pie"],
  ["detail", "Detailed transactions", "PDF · every operation in a table", "receipt"],
  ["csv", "CSV file", "A table for spreadsheets and other applications", "document"],
];

// The page opens on all time; the period shown before comes back when the page is left.
export function openExport() {
  const before = uiState.period;
  uiState.period = { ...before, mode: "all" };
  const page = {
    cache: null,
    draft: {
      mode: "summary",
      filters: emptyFilters(),
      sections: Object.fromEntries(SUMMARY_SECTIONS.map(([key]) => [key, true])),
      parts: Object.fromEntries(OPERATION_PARTS.map(([part]) => [part, true])),
    },
  };
  page.restore = () => {
    uiState.period = before;
    releaseJob(page.cache?.job);
  };
  openPage("export", page);
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
// A row with a checkbox that turns one thing of the export on or off; a row with an icon is a part
// of the report, one without is a field of it.
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

// What the export is now, as the job needs it.
const configOf = (page) => ({ ...page.draft, period: uiState.period });

// The prepared export of the page for what is chosen now: the one made before when nothing has
// changed since, otherwise a new one (a PDF takes a moment, so a dialog says what is going on).
export async function exportJob(page) {
  const config = configOf(page);
  const signature = JSON.stringify(config);
  if (page.cache?.signature === signature) return page.cache.job;
  releaseJob(page.cache?.job);
  page.cache = null;
  const job =
    config.mode === "csv"
      ? buildCsvJob(config)
      : await withProgress("Preparing the report", (onPage) => buildReportJob(config, onPage));
  page.cache = { signature, job };
  return job;
}

// Runs an action on the prepared file; a failure is told to the person, not shown as an error.
export function deliver(getJob, action) {
  return async () => {
    try {
      await action(await getJob());
    } catch (error) {
      toast("The file could not be prepared");
      console.error("Export failed:", error);
    }
  };
}

// Share, Save and Print as one row of buttons; the same in every export and in the preview.
export function fileActionsHtml(getJob, { print }) {
  const action = (label, icon, fn) =>
    buttonHtml(
      `${iconSvg(icon, 22)}<span>${translate(label)}</span>`,
      deliver(getJob, fn),
      "file-action",
    );
  return `<div class="file-actions ${print ? "three" : ""}">${action("Share", "share", (job) => shareDelivery(job.file))}${action("Save", "save", (job) => saveDelivery(job.file))}${print ? action("Print", "print", (job) => printDelivery(job.pages)) : ""}</div>`;
}

// A card that chooses the way to export.
const modeCard = (draft, [id, title, line, icon]) =>
  buttonHtml(
    `${iconSvg(icon, 26)}<span class="grow"><span class="export-mode-title">${translate(title)}</span><small>${translate(line)}</small></span>`,
    () => {
      draft.mode = id;
      render();
    },
    `export-mode ${draft.mode === id ? "on" : ""}`,
    `aria-pressed="${draft.mode === id}"`,
  );

// Export page.
export function exportView(p) {
  const { draft } = p;
  const csv = draft.mode === "csv";
  const summary = draft.mode === "summary";
  const preview = async () => {
    try {
      const job = await exportJob(p);
      openPage("exportPreview", { owner: p, job });
    } catch (error) {
      toast("The file could not be prepared");
      console.error("Preview failed:", error);
    }
  };
  return (
    pageHeader("Export data") +
    swipePane(
      periodBar() +
        `<div class="content export-content"><div class="export-modes">${MODES.map((m) => modeCard(draft, m)).join("")}</div><div class="export-rows">${filterFieldRows(draft.filters, ["accounts", "categories", "types", "tags"], filterRow)}</div>${
          summary
            ? `<h3 class="export-heading">${translate("Include in report")}</h3>${SUMMARY_SECTIONS.map(([key, label, icon]) => choice(label, draft.sections, key, icon)).join("")}`
            : `<h3 class="export-heading">${translate("Fields to include")}</h3>${OPERATION_PARTS.map(([key, label]) => choice(label, draft.parts, key)).join("")}`
        }</div>`,
    ) +
    `<div class="page-footer">${buttonHtml("Preview", preview, "primary")}${fileActionsHtml(() => exportJob(p), { print: !csv })}</div>`
  );
}
