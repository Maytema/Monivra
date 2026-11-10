/* Preview of an export: the pages of a PDF report as they will be saved, or the first rows of a CSV
   file. Nothing is downloaded by looking. */
import { escapeHtml } from "../core/constants.js";
import { translate, translateCount, translateWith } from "../i18n/index.js";
import { csvTableHtml } from "../ui/csv-table.js";
import { pageHeader } from "../ui/primitives.js";
import { fileActionsHtml } from "./export.js";

// The pictures of the pages, with a line that says how many there are.
function pagesHtml(job) {
  return `<p class="preview-note">${translateWith("Preview of your data · {pages}", { pages: translateCount("{n} page", "{n} pages", job.pageCount) })}</p><div class="report-pages">${job.pages
    .map(
      (url, i) =>
        `<figure><img src="${url}" loading="lazy" alt="${escapeHtml(translateWith("Page {n} of {total}", { n: i + 1, total: job.pageCount }))}"><figcaption>${i + 1}</figcaption></figure>`,
    )
    .join("")}</div>`;
}

// The first rows of the file as a table, and how many rows the file has.
function rowsHtml(job) {
  const shown = job.rows.length;
  const note =
    job.total === 0
      ? translate("There are no operations in this scope. The file holds only the column names.")
      : shown < job.total
        ? translateWith(
            "Preview of your data · the first {shown} of {total} rows are shown; the file holds all {total}",
            { shown, total: job.total },
          )
        : translateWith("Preview of your data · all {total} rows", { total: job.total });
  return `<p class="preview-note">${note}</p><p class="preview-note">${translate("The small names under the headings are the column names written in the file.")}</p>${csvTableHtml(job.columns, job.rows)}`;
}

// Preview page: `p.job` is the prepared export, `p.owner` the export page it belongs to.
export function exportPreviewView(p) {
  const csv = p.job.mode === "csv";
  return (
    pageHeader("Preview") +
    `<div class="content preview-content">${csv ? rowsHtml(p.job) : pagesHtml(p.job)}</div><div class="page-footer">${fileActionsHtml(p, p.owner, { print: !csv })}</div>`
  );
}
