// Export data (js/screens/export.js, export-preview.js): a financial summary (PDF), the detailed list of
// operations (PDF) or a CSV file, each with its settings, a preview, and Share / Save. The period and the
// filters are shared. The page opens on all time; the period shown before comes back when it is left.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { Stack } from "expo-router";
import { buildReport, periodSlug, type ReportJob } from "../application/report/job.ts";
import { ASCENT } from "../application/report/font.ts";
import { PAGE, type Command } from "../application/report/layout.ts";
import type { Sections } from "../application/report/model.ts";
import { csvTable, csvText, COLUMN_LABELS, type CsvPart } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, type Filters, type Period } from "../domain/periods.ts";
import type { LedgerData } from "../domain/types.ts";
import { saveTextFile, shareTextFile } from "../platform/files.ts";
import { canPrint, printPdf } from "../platform/native.ts";
import { now, perfLog } from "../platform/perf.ts";
import type { Translator } from "../i18n/index.ts";
import { showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { toast } from "../ui/dialogs.tsx";
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

// A prepared file: a CSV with the first rows for the preview, or a PDF with its pages.
type Job = { kind: "csv"; name: string; text: string; columns: string[]; rows: string[][]; total: number } | ({ kind: "pdf" } & ReportJob);

function prepare(data: LedgerData, t: Translator, d: Draft): Job {
  if (d.mode === "csv") {
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
  const started = now();
  const day = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const today = `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
  const job = buildReport(data, { t, periodTitle: (p) => periodTitle(p, t, data.settings), today, now: day }, { mode: d.mode, filters: d.filters, period: d.period, sections: d.sections, parts: d.parts });
  perfLog(`report ${d.mode}: ${job.pages.length} pages, ${job.bytes.length} bytes`, started);
  return { kind: "pdf", ...job };
}

async function deliver(t: Translator, job: Job, how: "share" | "save" | "print") {
  if (how === "print") {
    if (job.kind === "pdf" && !printPdf(job.name, job.bytes)) toast(t.t("Printing is not available on this device"));
    return;
  }
  const body = job.kind === "csv" ? job.text : job.bytes;
  const type = job.kind === "csv" ? "text/csv" : "application/pdf";
  try {
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

function Preview({ job }: { job: Job }) {
  const p = usePalette();
  const t = useT();
  const { width } = useWindowDimensions();
  const footer = <FileActions job={async () => job} mode={job.kind === "pdf" ? "summary" : "csv"} />;
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
  // The file made last, kept while nothing it is made from changes.
  const made = useRef<{ key: string; job: Job } | null>(null);
  const before = useRef(getView().period);
  useEffect(() => {
    const was = before.current;
    setView({ period: { ...was, mode: "all" } });
    return () => setView({ period: was });
  }, []);
  const draft: Draft = { mode, period, filters, sections, parts };
  const key = JSON.stringify(draft);
  // A PDF takes a moment: the buttons wait, and a second tap does nothing.
  const job = async (): Promise<Job | null> => {
    if (made.current && made.current.key === key && made.current.job) return made.current.job;
    if (busy) return null;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const result = prepare(data, t, draft);
      made.current = { key, job: result };
      return result;
    } catch (error) {
      showError(t, error);
      return null;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    made.current = null;
  }, [data]);
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
        <Button label={busy ? "Preparing the report" : "Preview"} disabled={busy} onPress={() => void job().then((j) => j && sheets.open(<Preview job={j} />, "full"))} />
        <FileActions job={job} busy={busy} mode={mode} />
      </View>
    </View>
  );
}
