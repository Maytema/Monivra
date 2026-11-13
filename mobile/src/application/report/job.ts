// What an export is: the pages of a report as drawing commands and its PDF file (js/data/report-job.js).
// The same job serves the preview, saving and sharing.
import { periodBounds, type Filters, type Period } from "../../domain/periods.ts";
import type { LedgerData } from "../../domain/types.ts";
import { layoutDetail, layoutSummary, type Command } from "./layout.ts";
import { detailModel, summaryModel, type DetailPart, type ReportWords, type Sections } from "./model.ts";
import { buildPdf } from "./pdf.ts";

export interface ReportConfig {
  mode: "summary" | "detail";
  filters: Filters;
  period: Period;
  sections: Partial<Sections>;
  parts: Partial<Record<DetailPart, boolean>>;
}

export interface ReportJob {
  name: string;
  pages: Command[][];
  bytes: Uint8Array;
}

// The period as a piece of a file name: 2026-11, 2026, all-time or 2026-11-01_2026-11-15.
export function periodSlug(period: Period, data: LedgerData): string {
  if (period.mode === "all") return "all-time";
  const [from, to] = periodBounds(period, data.settings);
  if (period.mode === "year") return from.slice(0, 4);
  if (period.mode === "month" && from.endsWith("-01")) return from.slice(0, 7);
  return from === to ? from : `${from}_${to}`;
}

export function buildReport(data: LedgerData, words: ReportWords, config: ReportConfig): ReportJob {
  const ctx = { data, t: words.t };
  const summary = config.mode === "summary";
  const model = summary ? summaryModel(words, data, config) : detailModel(words, data, config);
  const pages = model.kind === "summary" ? layoutSummary(model, ctx) : layoutDetail(model, ctx);
  const bytes = buildPdf(pages, { title: `${model.meta.title} · ${model.meta.periodShort}`, subject: "Monivra", language: data.settings.language });
  return { name: `monivra-${summary ? "financial-summary" : "transactions"}-${periodSlug(config.period, data)}.pdf`, pages, bytes };
}
