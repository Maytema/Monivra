// Export data (js/screens/export.js, export-preview.js): the period, the filters, what the file holds,
// a preview of it, and Share / Save. The page opens on all time; the period shown before comes back
// when it is left.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { csvTable, csvText, COLUMN_LABELS, type CsvPart } from "../domain/csv.ts";
import { newestFirst } from "../domain/ledger.ts";
import { emptyFilters, operationsIn, periodBounds, type Filters, type Period } from "../domain/periods.ts";
import type { LedgerData } from "../domain/types.ts";
import { saveTextFile, shareTextFile } from "../platform/files.ts";
import { showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { toast } from "../ui/dialogs.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { AccountSelect, CategorySelect, Check, MultiSelect, TYPE_NAMES } from "./filters-panel.tsx";
import { PeriodBar } from "./period-bar.tsx";
import { getView, setView, useView } from "./ui-state.ts";

const OPERATION_PARTS: [CsvPart, string, string?][] = [
  ["type", "Type", "Type, and how a transfer to a debt is counted"],
  ["accounts", "Accounts / categories", "From account, to account, category"],
  ["amount", "Amount", "Amount and currency; for a transfer between currencies, what arrived"],
  ["comment", "Comment"],
  ["tags", "Tags"],
];
const PREVIEW_ROWS = 20;

// The period as a piece of a file name: 2026-11, 2026, all-time or 2026-11-01_2026-11-15.
function periodSlug(period: Period, data: LedgerData): string {
  if (period.mode === "all") return "all-time";
  const [from, to] = periodBounds(period, data.settings);
  if (period.mode === "year") return from.slice(0, 4);
  if (period.mode === "month" && from.endsWith("-01")) return from.slice(0, 7);
  return from === to ? from : `${from}_${to}`;
}

export interface CsvJob {
  name: string;
  text: string;
  columns: string[];
  rows: string[][];
  total: number;
}

export function csvJob(data: LedgerData, period: Period, filters: Filters, parts: Partial<Record<CsvPart, boolean>>): CsvJob {
  const ops = operationsIn(data, period, filters).sort(newestFirst);
  const table = csvTable(data, ops, parts);
  return {
    name: `monivra-operations-${periodSlug(period, data)}.csv`,
    // A byte order mark, so a spreadsheet reads the letters of any language.
    text: "﻿" + csvText(data, ops, parts),
    columns: table.columns.map((c) => COLUMN_LABELS[c]),
    rows: table.rows.slice(0, PREVIEW_ROWS),
    total: table.rows.length,
  };
}

async function deliver(t: ReturnType<typeof useT>, job: CsvJob, how: "share" | "save") {
  try {
    if (how === "share") await shareTextFile(job.name, job.text, "text/csv");
    else if (await saveTextFile(job.name, job.text, "text/csv")) toast(t.t("File saved"));
  } catch (error) {
    showError(t, error);
  }
}

function FileActions({ job }: { job: () => CsvJob }) {
  const p = usePalette();
  const t = useT();
  const action = (icon: string, label: string, how: "share" | "save") => (
    <Pressable accessibilityRole="button" onPress={() => void deliver(t, job(), how)} style={({ pressed }) => ({ flex: 1, flexDirection: "row", gap: 10, minHeight: 52, borderRadius: 30, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
      <Icon name={icon} size={22} color={p.ink} />
      <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {action("share", "Share", "share")}
      {action("save", "Save", "save")}
    </View>
  );
}

// The first rows of the file as a table, and how many rows it has.
function Preview({ job }: { job: CsvJob }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const shown = job.rows.length;
  const note =
    job.total === 0
      ? t.t("There are no operations in this scope. The file holds only the column names.")
      : shown < job.total
        ? t.t("Preview of your data · the first {shown} of {total} rows are shown; the file holds all {total}", { shown, total: job.total })
        : t.t("Preview of your data · all {total} rows", { total: job.total });
  const width = 130;
  const cell = (text: string, key: number, head = false) => (
    <Text key={key} numberOfLines={2} style={{ width, paddingHorizontal: 8, paddingVertical: 8, color: head ? p.ink : p.inkSoft, fontSize: 13, fontWeight: head ? "600" : "400" }}>
      {head ? t.t(text) : text}
    </Text>
  );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Back")} onPress={close} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={24} color={p.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 22, marginRight: 44 }}>{t.t("Preview")}</Text>
      </View>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 18, paddingBottom: 10 }}>{note}</Text>
      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: "row", backgroundColor: p.sheet }}>{job.columns.map((c, i) => cell(c, i, true))}</View>
            {job.rows.map((row, r) => (
              <View key={r} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: p.line }}>
                {row.map((c, i) => cell(c, i))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
      <View style={{ padding: 18 }}>
        <FileActions job={() => job} />
      </View>
    </View>
  );
}

function FieldRow({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  const [main, sub] = value.replace(/\)$/, "").split(" (");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 56, paddingHorizontal: 18, backgroundColor: pressed ? p.soft : "transparent" })}>
      <Icon name={icon} size={24} color={p.inkSoft} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 16 }}>{main}</Text>
        {sub ? <Text style={{ color: p.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      <Icon name="down" size={20} color={p.muted} />
    </Pressable>
  );
}

export function ExportPage() {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const { period } = useView();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [parts, setParts] = useState<Record<CsvPart, boolean>>({ type: true, accounts: true, amount: true, comment: true, tags: true });
  // All time while the page is open; the period shown before comes back after.
  const before = useRef(getView().period);
  useEffect(() => {
    const was = before.current;
    setView({ period: { ...was, mode: "all" } });
    return () => setView({ period: was });
  }, []);
  const set = (part: Partial<Filters>) => setFilters((f) => ({ ...f, ...part }));
  const count = (v: string[] | null, one: string, other: string) => (v ? t.tc(one, other, v.length) : null);
  const job = () => csvJob(data, period, filters, parts);
  const scope = useMemo(() => operationsIn(data, period, filters).length, [data, period, filters]);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Export data") }} />
      <PeriodBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ marginHorizontal: 18, marginTop: 6, marginBottom: 6, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: p.accent, flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Icon name="document" size={26} color={p.accentInk} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t("CSV file")}</Text>
            <Text style={{ color: p.muted, fontSize: 13 }}>{t.t("A table for spreadsheets and other applications")}</Text>
          </View>
        </View>
        <FieldRow icon="wallet" label="Accounts" value={count(filters.accounts, "{n} account", "{n} accounts") ?? t.t("All accounts")} onPress={() => sheets.open(<AccountSelect selected={filters.accounts} done={(v) => set({ accounts: v })} />, "sheet", { scrolls: true })} />
        <FieldRow icon="categories" label="Categories" value={count(filters.categories, "{n} category", "{n} categories") ?? t.t("All categories (All subcategories)")} onPress={() => sheets.open(<CategorySelect selected={filters.categories} done={(v) => set({ categories: v })} />, "sheet", { scrolls: true })} />
        <FieldRow
          icon="swap"
          label="Type"
          value={filters.types ? filters.types.map((x) => t.t(TYPE_NAMES[x] ?? x)).join(", ") : t.t("All types of operations")}
          onPress={() => sheets.open(<MultiSelect title="Type" items={Object.entries(TYPE_NAMES).map(([id, name]) => ({ id, name }))} selected={filters.types} done={(v) => set({ types: v })} />, "sheet", { scrolls: true })}
        />
        <FieldRow icon="tag" label="Tags" value={filters.tags ? filters.tags.join(", ") : t.t("All tags")} onPress={() => sheets.open(<MultiSelect title="Tags" items={data.tags.map((x) => ({ id: x, name: x }))} selected={filters.tags} done={(v) => set({ tags: v })} />, "sheet", { scrolls: true })} />
        <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }}>{t.t("Fields to include")}</Text>
        {OPERATION_PARTS.map(([key, label, hint]) => (
          <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: parts[key] }} onPress={() => setParts((x) => ({ ...x, [key]: !x[key] }))} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
              {hint ? <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(hint)}</Text> : null}
            </View>
            <Check on={parts[key]} />
          </Pressable>
        ))}
        <Text style={{ color: p.muted, fontSize: 13, paddingHorizontal: 18, paddingTop: 10 }}>{t.tc("{n} operation", "{n} operations", scope)}</Text>
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 }}>
        <Button label="Preview" onPress={() => sheets.open(<Preview job={job()} />, "full")} />
        <FileActions job={job} />
      </View>
    </View>
  );
}
