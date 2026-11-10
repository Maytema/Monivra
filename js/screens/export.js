/* Export of data in three ways: a financial summary (PDF), the detailed list of operations (PDF) and
   a CSV file of the operations. Each has its own settings, a preview, and Save, Share and (for PDF)
   Print. The period and the filters are shared. */
import { iconSvg } from "../core/constants.js";
import { emptyFilters, uiState } from "../core/state.js";
import { preparedJob, readyJob, signatureOf } from "../data/report-cache.js";
import { render } from "../app/shell.js";
import { openPage } from "../ui/navigation.js";
import { periodBar } from "../ui/period-picker.js";
import { printDelivery, saveDelivery, shareDelivery, withProgress } from "../ui/file-actions.js";
import { buttonHtml, pageHeader, swipePane, toast } from "../ui/primitives.js";
import { checkboxHtml } from "./operations/filter-parts.js";
import { filterFieldRows } from "./operations/filters.js";
import { translate } from "../i18n/index.js";

const OPERATION_PARTS = [
  ["type", "Type", "Type, and how a transfer to a debt is counted"],
  ["accounts", "Accounts / categories", "From account, to account, category"],
  ["amount", "Amount", "Amount and currency; for a transfer between currencies, what arrived"],
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
    alive: true,
    busy: null,
    draft: {
      mode: "summary",
      filters: emptyFilters(),
      sections: Object.fromEntries(SUMMARY_SECTIONS.map(([key]) => [key, true])),
      parts: Object.fromEntries(OPERATION_PARTS.map(([part]) => [part, true])),
    },
  };
  page.restore = () => {
    uiState.period = before;
    page.alive = false; // what is still being prepared is not offered any more
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
function choice(label, flags, key, icon = "", hint = "") {
  return buttonHtml(
    `${icon ? iconSvg(icon, 24) : ""}<span class="grow">${translate(label)}${hint ? `<small>${translate(hint)}</small>` : ""}</span>${checkboxHtml(flags[key])}`,
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
// changed since (see data/report-cache.js), otherwise a new one (a PDF takes a moment, so a dialog
// says what is going on).
export function exportJob(page) {
  const config = configOf(page);
  const ready = readyJob(config);
  if (ready) return preparedJob(config); // counts as a use of the prepared file
  return config.mode === "csv"
    ? preparedJob(config)
    : withProgress("Preparing the report", (onPage) => preparedJob(config, onPage));
}

// Runs an action of `host` (a page) on the prepared file of `owner` (the export page). One action at
// a time: a tap while another one is going on is the same request and does nothing. When the person
// has left the page, or changed anything the file is made from, by the time the file is ready, the
// action is dropped: no system dialog may appear later for something they no longer see. A failure is
// told to the person, not shown as an error.
export function deliver(host, owner, name, action) {
  return async () => {
    if (host.busy) return;
    host.busy = name;
    const asked = signatureOf(configOf(owner));
    render();
    try {
      const job = await exportJob(owner);
      if (host.alive === false || signatureOf(configOf(owner)) !== asked) return;
      await action(job);
    } catch (error) {
      if (host.alive !== false) toast("The file could not be prepared");
      console.error("Export failed:", error);
    } finally {
      host.busy = null;
      if (host.alive !== false) render();
    }
  };
}

// Share, Save and Print as one row of buttons; the same in every export and in the preview.
export function fileActionsHtml(host, owner, { print }) {
  const action = (label, icon, fn) =>
    buttonHtml(
      `${iconSvg(icon, 22)}<span>${translate(label)}</span>`,
      deliver(host, owner, label, fn),
      `file-action ${host.busy === label ? "busy" : ""}`,
      `aria-busy="${host.busy === label}"`,
    );
  return `<div class="file-actions ${print ? "three" : ""}">${action("Share", "share", (job) => shareDelivery(job.file))}${action("Save", "save", (job) => saveDelivery(job.file))}${print ? action("Print", "print", (job) => printDelivery(job.pages, job.file)) : ""}</div>`;
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
  const preview = deliver(p, p, "Preview", (job) =>
    openPage("exportPreview", {
      owner: p,
      job,
      alive: true,
      busy: null,
      restore() {
        this.alive = false;
      },
    }),
  );
  return (
    pageHeader("Export data") +
    swipePane(
      periodBar() +
        `<div class="content export-content"><div class="export-modes">${MODES.map((m) => modeCard(draft, m)).join("")}</div><div class="export-rows">${filterFieldRows(draft.filters, ["accounts", "categories", "types", "tags"], filterRow)}</div>${
          summary
            ? `<h3 class="export-heading">${translate("Include in report")}</h3>${SUMMARY_SECTIONS.map(([key, label, icon]) => choice(label, draft.sections, key, icon)).join("")}`
            : `<h3 class="export-heading">${translate("Fields to include")}</h3>${OPERATION_PARTS.map(([key, label, hint]) => choice(label, draft.parts, key, "", hint)).join("")}`
        }</div>`,
    ) +
    `<div class="page-footer">${buttonHtml("Preview", preview, `primary ${p.busy === "Preview" ? "busy" : ""}`, `aria-busy="${p.busy === "Preview"}"`)}${fileActionsHtml(p, p, { print: !csv })}</div>`
  );
}
