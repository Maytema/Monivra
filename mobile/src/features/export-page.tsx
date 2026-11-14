// Export data (js/screens/export.js, export-preview.js): a financial summary (PDF), the detailed list of
// operations (PDF) or a CSV file, each with its settings, a preview, and Share / Save. The period and the
// filters are shared. The page opens on all time; the period shown before comes back when it is left.
import { memo, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Image, PixelRatio, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { Stack } from "expo-router";
import { layoutReport, pdfOfPages, periodSlug, type ReportPages } from "../application/report/job.ts";
import { ASCENT } from "../application/report/font.ts";
import { PageImages } from "../application/report/page-images.ts";
import { PAGE, type Command } from "../application/report/layout.ts";
import type { Sections } from "../application/report/model.ts";
import { csvTable, csvText, COLUMN_LABELS, type CsvPart } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, type Filters, type Period } from "../domain/periods.ts";
import type { LedgerData } from "../domain/types.ts";
import { saveTextFile, shareTextFile } from "../platform/files.ts";
import { canPrint, canRenderPdf, dropReportPreviews, printPdf, renderPdfPages, writeReportPdf } from "../platform/native.ts";
import { now, perfLog } from "../platform/perf.ts";
import type { Translator } from "../i18n/index.ts";
import { showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { toast } from "../ui/dialogs.tsx";
import { withProgress } from "../ui/progress.tsx";
import { FullPage, MiniTable } from "../ui/full-page.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { periodTitle } from "../ui/period-title.ts";
import { sheets } from "../ui/sheets.tsx";
import { mix } from "../ui/theme.ts";
import { AccountSelect, CategorySelect, Check, MultiSelect, TYPE_NAMES } from "./filters-panel.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { getView, setView, useView } from "./ui-state.ts";

type Mode = "summary" | "detail" | "csv";
const MODES: [Mode, string, string, string][] = [
  ["summary", "Financial summary", "PDF · overview, charts, accounts, budgets", "pie"],
  ["detail", "Detailed transactions", "PDF · every operation in a table", "receipt"],
  ["csv", "CSV file", "A table for spreadsheets and other applications", "document"],
];
const OPERATION_PARTS: [CsvPart, string, string?][] = [
  ["type", "Type", "Type, and how a transfer to a debt is counted"],
  ["accounts", "Accounts / categories", "From account, to account, category"],
  ["amount", "Amount", "Amount and currency; for a transfer between currencies, what arrived"],
  ["comment", "Comment"],
  ["tags", "Tags"],
];
const SUMMARY_SECTIONS: [keyof Sections, string, string][] = [
  ["charts", "Charts and trends", "stats"],
  ["accounts", "Accounts", "wallet"],
  ["savings", "Savings", "pig"],
  ["debts", "Debts", "debt"],
  ["budgets", "Budgets", "budget"],
];
const PREVIEW_ROWS = 20;

interface Draft {
  mode: Mode;
  period: Period;
  filters: Filters;
  sections: Record<keyof Sections, boolean>;
  parts: Record<CsvPart, boolean>;
}

// A prepared file: a CSV with the first rows for the preview, or the pages of a PDF (its file is made when it is
// previewed, saved, shared or printed, and kept for the next time; `images` are its pages as pictures).
type Job = { kind: "csv"; name: string; text: string; columns: string[]; rows: string[][]; total: number } | { kind: "pdf"; report: ReportPages; name: string; pages: Command[][]; file?: Uint8Array; images?: PageImages };

function prepareCsv(data: LedgerData, d: Draft): Job {
  const ops = operationsIn(data, d.period, d.filters).sort(newestFirst);
  const table = csvTable(data, ops, d.parts);
  return {
    kind: "csv",
    name: `monivra-operations-${periodSlug(d.period, data)}.csv`,
    // A byte order mark, so a spreadsheet reads the letters of any language.
    text: "﻿" + csvText(data, ops, d.parts),
    columns: table.columns.map((c) => COLUMN_LABELS[c]),
    rows: table.rows.slice(0, PREVIEW_ROWS),
    total: table.rows.length,
  };
}

// The pages of a report, behind the progress dialog (undefined when it was cancelled).
async function preparePages(data: LedgerData, t: Translator, d: Draft): Promise<Job | undefined> {
  const started = now();
  const day = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const today = `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
  const words = { t, periodTitle: (p: Period) => periodTitle(p, t, data.settings), today, now: day };
  const report = await withProgress("Preparing the report", t.t("Preparing…"), (say, signal) =>
    layoutReport(data, words, { mode: d.mode === "detail" ? "detail" : "summary", filters: d.filters, period: d.period, sections: d.sections, parts: d.parts }, (done, total) => say(`${done} / ${total}`), signal),
  );
  if (!report) return undefined;
  perfLog(`report ${d.mode}: ${report.pages.length} pages laid out`, now() - started);
  return { kind: "pdf", report, name: report.name, pages: report.pages };
}

// The PDF file of a prepared report: made once, behind the same progress dialog.
async function fileOf(t: Translator, job: Extract<Job, { kind: "pdf" }>): Promise<Uint8Array | undefined> {
  if (job.file) return job.file;
  const started = now();
  const bytes = await withProgress("Preparing the report", t.t("Preparing…"), (say, signal) => pdfOfPages(job.report, (done, total) => say(t.t("Page {n} of {total}", { n: done, total })), signal));
  if (bytes) {
    job.file = bytes;
    perfLog(`report file: ${bytes.length} bytes`, now() - started);
  }
  return bytes;
}

// ---- Kept reports ----

// Prepared reports by their settings, kept while the data is the same (any change of data makes a new ledger
// object, and the old entries go with it): leaving the page and coming back finds them ready.
const prepared = new WeakMap<LedgerData, Map<string, Job>>();
const keptJob = (data: LedgerData, key: string) => prepared.get(data)?.get(key);
function keepJob(data: LedgerData, key: string, job: Job) {
  const map = prepared.get(data) ?? new Map<string, Job>();
  map.set(key, job);
  prepared.set(data, map);
}

// The previews whose pictures are kept (the newest last); older ones are stopped and their files deleted.
const KEPT_PREVIEWS = 2;
const previews: { id: string; images: PageImages }[] = [];
let previewCount = 0;
const newPreviewId = () => `${Date.now().toString(36)}-${(previewCount += 1)}`;
function keepPreview(id: string, images: PageImages) {
  previews.push({ id, images });
  while (previews.length > KEPT_PREVIEWS) previews.shift()?.images.stop();
  dropReportPreviews(previews.map((x) => x.id));
}

// The pages shown first, while the person waits; the rest are made in the background.
const FIRST_PAGES = 3;

// The pictures of a report's pages for the preview: its PDF file, then the first pages behind the progress
// dialog. Undefined when stopped, or where the phone cannot draw a PDF (the preview then draws the pages itself).
async function previewImages(t: Translator, job: Extract<Job, { kind: "pdf" }>, widthPx: number): Promise<PageImages | undefined> {
  if (job.images && !job.images.stopped) return job.images;
  if (!canRenderPdf()) return undefined;
  const started = now();
  const images = await withProgress("Preparing the report", t.t("Preparing…"), async (say, signal) => {
    const bytes = job.file ?? (await pdfOfPages(job.report, (done, total) => say(t.t("Page {n} of {total}", { n: done, total })), signal));
    job.file = bytes;
    const id = newPreviewId();
    const uri = await writeReportPdf(id, bytes);
    const made = new PageImages(job.pages.length, (from, count) => renderPdfPages(uri, from, count, widthPx, id));
    keepPreview(id, made);
    say(t.t("Preparing the preview…"));
    await made.first(FIRST_PAGES, (ready, total) => say(`${t.t("Preparing the preview…")} ${ready} / ${total}`), signal);
    return made;
  });
  if (!images) return undefined;
  perfLog(`report preview: first ${images.ready} of ${images.total} pages`, now() - started);
  job.images = images;
  images.continueInBackground();
  return images;
}

async function deliver(t: Translator, job: Job, how: "share" | "save" | "print") {
  try {
    const body = job.kind === "csv" ? job.text : await fileOf(t, job);
    if (body === undefined) return;
    if (how === "print") {
      if (job.kind === "pdf" && !(await printPdf(job.name, body as Uint8Array))) toast(t.t("Printing is not available on this device"));
      return;
    }
    const type = job.kind === "csv" ? "text/csv" : "application/pdf";
    if (how === "share") await shareTextFile(job.name, body, type);
    else if (await saveTextFile(job.name, body, type)) toast(t.t("File saved"));
  } catch (error) {
    showError(t, error);
  }
}

// Share and Save under a page, each with its icon above the word (file-actions of the first application).
function FileActions({ job, busy, mode }: { job: () => Promise<Job | null>; busy?: boolean; mode: Mode }) {
  const p = usePalette();
  const t = useT();
  const print = canPrint() && mode !== "csv";
  const action = (icon: string, label: string, how: "share" | "save" | "print") => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.t(label)}
      disabled={busy}
      onPress={() => void job().then((j) => j && deliver(t, j, how))}
      style={({ pressed }) => ({ flex: 1, gap: 2, minHeight: 60, borderRadius: 26, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent", opacity: busy ? 0.5 : 1 })}
    >
      <Icon name={icon} size={22} color={p.ink} />
      <Text style={{ color: p.ink, fontSize: 14 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {action("share", "Share", "share")}
      {action("save", "Save", "save")}
      {print ? action("print", "Print", "print") : null}
    </View>
  );
}

// ---- Preview ----

// One page of a report drawn from the same commands as the PDF.
const ReportPage = memo(function ReportPage({ commands, width }: { commands: Command[]; width: number }) {
  const parts = commands.map((c, i) => {
    switch (c.t) {
      case "text": {
        const [, weight = "400", size = "10"] = /^(\d+) ([\d.]+)px/.exec(c.font) ?? [];
        const anchor = c.align === "right" ? "end" : c.align === "center" ? "middle" : "start";
        return (
          <SvgText key={i} x={c.x} y={c.y + Number(size) * ASCENT} fontSize={Number(size)} fontWeight={Number(weight) >= 600 ? "bold" : "normal"} fill={c.color} textAnchor={anchor}>
            {c.s}
          </SvgText>
        );
      }
      case "rect":
        return <Rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={Math.min(c.radius, c.w / 2, c.h / 2)} fill={c.fill ?? "none"} stroke={c.stroke ?? undefined} strokeWidth={c.stroke ? 0.8 : 0} />;
      case "line":
        return <Line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={c.width} />;
      case "path": {
        const pts = c.points.map(([x, y]) => `${x},${y}`).join(" ");
        const first = c.points[0];
        const last = c.points[c.points.length - 1];
        return (
          <G key={i}>
            {c.area && first && last ? <Polygon points={`${first[0]},${c.area.baseline} ${pts} ${last[0]},${c.area.baseline}`} fill={c.area.fill} /> : null}
            <Polyline points={pts} fill="none" stroke={c.color} strokeWidth={c.width} strokeLinejoin="round" strokeLinecap="round" />
          </G>
        );
      }
      case "dot":
        return <Circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.color} />;
      case "arc": {
        const at = (r: number, a: number) => `${c.x + r * Math.cos(a)} ${c.y + r * Math.sin(a)}`;
        const large = c.to - c.from > Math.PI ? 1 : 0;
        const d = `M ${at(c.r, c.from)} A ${c.r} ${c.r} 0 ${large} 1 ${at(c.r, c.to)} L ${at(c.inner, c.to)} A ${c.inner} ${c.inner} 0 ${large} 0 ${at(c.inner, c.from)} Z`;
        return <Path key={i} d={d} fill={c.color} stroke="#ffffff" strokeWidth={1} />;
      }
      default:
        return null;
    }
  });
  return (
    <View style={{ width, height: (width * PAGE.height) / PAGE.width, backgroundColor: "#ffffff", borderRadius: 4, overflow: "hidden" }}>
      <Svg width={width} height={(width * PAGE.height) / PAGE.width} viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}>
        {parts}
      </Svg>
    </View>
  );
});

// The pages as pictures made by the phone: a page not made yet waits in its place with a spinner, and the line
// on top says how many are ready; it fills in by itself as the background work goes on.
function PagePictures({ job, images, footer }: { job: Extract<Job, { kind: "pdf" }>; images: PageImages; footer: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const { width } = useWindowDimensions();
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => images.subscribe(changed), [images]);
  const pageWidth = width - 36;
  const pageHeight = (pageWidth * PAGE.height) / PAGE.width;
  const ready = images.ready;
  const pages = t.tc("{n} page", "{n} pages", images.total);
  return (
    <FullPage title="Preview" footer={footer} scroll={false}>
      <FlatList
        data={job.pages}
        extraData={ready}
        keyExtractor={(_page, i) => String(i)}
        ListHeaderComponent={
          <Text style={{ color: p.muted, fontSize: 13, paddingBottom: 10 }}>
            {t.t("Preview of your data · {pages}", { pages })}
            {images.done ? "" : ` · ${t.t("Pages ready: {n} of {total}", { n: ready, total: images.total })}`}
          </Text>
        }
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 18, gap: 12, backgroundColor: mix(p.ink, p.bg, 0.06) }}
        getItemLayout={(_d, index) => ({ length: pageHeight + 30, offset: 34 + (pageHeight + 30) * index, index })}
        renderItem={({ index }) => {
          const uri = images.uris[index];
          return (
            <View>
              {uri ? (
                <Image source={{ uri }} accessibilityLabel={t.t("Page {n} of {total}", { n: index + 1, total: images.total })} style={{ width: pageWidth, height: pageHeight, borderRadius: 4, backgroundColor: "#ffffff" }} />
              ) : (
                <View style={{ width: pageWidth, height: pageHeight, borderRadius: 4, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color={p.muted} />
                </View>
              )}
              <Text style={{ color: p.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>{index + 1}</Text>
            </View>
          );
        }}
      />
    </FullPage>
  );
}

function Preview({ job }: { job: Job }) {
  const p = usePalette();
  const t = useT();
  const { width } = useWindowDimensions();
  const footer = <FileActions job={async () => job} mode={job.kind === "pdf" ? "summary" : "csv"} />;
  if (job.kind === "pdf" && job.images && !job.images.stopped) return <PagePictures job={job} images={job.images} footer={footer} />;
  if (job.kind === "pdf") {
    const pageWidth = width - 36;
    return (
      <FullPage title="Preview" footer={footer} scroll={false}>
        <FlatList
          data={job.pages}
          keyExtractor={(_page, i) => String(i)}
          ListHeaderComponent={<Text style={{ color: p.muted, fontSize: 13, paddingBottom: 10 }}>{t.t("Preview of your data · {pages}", { pages: t.tc("{n} page", "{n} pages", job.pages.length) })}</Text>}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 18, gap: 12, backgroundColor: mix(p.ink, p.bg, 0.06) }}
          initialNumToRender={2}
          windowSize={3}
          renderItem={({ item, index }) => (
            <View>
              <ReportPage commands={item} width={pageWidth} />
              <Text style={{ color: p.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>{index + 1}</Text>
            </View>
          )}
        />
      </FullPage>
    );
  }
  const shown = job.rows.length;
  const note =
    job.total === 0
      ? t.t("There are no operations in this scope. The file holds only the column names.")
      : shown < job.total
        ? t.t("Preview of your data · the first {shown} of {total} rows are shown; the file holds all {total}", { shown, total: job.total })
        : t.t("Preview of your data · all {total} rows", { total: job.total });
  return (
    <FullPage title="Preview" footer={footer}>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 18, paddingBottom: 10 }}>{note}</Text>
      <View style={{ paddingHorizontal: 18 }}>
        <MiniTable head={job.columns.map((c) => t.t(c))} rows={job.rows} width={130} />
      </View>
    </FullPage>
  );
}

// ---- The page ----

function FieldRow({ icon, label, value, onPress, first }: { icon: string; label: string; value: string; onPress: () => void; first: boolean }) {
  const p = usePalette();
  const t = useT();
  const [main, sub] = value.replace(/\)$/, "").split(" (");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 64, paddingHorizontal: 18, borderTopWidth: first ? 0 : 2, borderTopColor: p.bg, backgroundColor: pressed ? p.soft : p.sheet })}>
      <Icon name={icon} size={24} color={p.ink} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 17 }}>{main}</Text>
        {sub ? <Text style={{ color: p.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function CheckRow({ label, hint, icon, on, onPress }: { label: string; hint?: string; icon?: string; on: boolean; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 60, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 8, borderRadius: 16, backgroundColor: on ? mix(p.accent, p.bg, 0.16) : pressed ? p.soft : p.sheet })}
    >
      {icon ? <Icon name={icon} size={24} color={p.ink} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 17 }}>{t.t(label)}</Text>
        {hint ? <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(hint)}</Text> : null}
      </View>
      <Check on={on} />
    </Pressable>
  );
}

export function ExportPage() {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const { period } = useView();
  const [mode, setMode] = useState<Mode>("summary");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sections, setSections] = useState<Record<keyof Sections, boolean>>({ charts: true, accounts: true, savings: true, debts: true, budgets: true });
  const [parts, setParts] = useState<Record<CsvPart, boolean>>({ type: true, accounts: true, amount: true, comment: true, tags: true });
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const before = useRef(getView().period);
  useEffect(() => {
    const was = before.current;
    setView({ period: { ...was, mode: "all" } });
    return () => setView({ period: was });
  }, []);
  const draft: Draft = { mode, period, filters, sections, parts };
  const key = JSON.stringify(draft);
  // A report takes a moment (tens of thousands of rows take longer): its own dialog shows the progress and can
  // stop it; meanwhile the buttons wait, and a second tap does nothing.
  const job = async (): Promise<Job | null> => {
    const kept = keptJob(data, key);
    if (kept) return kept;
    if (busy) return null;
    setBusy(true);
    try {
      const result = draft.mode === "csv" ? prepareCsv(data, draft) : await preparePages(data, t, draft);
      if (!result) return null;
      keepJob(data, key, result);
      return result;
    } catch (error) {
      showError(t, error);
      return null;
    } finally {
      setBusy(false);
    }
  };
  // The preview: the pages as pictures where the phone can draw them (sharp, light to scroll), the first ones
  // ready before it opens; the pictures stay for the next time while the data and the settings are the same.
  const preview = async () => {
    const j = await job();
    if (!j) return;
    if (j.kind === "pdf") {
      setBusy(true);
      try {
        await previewImages(t, j, Math.min(1440, Math.round((width - 36) * PixelRatio.get())));
      } catch (error) {
        showError(t, error);
        return;
      } finally {
        setBusy(false);
      }
    }
    sheets.open(<Preview job={j} />, "full");
  };
  const set = (part: Partial<Filters>) => setFilters((f) => ({ ...f, ...part }));
  const count = (v: string[] | null, one: string, other: string) => (v ? t.tc(one, other, v.length) : null);
  const scope = useMemo(() => operationsIn(data, period, filters).length, [data, period, filters]);
  const rows: [string, string, string, () => void][] = [
    ["wallet", "Accounts", count(filters.accounts, "{n} account", "{n} accounts") ?? t.t("All accounts"), () => sheets.open(<AccountSelect selected={filters.accounts} done={(v) => set({ accounts: v })} />, "sheet", { scrolls: true })],
    ["categories", "Categories", count(filters.categories, "{n} category", "{n} categories") ?? t.t("All categories (All subcategories)"), () => sheets.open(<CategorySelect selected={filters.categories} done={(v) => set({ categories: v })} />, "sheet", { scrolls: true })],
    [
      "receipt",
      "Type",
      filters.types ? filters.types.map((x) => t.t(TYPE_NAMES[x] ?? x)).join(", ") : t.t("All types of operations"),
      () => sheets.open(<MultiSelect title="Type" items={Object.entries(TYPE_NAMES).map(([id, name]) => ({ id, name }))} selected={filters.types} done={(v) => set({ types: v })} />, "sheet", { scrolls: true }),
    ],
    ["tag", "Tags", filters.tags ? filters.tags.join(", ") : t.t("All tags"), () => sheets.open(<MultiSelect title="Tags" items={data.tags.map((x) => ({ id: x, name: x }))} selected={filters.tags} done={(v) => set({ tags: v })} />, "sheet", { scrolls: true })],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Export data") }} />
      <PeriodBar />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 16 }}>
        {MODES.map(([id, title, line, icon]) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === id }}
            onPress={() => setMode(id)}
            style={{ flexDirection: "row", gap: 16, alignItems: "center", minHeight: 68, paddingHorizontal: 18, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: mode === id ? p.accent : p.line, backgroundColor: mode === id ? mix(p.accent, p.bg, 0.16) : "transparent" }}
          >
            <Icon name={icon} size={28} color={p.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.ink, fontSize: 17 }}>{t.t(title)}</Text>
              <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(line)}</Text>
            </View>
          </Pressable>
        ))}
        <View style={{ borderRadius: 16, overflow: "hidden", marginTop: 8 }}>
          {rows.map(([icon, label, value, open], i) => (
            <FieldRow key={label} first={i === 0} icon={icon} label={label} value={value} onPress={open} />
          ))}
        </View>
        <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", paddingTop: 18, paddingBottom: 10 }}>{t.t(mode === "summary" ? "Include in report" : "Fields to include")}</Text>
        {mode === "summary"
          ? SUMMARY_SECTIONS.map(([k, label, icon]) => <CheckRow key={k} label={label} icon={icon} on={sections[k]} onPress={() => setSections((x) => ({ ...x, [k]: !x[k] }))} />)
          : OPERATION_PARTS.map(([k, label, hint]) => <CheckRow key={k} label={label} hint={hint} on={parts[k]} onPress={() => setParts((x) => ({ ...x, [k]: !x[k] }))} />)}
        <Text style={{ color: p.muted, fontSize: 13, paddingTop: 4 }}>{t.tc("{n} operation", "{n} operations", scope)}</Text>
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 }}>
        <Button label="Preview" disabled={busy} onPress={() => void preview()} />
        <FileActions job={job} busy={busy} mode={mode} />
      </View>
    </View>
  );
}
