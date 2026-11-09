/* Prepares what an export is: the pages of a report as pictures and a PDF file, or a CSV file with a
   sample of its rows for the preview. The same job serves the preview, saving, sharing and printing. */
import { APP_ID } from "../core/constants.js";
import { appData } from "../core/state.js";
import { detailModel, scopeOperations, summaryModel } from "../domain/report-model.js";
import { periodBounds } from "../domain/finance.js";
import { buildPdf } from "../platform/pdf.js";
import { loadReportFonts } from "../platform/report-font.js";
import { makeFile } from "../platform/files.js";
import { measuringContext, renderPages } from "../platform/report-render.js";
import { csvTable, csvText } from "./csv.js";
import { layoutDetail, layoutSummary } from "./report-layout.js";

export const PDF_TYPE = "application/pdf";
export const CSV_TYPE = "text/csv;charset=utf-8";
const PREVIEW_ROWS = 20;

// The period as a piece of a file name: 2026-11, 2026, all-time or 2026-11-01_2026-11-15.
function periodSlug(period) {
  if (period.mode === "all") return "all-time";
  const [from, to] = periodBounds(period);
  if (period.mode === "year") return from.slice(0, 4);
  if (period.mode === "month" && from.endsWith("-01")) return from.slice(0, 7);
  return from === to ? from : `${from}_${to}`;
}
const fileName = (what, period, extension) =>
  `${APP_ID}-${what}-${periodSlug(period)}.${extension}`;

// The report as pictures of pages and a PDF. `onPage(done, total)` tells the progress.
export async function buildReportJob({ mode, filters, period, sections, parts }, onPage) {
  const summary = mode === "summary";
  const model = summary
    ? summaryModel({ filters, period, sections })
    : detailModel({ filters, period, parts });
  const fonts = await loadReportFonts();
  const pages = (summary ? layoutSummary : layoutDetail)(model, measuringContext());
  const rendered = await renderPages(pages, onPage);
  const bytes = await buildPdf(pages, fonts, {
    title: `${model.meta.title} · ${model.meta.periodShort}`,
    subject: "Monivra",
    language: appData.settings.language,
  });
  return {
    mode,
    pageCount: rendered.length,
    pages: rendered.map((page) => page.url),
    file: makeFile(
      fileName(summary ? "financial-summary" : "transactions", period, "pdf"),
      bytes,
      PDF_TYPE,
    ),
    model,
  };
}

// The CSV file, with the columns and the first rows of it for the preview.
export function buildCsvJob({ filters, period, parts }) {
  const ops = scopeOperations(filters, period);
  const table = csvTable(ops, parts);
  return {
    mode: "csv",
    columns: table.columns,
    rows: table.rows.slice(0, PREVIEW_ROWS),
    total: table.rows.length,
    file: makeFile(fileName("operations", period, "csv"), "﻿" + csvText(ops, parts), CSV_TYPE),
  };
}

// Frees the pictures of a job.
export const releaseJob = (job) => job?.pages?.forEach((url) => URL.revokeObjectURL(url));
