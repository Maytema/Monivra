// Import of operations from a CSV file (js/screens/import-wizard.js, js/data/import-export.js importDataView):
// the page that explains it, then a few pages — match the columns, link the accounts and categories,
// look at what would be added, add it — and a page that can take it back. Nothing in the data changes
// before the last button; every page can go back. The logic is in domain/csv-import.ts.
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import {
  applyImport,
  categoryPath,
  DATE_EXAMPLES,
  DATE_ORDERS,
  FIELDS,
  guessColumns,
  guessFormats,
  guessLinks,
  planImport,
  readRecords,
  readTable,
  referencesOf,
  undoImport,
  type Added,
  type CsvRecord,
  type Formats,
  type ImportPlan,
  type Links,
  type Mapping,
  type References,
  type Table,
} from "../domain/csv-import.ts";
import { CSV_COLUMNS, CSV_EXAMPLE } from "../domain/csv.ts";
import { MAX_FILE_BYTES } from "../domain/datafile.ts";
import { decodeText, type Encoding } from "../domain/text-decode.ts";
import type { LedgerData, Operation } from "../domain/types.ts";
import { pickFileBytes, saveTextFile, shareTextFile } from "../platform/files.ts";
import type { Translator } from "../i18n/index.ts";
import { appStore, showError, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { confirmDialog, optionDialog, showInfo, toast } from "../ui/dialogs.tsx";
import { FullPage, MiniTable } from "../ui/full-page.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

const ENCODINGS: { value: Encoding; label: string }[] = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1251", label: "Windows-1251 (Cyrillic)" },
];
const DELIMITER_NAMES: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab" };
const ROWS_SHOWN = 8;
const PROBLEMS_SHOWN = 15;
const NAMES_SHOWN = 10;
const TYPE_LABELS: Record<Operation["type"], string> = { income: "Income", expense: "Expense", transfer: "Transfer", adjustment: "Adjustment" };

// What the wizard holds between its pages.
interface Wizard {
  fileName: string;
  bytes: Uint8Array;
  encoding: Encoding;
  text: string;
  table: Table;
  damaged: boolean;
  mapping: Mapping;
  formats: Formats;
  records: CsvRecord[];
  refs: References;
  links: Links | null;
  plan: ImportPlan | null;
  layers: number[];
}

function loadTable(w: Pick<Wizard, "bytes" | "encoding"> & Partial<Wizard>): void {
  w.text = decodeText(w.bytes, w.encoding);
  w.table = readTable(w.text);
  w.damaged = w.text.includes("�");
  w.mapping = guessColumns(w.table.headers);
  w.formats = guessFormats(w.table, w.mapping);
  w.links = null;
}

const reasonText = (t: Translator, reason: { text: string; params?: Record<string, string | number> }) => t.t(reason.text, reason.params);

async function startImport(t: Translator): Promise<void> {
  const file = await pickFileBytes();
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    showInfo(t.t("The file is larger than the 20 MB import limit."), t.t("Import failed"));
    return;
  }
  try {
    const w = { fileName: file.name, bytes: file.bytes, encoding: "utf-8" as Encoding, layers: [] as number[], plan: null, records: [], refs: { accounts: [], categories: [] } } as unknown as Wizard;
    loadTable(w);
    w.layers.push(sheets.open(<ColumnsPage w={w} />, "full"));
  } catch (error) {
    showInfo(error instanceof Error ? t.t(error.message) : String(error), t.t("The file cannot be used"));
  }
}

// ---- Parts ----

function Note({ children, caution = false }: { children: string; caution?: boolean }) {
  const p = usePalette();
  return <Text style={{ color: caution ? p.negativeInk : p.muted, fontSize: caution ? 14 : 13, lineHeight: caution ? 20 : 19, paddingHorizontal: 18, paddingVertical: 4 }}>{children}</Text>;
}

function Heading({ children }: { children: string }) {
  const p = usePalette();
  return <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 }}>{children}</Text>;
}

// A row of a list of choices: the name with a note under it on the left, what is chosen on the right.
function ChoiceRow({ label, value, hint, onPress }: { label: string; value: string; hint?: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: pressed ? p.soft : "transparent" })}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 16 }}>{label}</Text>
        {hint ? <Text numberOfLines={1} style={{ color: p.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      <Text numberOfLines={1} style={{ color: p.accentInk, fontSize: 15, maxWidth: "45%" }}>
        {value}
      </Text>
      <Icon name="right" size={20} color={p.muted} />
    </Pressable>
  );
}

// A list of choices made of what the file or the person's data says: shown as written, never translated.
function PickSheet({ title, options, value, onPick }: { title: string; options: [string, string, string?][]; value: string; onPick: (v: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 20, textAlign: "center", marginBottom: 10 }}>{title}</Text>
      {options.map(([v, text, hint]) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ selected: v === value }}
          onPress={() => {
            close();
            onPick(v);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.ink, fontSize: 16 }}>{text}</Text>
            {hint ? <Text numberOfLines={1} style={{ color: p.muted, fontSize: 13 }}>{hint}</Text> : null}
          </View>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: v === value ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>
            {v === value ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}
          </View>
        </Pressable>
      ))}
      <View style={{ marginTop: 10 }}>
        <Button label={t.t("Cancel")} kind="outline" onPress={close} />
      </View>
    </View>
  );
}
const pickSheet = (title: string, options: [string, string, string?][], value: string, onPick: (v: string) => void) => sheets.open(<PickSheet title={title} options={options} value={value} onPick={onPick} />, "sheet");

function Facts({ rows }: { rows: [string, number, boolean?][] }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ marginHorizontal: 18, marginTop: 8, borderRadius: 16, backgroundColor: p.sheet, paddingHorizontal: 16, paddingVertical: 8 }}>
      {rows.map(([label, value, strong]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
          <Text style={{ color: strong ? p.ink : p.inkSoft, fontSize: 15, fontWeight: strong ? "600" : "400" }}>{t.t(label)}</Text>
          <Text style={{ color: p.ink, fontSize: 15, fontWeight: strong ? "600" : "400" }}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function List({ items, more }: { items: string[]; more: number }) {
  const p = usePalette();
  const t = useT();
  const lines = more > 0 ? [...items, t.t("…and {n} more", { n: more })] : items;
  return (
    <View style={{ paddingHorizontal: 18 }}>
      {lines.map((x, i) => (
        <Text key={i} style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22 }}>{`• ${x}`}</Text>
      ))}
    </View>
  );
}

const Rows = ({ children }: { children: ReactNode }) => {
  const p = usePalette();
  return <View style={{ marginHorizontal: 18, borderRadius: 16, backgroundColor: p.sheet, overflow: "hidden" }}>{children}</View>;
};

// ---- Page 1: the columns ----

const isReady = (w: Wizard) => w.mapping.date >= 0 && w.mapping.amount >= 0 && [w.mapping.from, w.mapping.to, w.mapping.account].some((i) => i >= 0);
const sampleOf = (w: Wizard, index: number) => (index < 0 ? "" : (w.table.rows.find((r) => r.cells[index])?.cells[index] ?? ""));

function ColumnsPage({ w }: { w: Wizard }) {
  const t = useT();
  const [, redraw] = useState(0);
  const again = () => redraw((n) => n + 1);
  const { table } = w;
  const notes: string[] = [];
  if (w.damaged) notes.push(t.t("Some characters could not be read. If the text looks wrong, choose another file encoding below."));
  if (table.ragged) notes.push(t.t("Rows with a different number of cells than the first row: {n}. Missing cells are taken as empty, extra ones are left out.", { n: table.ragged }));
  if (w.formats.ambiguous && w.mapping.date >= 0) notes.push(t.t("The dates can be read as day and month or as month and day. Check the examples below."));
  if (!table.rows.length) notes.push(t.t("The file has column names but no rows."));
  const missing: string[] = [];
  if (w.mapping.date < 0) missing.push("Date");
  if (w.mapping.amount < 0) missing.push("Amount");
  if (![w.mapping.from, w.mapping.to, w.mapping.account].some((i) => i >= 0)) missing.push("Account");
  const facts = t.t("{file} · {rows} · separator: {delimiter}", { file: w.fileName, rows: t.tc("{n} row", "{n} rows", table.rows.length), delimiter: t.t(DELIMITER_NAMES[table.delimiter] ?? table.delimiter) });
  const columnName = (i: number) => (i < 0 ? t.t("Not used") : table.headers[i] || t.t("Column {n}", { n: i + 1 }));
  const chooseColumn = (key: keyof Mapping, label: string) =>
    pickSheet(
      t.t(label),
      [["-1", t.t("Not used")], ...table.headers.map((h, i): [string, string, string] => [String(i), h || t.t("Column {n}", { n: i + 1 }), sampleOf(w, i).slice(0, 40)])],
      String(w.mapping[key]),
      (v) => {
        w.mapping[key] = Number(v);
        w.formats = guessFormats(w.table, w.mapping);
        again();
      },
    );
  const samples = readRecords({ ...table, rows: table.rows.slice(0, 5) }, w.mapping, w.formats);
  const next = () => {
    const data = ledgerNow();
    w.records = readRecords(w.table, w.mapping, w.formats);
    w.refs = referencesOf(w.records);
    const guessed = guessLinks(data, w.refs);
    // A choice made before stays when its name is still in the file.
    const keep = (now: Map<string, string>, before: Map<string, string> | undefined) => new Map([...now].map(([k, v]) => [k, before?.get(k) ?? v]));
    w.links = { accounts: keep(guessed.accounts, w.links?.accounts), categories: keep(guessed.categories, w.links?.categories) };
    if (w.refs.accounts.length || w.refs.categories.length) w.layers.push(sheets.open(<LinksPage w={w} />, "full"));
    else toPreview(w);
  };
  return (
    <FullPage
      title="Match columns"
      footer={
        <>
          {missing.length ? <Note>{t.t("Choose the columns for: {fields}", { fields: missing.map((m) => t.t(m)).join(", ") })}</Note> : null}
          <Button label="Next" onPress={next} disabled={!isReady(w) || !table.rows.length} />
        </>
      }
    >
      <Note>{facts}</Note>
      {notes.map((n) => (
        <Note key={n} caution>
          {n}
        </Note>
      ))}
      <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 18, paddingVertical: 8 }}>{t.t("Choose which column of the file holds each part of an operation. Columns named as in the file of this application are matched already.")}</Text>
      <Rows>
        {FIELDS.map(([key, required, label]) => {
          const sample = sampleOf(w, w.mapping[key]);
          return <ChoiceRow key={key} label={t.t(label)} value={columnName(w.mapping[key])} hint={sample ? (sample.length > 40 ? `${sample.slice(0, 40)}…` : sample) : required ? t.t("Required") : ""} onPress={() => chooseColumn(key, label)} />;
        })}
      </Rows>
      <Heading>{t.t("How the file is written")}</Heading>
      <Rows>
        <ChoiceRow
          label={t.t("Date order")}
          value={DATE_EXAMPLES[w.formats.dateOrder]}
          onPress={() =>
            optionDialog(
              "Date order",
              DATE_ORDERS.map((o) => ({ value: o, label: DATE_EXAMPLES[o], hint: { ymd: "Year, month, day", dmy: "Day, month, year", mdy: "Month, day, year" }[o] })),
              w.formats.dateOrder,
              (v) => {
                w.formats = { ...w.formats, dateOrder: v };
                again();
              },
            )
          }
        />
        <ChoiceRow
          label={t.t("Decimal point")}
          hint={t.t("Used when a number such as 1,234 could be read both ways")}
          value={w.formats.decimal === "." ? "1234.56" : "1234,56"}
          onPress={() =>
            optionDialog(
              "Decimal point",
              [
                { value: ".", label: "1234.56", hint: "A point" },
                { value: ",", label: "1234,56", hint: "A comma" },
              ],
              w.formats.decimal,
              (v) => {
                w.formats = { ...w.formats, decimal: v as "." | "," };
                again();
              },
            )
          }
        />
        <ChoiceRow
          label={t.t("File encoding")}
          value={ENCODINGS.find((e) => e.value === w.encoding)?.label ?? w.encoding}
          onPress={() =>
            optionDialog("File encoding", ENCODINGS, w.encoding, (v) => {
              const before = w.encoding;
              w.encoding = v;
              try {
                loadTable(w);
              } catch (error) {
                w.encoding = before;
                loadTable(w);
                showInfo(error instanceof Error ? t.t(error.message) : String(error), t.t("The file cannot be used"));
              }
              again();
            })
          }
        />
      </Rows>
      <Heading>{t.t("How the first rows are read")}</Heading>
      <Note>{t.t("Your file · the first rows as they will be understood")}</Note>
      <View style={{ paddingHorizontal: 18 }}>
        <MiniTable
          head={["Line", "Date", "Type", "Amount", "Account", "Category"].map((h) => t.t(h))}
          rows={samples.map((r) => [String(r.line), r.date ?? "", r.type ? t.t(TYPE_LABELS[r.type]) : "", r.minor ? `${(r.minor / 100).toFixed(2)} ${r.currency}`.trim() : "", [r.from, r.to].filter(Boolean).join(" → "), r.category])}
          problem={(i) => (samples[i]?.problem ? reasonText(t, samples[i]!.problem!) : null)}
        />
      </View>
    </FullPage>
  );
}

function ledgerNow(): LedgerData {
  const s = appStore().getState();
  if (s.status !== "ready") throw new Error("the ledger is not open");
  return s.data;
}

// ---- Page 2: accounts and categories ----

function LinksPage({ w }: { w: Wizard }) {
  const t = useT();
  const data = useLedger();
  const [, redraw] = useState(0);
  const links = w.links!;
  const made = [...links.accounts.values(), ...links.categories.values()].filter((v) => v === "new").length;
  const rowsOf = (n: number) => t.tc("{n} row", "{n} rows", n);
  const accountText = (id: string | undefined) => {
    const a = id && id !== "new" ? data.accounts.find((x) => x.id === id) : null;
    return a ? `${a.name} · ${a.currency}` : t.t("Create new");
  };
  const categoryText = (id: string | undefined) => {
    const c = id && id !== "new" ? data.categories.find((x) => x.id === id) : null;
    return c ? categoryPath(c, data.categories) : t.t("Create new");
  };
  return (
    <FullPage title="Accounts and categories" footer={<Button label="Preview" onPress={() => toPreview(w)} />}>
      <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 18, paddingVertical: 8 }}>{t.t("Choose the account or category of yours that each name in the file stands for. What is not found is created when you import.")}</Text>
      <Note>{t.t("To be created: {n}", { n: made })}</Note>
      {w.refs.accounts.length ? (
        <>
          <Heading>{t.t("Accounts")}</Heading>
          <Rows>
            {w.refs.accounts.map((ref) => (
              <ChoiceRow
                key={ref.name}
                label={ref.name}
                hint={[rowsOf(ref.rows), [...ref.currencies].join(", ")].filter(Boolean).join(" · ")}
                value={accountText(links.accounts.get(ref.name))}
                onPress={() =>
                  pickSheet(
                    ref.name,
                    [["new", t.t("Create a new account")], ...data.accounts.filter((a) => !a.archived).map((a): [string, string, string] => [a.id, a.name, a.currency])],
                    links.accounts.get(ref.name) ?? "new",
                    (v) => {
                      links.accounts.set(ref.name, v);
                      redraw((n) => n + 1);
                    },
                  )
                }
              />
            ))}
          </Rows>
        </>
      ) : null}
      {w.refs.categories.length ? (
        <>
          <Heading>{t.t("Categories")}</Heading>
          <Rows>
            {w.refs.categories.map((ref) => (
              <ChoiceRow
                key={ref.key}
                label={ref.name}
                hint={`${t.t(ref.type === "income" ? "Income" : "Expense")} · ${rowsOf(ref.rows)}`}
                value={categoryText(links.categories.get(ref.key))}
                onPress={() =>
                  pickSheet(
                    ref.name,
                    [["new", t.t("Create a new category")], ...data.categories.filter((c) => c.type === ref.type && !c.archived).map((c): [string, string] => [c.id, categoryPath(c, data.categories)])],
                    links.categories.get(ref.key) ?? "new",
                    (v) => {
                      links.categories.set(ref.key, v);
                      redraw((n) => n + 1);
                    },
                  )
                }
              />
            ))}
          </Rows>
        </>
      ) : null}
    </FullPage>
  );
}

// ---- Page 3: the preview ----

function toPreview(w: Wizard): void {
  w.plan = planImport(ledgerNow(), w.records, w.links ?? { accounts: new Map(), categories: new Map() }, appStore().env);
  w.layers.push(sheets.open(<PreviewPage w={w} />, "full"));
}

function problemFileText(t: Translator, w: Wizard): string {
  const quote = (s: string) => '"' + (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""') + '"';
  const rows = [["line", "reason", ...w.table.headers], ...(w.plan?.invalid ?? []).map((x) => [String(x.line), reasonText(t, x.reason), ...x.cells])];
  return "﻿" + rows.map((r) => r.map(quote).join(",")).join("\r\n");
}

function PreviewPage({ w }: { w: Wizard }) {
  const t = useT();
  const money = useMoney();
  const data = useLedger();
  const plan = w.plan!;
  const allCategories = [...data.categories, ...plan.created.categories];
  const accountOf = (id?: string | null) => (id ? (data.accounts.find((a) => a.id === id) ?? plan.created.accounts.find((a) => a.id === id)) : undefined);
  const categoryOf = (id?: string | null) => (id ? allCategories.find((c) => c.id === id) : undefined);
  const warnings: string[] = [];
  if (plan.repeated) warnings.push(t.t("Rows that repeat another row of the file: {n}. They are added as separate operations.", { n: plan.repeated }));
  if (plan.future) warnings.push(t.t("Rows dated in the future: {n}. They are added as scheduled payments and happen on their day.", { n: plan.future }));
  if (plan.ignoredSigns) warnings.push(t.t("Income rows with a minus sign: {n}. The sign is ignored.", { n: plan.ignoredSigns }));
  if (w.formats.ambiguous && w.mapping.date >= 0) warnings.push(t.t("The dates can be read as day and month or as month and day. Check the examples below."));
  if (w.damaged) warnings.push(t.t("Some characters could not be read. If the text looks wrong, choose another file encoding below."));
  const examples = plan.ops.slice(0, ROWS_SHOWN).map((op, i) => {
    const from = accountOf(op.from),
      to = accountOf(op.to);
    const amount = op.type === "transfer" && from?.currency !== to?.currency ? `${money(op.amount, from?.currency)} → ${money(op.receive ?? 0, to?.currency)}` : money(op.amount, (from ?? to)?.currency);
    const category = categoryOf(op.category);
    return [String(plan.lines[i]), op.date, t.t(TYPE_LABELS[op.type]), amount, [from?.name, to?.name].filter(Boolean).join(" → "), category ? categoryPath(category, allCategories) : ""];
  });
  const newAccounts = plan.created.accounts.map((a) => `${a.name} · ${a.currency}`);
  const newCategories = plan.created.categories.map((c) => categoryPath(c, allCategories));
  const run = () =>
    confirmDialog(
      t.t("Add {n} operations to your data? A backup of the current data is made first.", { n: plan.ops.length }),
      () => {
        try {
          const store = appStore();
          store.createBackup("safety");
          const added = store.run((tx, env) => applyImport(tx, plan, env));
          // The pages of the wizard go, so going back never offers the same plan again.
          for (const id of w.layers) sheets.close(id);
          sheets.open(<DonePage added={added} plan={plan} />, "full");
        } catch (error) {
          showError(t, error);
        }
      },
      false,
      "Import",
    );
  return (
    <FullPage title="Import preview" footer={<Button label={t.t("Import {n} operations", { n: plan.ops.length })} onPress={run} disabled={!plan.ops.length} />}>
      <Facts
        rows={[
          ["Rows in the file", plan.total],
          ["To be added", plan.ops.length, true],
          ["Already in your data, left out", plan.duplicates],
          ["With problems, left out", plan.invalid.length],
          ["New accounts", plan.created.accounts.length],
          ["New categories", plan.created.categories.length],
          ["New tags", plan.newTags.length],
        ]}
      />
      {warnings.map((x) => (
        <Note key={x} caution>
          {x}
        </Note>
      ))}
      {plan.ops.length ? null : <Note caution>{t.t("Nothing from this file can be added.")}</Note>}
      {examples.length ? (
        <>
          <Heading>{t.t("Operations to be added")}</Heading>
          <Note>{examples.length < plan.ops.length ? t.t("Your file · the first {shown} of {total} operations", { shown: examples.length, total: plan.ops.length }) : t.t("Your file · all {total} operations", { total: plan.ops.length })}</Note>
          <View style={{ paddingHorizontal: 18 }}>
            <MiniTable head={["Line", "Date", "Type", "Amount", "Account", "Category"].map((h) => t.t(h))} rows={examples} />
          </View>
        </>
      ) : null}
      {newAccounts.length ? (
        <>
          <Heading>{t.t("New accounts")}</Heading>
          <List items={newAccounts.slice(0, NAMES_SHOWN)} more={newAccounts.length - NAMES_SHOWN} />
        </>
      ) : null}
      {newCategories.length ? (
        <>
          <Heading>{t.t("New categories")}</Heading>
          <List items={newCategories.slice(0, NAMES_SHOWN)} more={newCategories.length - NAMES_SHOWN} />
        </>
      ) : null}
      {plan.invalid.length ? (
        <>
          <Heading>{t.t("Rows that are left out")}</Heading>
          <List items={plan.invalid.slice(0, PROBLEMS_SHOWN).map((x) => t.t("Line {line}: {reason}", { line: x.line, reason: reasonText(t, x.reason) }))} more={plan.invalid.length - PROBLEMS_SHOWN} />
          <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
            <Button label="Save the list of these rows" kind="outline" onPress={() => void shareTextFile("monivra-skipped-rows.csv", problemFileText(t, w), "text/csv").catch((e) => showError(t, e))} />
          </View>
        </>
      ) : null}
    </FullPage>
  );
}

// ---- Page 4: done ----

function DonePage({ added, plan }: { added: Added; plan: ImportPlan }) {
  const t = useT();
  const close = useCloseLayer();
  const [undone, setUndone] = useState(false);
  const undo = () =>
    confirmDialog(
      t.t("Take back this import? The operations, accounts and categories it added are removed."),
      () => {
        try {
          appStore().run((tx) => undoImport(tx, added));
          setUndone(true);
          close();
          toast(t.t("Import taken back"));
        } catch (error) {
          showError(t, error);
        }
      },
      false,
      "Take back",
    );
  return (
    <FullPage
      title="Import finished"
      footer={
        <>
          <Button
            label="Show operations"
            onPress={() => {
              close();
              router.dismissAll();
              router.navigate("/operations");
            }}
          />
          <Button label="Take back this import" kind="outline" onPress={undo} disabled={undone} />
        </>
      }
    >
      <Facts
        rows={[
          ["Operations added", added.ops.length, true],
          ["Accounts created", added.accounts.length],
          ["Categories created", added.categories.length],
          ["Left out as already there", plan.duplicates],
          ["Left out with problems", plan.invalid.length],
        ]}
      />
      <Text style={{ fontSize: 15, lineHeight: 22, padding: 18 }}>{t.t("A copy of your data from before the import is kept in Saved backups.")}</Text>
    </FullPage>
  );
}

// ---- The example ----

const COLUMN_HELP: [string, string, string][] = [
  ["type", "Kind of operation", "income, expense, transfer or adjustment. Left empty, the sign of the amount decides: a minus is an expense."],
  ["date", "Day of the operation", "2026-03-01 (year, month, day). Other orders such as 01.03.2026 are read when you choose them while importing."],
  ["amount", "Amount, in the currency of the account", "12.50 · a point or a comma before the cents, at most two decimals."],
  ["currency", "Currency of the account", "Three letters, such as USD. Left empty, the currency of the account is used, or the main currency for a new one."],
  ["from", "Account the money leaves", "For an expense, a transfer and a decrease of the balance."],
  ["to", "Account the money goes to", "For an income, a transfer and an increase of the balance."],
  ["category", "Category", "Food / Lunch means the subcategory Lunch of Food. Not used for transfers and adjustments."],
  ["comment", "Note", "Any text."],
  ["tags", "Tags", "Several tags are separated by |, such as work|lunch."],
  ["to_amount, to_currency", "Amount received and its currency", "Only for a transfer between accounts in different currencies."],
];
const GOOD_TO_KNOW = [
  "Columns may be separated by commas, semicolons or tabs. The text should be UTF-8; other encodings can be chosen while importing.",
  "You can import a file with other column names: you choose which column is which.",
  "Accounts and categories that are not found are created. Before anything is added you see what will happen and can link each name to an account or category you have.",
  "A row that is already in your data (same day, amount, accounts, category and comment) is left out, so importing a file twice does not add its operations twice.",
  "A transfer between your accounts is neither an income nor an expense.",
  "A text that begins with = + - or @ is written with a leading apostrophe by this application so that spreadsheets do not take it for a formula. The apostrophe is removed when the file is imported.",
];

function Expand({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
        <Icon name={open ? "up" : "down"} size={18} color={p.accentInk} />
        <Text style={{ color: p.accentInk, fontSize: 15 }}>{t.t(title)}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ExamplePage() {
  const p = usePalette();
  const t = useT();
  const [head = [], ...rows] = CSV_EXAMPLE.split("\r\n").map((line) => line.split(","));
  const download = () =>
    optionDialog(
      "Download CSV",
      [
        { value: "example", label: "Example with sample rows", hint: "A row of every kind of operation to change" },
        { value: "empty", label: "Blank template", hint: "Only the names of the columns, to fill in" },
      ],
      undefined,
      (kind) =>
        void saveTextFile(kind === "empty" ? "monivra-import-template.csv" : "monivra-import-example.csv", "﻿" + (kind === "empty" ? CSV_COLUMNS.join(",") : CSV_EXAMPLE), "text/csv")
          .then((saved) => saved && toast(t.t("File saved")))
          .catch((e) => showError(t, e)),
    );
  return (
    <FullPage title="Example of a CSV file" footer={<Button label="Download CSV" onPress={download} />}>
      <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 18, paddingTop: 8 }}>{t.t("One row is one operation; the first row names the columns.")}</Text>
      <Note>{t.t("Sample values for illustration. They are not your data.")}</Note>
      <View style={{ paddingHorizontal: 18 }}>
        <MiniTable head={head} rows={rows} width={110} />
      </View>
      <Expand title="What each column means">
        {COLUMN_HELP.map(([name, what, how]) => (
          <View key={name} style={{ paddingVertical: 6 }}>
            <Text style={{ color: p.ink, fontSize: 15, fontWeight: "600" }}>{`${name} · ${t.t(what)}`}</Text>
            <Text style={{ color: p.inkSoft, fontSize: 14, lineHeight: 20 }}>{t.t(how)}</Text>
          </View>
        ))}
      </Expand>
      <Expand title="Good to know">
        {GOOD_TO_KNOW.map((x) => (
          <Text key={x} style={{ color: p.inkSoft, fontSize: 14, lineHeight: 20, paddingVertical: 4 }}>
            {t.t(x)}
          </Text>
        ))}
      </Expand>
    </FullPage>
  );
}

// ---- The page of the Data section ----

export function ImportPage() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Import data") }} />
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
        <Text style={{ color: p.ink, fontSize: 17, lineHeight: 26, marginBottom: 14 }}>{t.t("Bring operations from another application as a CSV file. Before exporting there, switch that application to English: translated headers and names may not be recognised.")}</Text>
        <Text style={{ color: p.ink, fontSize: 17, lineHeight: 26 }}>{t.t("You match the columns and your accounts and categories, and see what will be added before anything changes. Rows already in your data are skipped, and a backup is made before the import.")}</Text>
      </View>
      <View style={{ paddingHorizontal: 18, paddingBottom: 12, gap: 10 }}>
        <Button label="Select CSV file" onPress={() => void startImport(t).catch((e) => showError(t, e))} />
        <Button label="View example" kind="outline" onPress={() => sheets.open(<ExamplePage />, "full")} />
      </View>
    </View>
  );
}
