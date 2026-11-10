/* A CSV file as a table: each column is named for the person, with the name it has in the file
   under it, so that what is shown and what is written can be told to match. */
import { escapeHtml } from "../core/constants.js";
import { COLUMN_LABELS } from "../data/csv.js";
import { translate } from "../i18n/index.js";

export const csvTableHtml = (columns, rows) =>
  `<div class="csv-preview"><table><thead><tr>${columns
    .map(
      (c) =>
        `<th>${escapeHtml(translate(COLUMN_LABELS[c] ?? c))}<small>${escapeHtml(c)}</small></th>`,
    )
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
