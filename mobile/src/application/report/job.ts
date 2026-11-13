// What an export is: the pages of a report as drawing commands and its PDF file (js/data/report-job.js).
// The same job serves the preview, saving and sharing.
import { periodBounds, type Filters, type Period } from "../../domain/periods.ts";
import type { LedgerData } from "../../domain/types.ts";
import { layoutDetail, layoutDetailSteps, layoutSummary, type Command } from "./layout.ts";
import { detailModel, summaryModel, type DetailPart, type ReportWords, type Sections } from "./model.ts";
import { buildPdf, pdfSteps } from "./pdf.ts";

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

// ---- Made in steps, for a list of tens of thousands of rows ----
// The screen must stay alive and show how far it is, and the person must be able to stop: each step of the
// layout and of the file ends with a pause that lets the interface draw and the cancel button work. The
// preview needs only the pages; the PDF file is made later, when it is saved, shared or printed.

export interface ReportPages {
  name: string;
  title: string;
  language: string;
  pages: Command[][];
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stopped = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
};
export const wasCancelled = (error: unknown): boolean => error instanceof Error && error.name === "AbortError";

export async function layoutReport(data: LedgerData, words: ReportWords, config: ReportConfig, say: (done: number, total: number) => void, signal?: AbortSignal): Promise<ReportPages> {
  const ctx = { data, t: words.t };
  const summary = config.mode === "summary";
  await pause();
  const model = summary ? summaryModel(words, data, config) : detailModel(words, data, config);
  let pages: Command[][];
  if (model.kind === "summary") pages = layoutSummary(model, ctx);
  else {
    const steps = layoutDetailSteps(model, ctx);
    for (;;) {
      stopped(signal);
      const step = steps.next();
      if (step.done) {
        pages = step.value;
        break;
      }
      say(step.value, model.rows.length);
      await pause();
    }
  }
  return { name: `monivra-${summary ? "financial-summary" : "transactions"}-${periodSlug(config.period, data)}.pdf`, title: `${model.meta.title} · ${model.meta.periodShort}`, language: data.settings.language, pages };
}

export async function pdfOfPages(report: ReportPages, say: (done: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const steps = pdfSteps(report.pages, { title: report.title, subject: "Monivra", language: report.language });
  for (;;) {
    stopped(signal);
    const step = steps.next();
    if (step.done) return step.value;
    say(step.value, report.pages.length);
    await pause();
  }
}
