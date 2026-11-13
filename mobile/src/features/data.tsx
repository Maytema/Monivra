// The Data section (js/screens/more/backup-pages.js, deletion-page.js, js/data/import-export.js): the menu,
// the saved backups, the page of one backup or data file with what merging or replacing would change,
// the data file page and the ways to delete data. One route (`/data?page=…`) shows each page.
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { FileProblem, readDataFile } from "../domain/datafile.ts";
import { contentsOf, DELETIONS, planRestore, type ConflictWay, type Contents, type DeletionWay, type RestoreSummary, type ScheduledWay } from "../domain/restore.ts";
import type { LedgerData } from "../domain/types.ts";
import type { BackupInfo } from "../application/store.ts";
import { pickFile, saveTextFile, shareTextFile } from "../platform/files.ts";
import { removePin } from "../platform/lock.ts";
import type { Translator } from "../i18n/index.ts";
import { appStore, showError, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { confirmDialog, optionDialog, showInfo, toast } from "../ui/dialogs.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { mix } from "../ui/theme.ts";
import { Footnote, SettingRow } from "../ui/rows.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { ExportPage } from "./export-page.tsx";
import { Check } from "./filters-panel.tsx";
import { ImportPage } from "./import-wizard.tsx";

const go = (page: string, extra: Record<string, string> = {}) => router.push({ pathname: "/data", params: { page, ...extra } });

// A data file the person chose, waiting on the restore page (too big for the route's parameters).
let chosenFile: { name: string; data: LedgerData; exportedAt?: string; build?: string } | null = null;

const two = (n: number) => String(n).padStart(2, "0");
// "Nov 13, 2026, 14:05": the moment in the phone's time, from built-in tables (decision 0003).
function moment(t: Translator, iso: string | undefined): string {
  if (!iso) return t.t("unknown");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t.t("unknown");
  const day = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  return `${t.day(day)}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

const BACKUP_TITLES: Record<string, string> = { auto: "Automatic backup", safety: "Backup before a change" };
const backupTitle = (reason: string) => BACKUP_TITLES[reason] ?? "Local backup";

// ---- Small parts ---------------------------------------------------------------------------------

function Para({ children, soft = false, small = false }: { children: string; soft?: boolean; small?: boolean }) {
  const p = usePalette();
  return <Text style={{ color: soft ? p.muted : p.ink, fontSize: small ? 13 : 16, lineHeight: small ? 19 : 24, marginBottom: 10 }}>{children}</Text>;
}

// A line that opens what is under it (the <details> of the first application).
function Details({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
        <Icon name={open ? "up" : "down"} size={18} color={p.accentInk} />
        <Text style={{ color: p.accentInk, fontSize: 15 }}>{t.t(title)}</Text>
      </Pressable>
      {open ? <View style={{ paddingLeft: 4 }}>{children}</View> : null}
    </View>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  const p = usePalette();
  const t = useT();
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", gap: 12, paddingVertical: 5 }}>
          <Text style={{ color: p.muted, fontSize: 14, width: 150 }}>{t.t(label)}</Text>
          <Text style={{ color: p.ink, fontSize: 14, flex: 1 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Bullets({ lines, tone }: { lines: string[]; tone?: string }) {
  const p = usePalette();
  return (
    <View>
      {lines.map((line, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 3 }}>
          <Text style={{ color: tone ?? p.inkSoft, fontSize: 15 }}>•</Text>
          <Text style={{ color: tone ?? p.inkSoft, fontSize: 15, lineHeight: 21, flex: 1 }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

// A chosen value that opens its choices (the dropdown of the first application).
function Dropdown({ label, onPress, check = false }: { label: string; onPress: () => void; check?: boolean }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: pressed ? p.soft : p.sheet, marginVertical: 6 })}>
      {check ? <Icon name="check" size={22} color={p.accentInk} /> : null}
      <Text style={{ color: p.ink, fontSize: 16, flex: 1 }}>{t.t(label)}</Text>
      <Icon name="down" size={20} color={p.muted} />
    </Pressable>
  );
}

const Page = ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) => {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(title) }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 }}>{footer}</View> : null}
    </View>
  );
};

// ---- The menu ------------------------------------------------------------------------------------

function DataMenu() {
  return (
    <Page title="Data">
      <SettingRow title="Saved backups" icon="archive" caption="Create and restore data from automatic local copies" onPress={() => go("backups")} />
      <SettingRow title="Data file" icon="receipt" caption="Create and restore data from a manual backup file" onPress={() => go("file")} />
      <SettingRow title="Import data" icon="upload" caption="Import data from a file" onPress={() => go("import")} />
      <SettingRow title="Export data" icon="download" caption="Save a copy of your data as a file" onPress={() => go("export")} />
      <SettingRow title="Delete my data" icon="trash" caption="Permanently delete all data" onPress={() => go("deletion")} />
    </Page>
  );
}

// ---- Saved backups -------------------------------------------------------------------------------

function BackupCard({ backup, onPress }: { backup: BackupInfo; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ padding: 16, borderRadius: 16, backgroundColor: pressed ? p.soft : p.sheet, marginBottom: 10 })}>
      <Text style={{ color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t(backupTitle(backup.reason))}</Text>
      <Text style={{ color: p.inkSoft, fontSize: 14, marginTop: 4 }}>{moment(t, backup.at)}</Text>
      <Text style={{ color: p.muted, fontSize: 13, marginTop: 2 }}>{t.t("Accounts: {accounts} · Categories: {categories} · Operations: {ops}", { accounts: backup.accounts, categories: backup.categories, ops: backup.ops })}</Text>
    </Pressable>
  );
}

function SavedBackups() {
  const p = usePalette();
  const t = useT();
  useLedger();
  const [list, setList] = useState(() => appStore().backups());
  const create = () => {
    try {
      appStore().createBackup("manual");
      setList(appStore().backups());
      toast(t.t("Backup saved"));
    } catch (error) {
      showError(t, error);
    }
  };
  return (
    <Page title="Saved backups">
      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Para>{t.t("Backups are made automatically once a day when Save locally is on, and you can make one yourself at any time.")}</Para>
        <Button label="Create a backup" onPress={create} />
        <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }}>{t.t("To see what is in a backup and restore it, select one of the previous backups")}</Text>
      </View>
      <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
        <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", marginBottom: 12 }}>{t.t("Previous backups")}</Text>
        {list.map((b) => (
          <BackupCard key={b.id} backup={b} onPress={() => go("restore", { source: "backup", id: b.id })} />
        ))}
      </View>
    </Page>
  );
}

// ---- Restore (a backup or a data file) -----------------------------------------------------------

const SCHEDULED_WAYS: { value: ScheduledWay; label: string; hint: string }[] = [
  { value: "count", label: "Count and schedule", hint: "Count all scheduled payments whose time has come since the backup was made and, if they repeat, schedule the next ones." },
  { value: "skip", label: "Skip and schedule", hint: "Do not count the scheduled payments whose time has come since the backup was made and, if they repeat, schedule the next ones." },
  { value: "none", label: "Do not restore", hint: "Do not restore the scheduled payments of the backup, if it has any." },
];
const CONFLICT_WAYS: { value: ConflictWay; label: string; hint: string }[] = [
  { value: "keep", label: "Keep the version on this device", hint: "Records that are in both stay as they are here." },
  { value: "backup", label: "Use the backup's version", hint: "Records that are in both are taken from the backup, also where they were changed here later." },
];
const LIST_NAMES: Record<string, string> = { accounts: "Accounts", categories: "Categories", ops: "Operations", scheduled: "Scheduled payments", budgets: "Budgets", tags: "Tags" };

const counts = (t: Translator, c: Contents) => t.t("{accounts} accounts, {categories} categories, {ops} operations", { accounts: c.accounts, categories: c.categories + c.subcategories, ops: c.ops });

function accountKinds(t: Translator, c: Contents): string {
  return [
    c.regular && t.tc("{n} regular", "{n} regular", c.regular),
    c.cards && t.tc("{n} credit card", "{n} credit cards", c.cards),
    c.savings && t.tc("{n} savings account", "{n} savings accounts", c.savings),
    c.debts && t.tc("{n} debt", "{n} debts", c.debts),
  ]
    .filter(Boolean)
    .join(" · ");
}

function mergeLines(t: Translator, summary: RestoreSummary): string[] {
  const lines = Object.entries(summary.merge ?? {}).flatMap(([list, r]) => {
    const report = r as { added?: number; changed?: number; same?: number };
    const parts = [
      report.added && t.t("{n} new", { n: report.added }),
      report.changed && t.t(summary.conflicts === "keep" ? "{n} differ and stay as they are here" : "{n} replaced by the backup version (also where the current one is newer)", { n: report.changed }),
      report.same && t.t("{n} already here", { n: report.same }),
    ].filter(Boolean);
    return parts.length ? [`${t.t(LIST_NAMES[list] ?? list)}: ${parts.join(", ")}`] : [];
  });
  return lines.length ? lines : [t.t("The backup holds no records.")];
}

function mergeWarnings(t: Translator, s: RestoreSummary): string[] {
  return [
    s.categoriesSeparated ? t.t("Some categories of the backup have the same id as categories here but are the other kind (income or expense). They are added as separate categories, and their operations keep their kind.") : "",
    s.lookAlike ? t.t("{n} operations look like operations you already have (same day, amount, accounts, category and comment) but are recorded under another id. They are added too.", { n: s.lookAlike }) : "",
    s.sameAccountNames ? t.t("{n} accounts have the name and currency of accounts you already have. They are added as separate accounts.", { n: s.sameAccountNames }) : "",
  ].filter(Boolean);
}

function replaceLines(t: Translator, s: RestoreSummary): string[] {
  return [
    `${t.t("Now")}: ${counts(t, s.current)}`,
    `${t.t("After")}: ${counts(t, s.incoming)}`,
    t.t("Settings and exchange rates are taken from the backup."),
    s.scheduledLetGo ? t.t("{n} current scheduled payments refer to accounts or categories the backup does not have and are let go.", { n: s.scheduledLetGo }) : "",
  ].filter(Boolean);
}

// A short name of a record for the list of what differs.
function recordName(list: string, r: Record<string, unknown>): string {
  if (list === "ops") return [r.date, typeof r.amount === "number" ? String(r.amount / 100) : "", r.comment].filter(Boolean).join(" · ").slice(0, 70);
  return String(r.name ?? r.title ?? r.id);
}

function Differences({ summary }: { summary: RestoreSummary }) {
  const p = usePalette();
  const t = useT();
  const SHOWN = 15;
  const groups = Object.entries(summary.merge ?? {}).filter(([, r]) => (r as { changed?: number }).changed);
  if (!groups.length) return null;
  return (
    <Details title="Show the records that differ">
      {groups.map(([list, r]) => {
        const report = r as { changed: number; items: { now: Record<string, unknown>; backup: Record<string, unknown> }[] };
        const lines = report.items.slice(0, SHOWN).map(({ now, backup }) => {
          const a = recordName(list, now),
            b = recordName(list, backup);
          return a === b ? a : `${a} → ${b}`;
        });
        if (report.changed > SHOWN) lines.push(t.t("and {n} more", { n: report.changed - SHOWN }));
        return (
          <View key={list}>
            <Text style={{ color: p.ink, fontSize: 15, fontWeight: "600", marginTop: 6 }}>{t.t(LIST_NAMES[list] ?? list)}</Text>
            <Bullets lines={lines} />
          </View>
        );
      })}
    </Details>
  );
}

function WayCard({ title, problem, problemText, children }: { title: string; problem: boolean; problemText: string; children: ReactNode }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ borderRadius: 16, backgroundColor: p.sheet, padding: 16, marginBottom: 12 }}>
      <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>{t.t(title)}</Text>
      {problem ? <Text style={{ color: p.negativeInk, fontSize: 15, lineHeight: 21 }}>{problemText}</Text> : children}
    </View>
  );
}

function RestorePage({ source, id }: { source: string; id?: string }) {
  const p = usePalette();
  const t = useT();
  const here = useLedger();
  const [scheduled, setScheduled] = useState<ScheduledWay>("count");
  const [conflicts, setConflicts] = useState<ConflictWay>("keep");
  const origin = useMemo(() => {
    if (source === "backup" && id) {
      const info = appStore().backups().find((b) => b.id === id);
      const data = appStore().backupData(id);
      if (!info || !data) return null;
      return {
        data,
        title: "Restore from backup",
        created: moment(t, info.at),
        rows: [["Type", t.t(backupTitle(info.reason))], ["Created", moment(t, info.at)], ["Data format version", String(info.schema)], ["Application build", info.build || t.t("unknown")]] as [string, string][],
      };
    }
    if (!chosenFile) return null;
    const f = chosenFile;
    return {
      data: f.data,
      title: "Restore from file",
      created: f.exportedAt ? moment(t, f.exportedAt) : t.t("unknown"),
      rows: [["File", f.name], ["Created", f.exportedAt ? moment(t, f.exportedAt) : t.t("unknown")], ["Data format version", String(f.data.schema)], ["Application build", f.build || t.t("unknown")]] as [string, string][],
    };
  }, [source, id, t]);
  const merge = useMemo(() => (origin ? planRestore(here, origin.data, { mode: "merge", scheduled, conflicts }) : null), [here, origin, scheduled, conflicts]);
  const replace = useMemo(() => (origin ? planRestore(here, origin.data, { mode: "replace", scheduled, conflicts }) : null), [here, origin, scheduled, conflicts]);
  if (!origin || !merge || !replace) return <Page title="Restore from backup"><Footnote>There is nothing to restore</Footnote></Page>;
  const c = contentsOf(origin.data);
  const held: [string, string][] = [
    ["Accounts", `${c.accounts}${c.accounts ? ` (${accountKinds(t, c)})` : ""}`],
    ["Categories", `${c.categories}${c.subcategories ? ` + ${t.tc("{n} subcategory", "{n} subcategories", c.subcategories)}` : ""}`],
    ["Operations", String(c.ops)],
    ["Scheduled payments", String(c.scheduled)],
    ["Budgets", String(c.budgets)],
    ["Tags", String(c.tags)],
    ["Currencies", c.currencies.join(", ") || "–"],
  ];
  const way = SCHEDULED_WAYS.find((w) => w.value === scheduled)!;
  const conflictWay = CONFLICT_WAYS.find((w) => w.value === conflicts)!;
  const anyDiffer = Object.values(merge.summary.merge ?? {}).some((r) => (r as { changed?: number }).changed);
  const restore = (mode: "merge" | "replace") =>
    confirmDialog(
      `${t.t(mode === "replace" ? "Replace current data with this backup?" : "Merge this backup into the current data?")} ${t.t("A backup of the current data is made first.")}`,
      () => {
        try {
          appStore().restore(origin.data, { mode, scheduled, conflicts, safety: true });
          chosenFile = null;
          router.dismissAll();
          toast(t.t("Backup restored"));
        } catch (error) {
          showError(t, error);
        }
      },
      false,
      "Confirm",
    );
  const refusal = (plan: typeof merge, other: typeof merge) =>
    t.t(other.problem || plan.summary.mode === "replace" ? "This file has a record that does not pass the checks, so it cannot be restored." : "This backup cannot be merged: some of its records do not fit the data here. Replacing the data is possible.");
  return (
    <Page
      title={origin.title}
      footer={
        <>
          <Button label="Merge data" onPress={() => restore("merge")} disabled={!!merge.problem} />
          <Button label="Replace data" kind="outline" onPress={() => restore("replace")} disabled={!!replace.problem} />
        </>
      }
    >
      <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
        <Text style={{ color: p.ink, fontSize: 16, lineHeight: 23 }}>{`${t.t("Created")}: ${origin.created}`}</Text>
        <Text style={{ color: p.ink, fontSize: 16, lineHeight: 23 }}>{counts(t, c)}</Text>
        <Details title="Details of this backup">
          <Facts rows={[...origin.rows, ...held]} />
        </Details>
        <Para soft>{t.t("Merge keeps what is on this device and adds the records of the backup.")}</Para>
        <WayCard title="Merge data" problem={!!merge.problem} problemText={refusal(merge, replace)}>
          <Bullets lines={mergeLines(t, merge.summary)} />
          <Bullets lines={mergeWarnings(t, merge.summary)} tone={p.negativeInk} />
          {anyDiffer ? (
            <>
              <Text style={{ color: p.inkSoft, fontSize: 14, marginTop: 10 }}>{t.t("A record that is in both the data here and the backup:")}</Text>
              <Dropdown label={conflictWay.label} onPress={() => optionDialog("Which version stays?", CONFLICT_WAYS, conflicts, setConflicts)} />
            </>
          ) : null}
          <Differences summary={merge.summary} />
        </WayCard>
        <Para soft>{t.t("Replace deletes what is on this device and uses only the backup.")}</Para>
        <WayCard title="Replace data" problem={!!replace.problem} problemText={refusal(replace, merge)}>
          <Bullets lines={replaceLines(t, replace.summary)} />
        </WayCard>
        <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", marginTop: 6 }}>{t.t("Scheduled payments")}</Text>
        <Dropdown check label={way.label} onPress={() => optionDialog("How to restore scheduled payments?", SCHEDULED_WAYS, scheduled, setScheduled)} />
        <Para soft small>{t.t(way.hint)}</Para>
      </View>
    </Page>
  );
}

// ---- Data file ------------------------------------------------------------------------------------

export const dataFileName = (): string => `monivra-backup-${appStore().env.clock.today()}.json`;

function fileProblemText(t: Translator, error: unknown): string {
  if (error instanceof FileProblem && error.problem) return `${t.t(error.problem.what)} ${error.problem.number || ""}: ${t.t(error.problem.reason)}`;
  return error instanceof Error ? t.t(error.message) : "";
}

// Lets the person choose a data file and opens the page that shows what restoring it would change.
export async function chooseDataFile(t: Translator): Promise<void> {
  const file = await pickFile();
  if (!file) return;
  try {
    const store = appStore();
    const state = store.getState();
    const language = state.status === "ready" ? state.data.settings.language : "en";
    const { data, meta } = readDataFile(file.text, language);
    chosenFile = { name: file.name, data, exportedAt: meta.exportedAt, build: meta.build };
    go("restore", { source: "file" });
  } catch (error) {
    showInfo(fileProblemText(t, error), t.t("The file could not be used. Nothing was changed."));
  }
}

export async function saveDataFile(t: Translator, how: "share" | "save"): Promise<void> {
  try {
    const text = appStore().exportDataFile();
    if (how === "share") await shareTextFile(dataFileName(), text);
    else if (await saveTextFile(dataFileName(), text)) toast(t.t("File saved"));
  } catch (error) {
    showError(t, error);
  }
}

function SideButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, flexDirection: "row", gap: 10, minHeight: 56, borderRadius: 30, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
      <Icon name={icon} size={22} color={p.ink} />
      <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
}

function DataFilePage() {
  const t = useT();
  return (
    <Page
      title="Data file"
      footer={
        <>
          <Button label="Restore from file" onPress={() => void chooseDataFile(t)} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SideButton icon="share" label="Share" onPress={() => void saveDataFile(t, "share")} />
            <SideButton icon="save" label="Save" onPress={() => void saveDataFile(t, "save")} />
          </View>
        </>
      }
    >
      <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
        <Text style={{ fontSize: 17, lineHeight: 26 }}>{t.t("Keep a copy of your data, or move it to another device. The file opens in Monivra only; to use your data in a spreadsheet, choose Export data.")}</Text>
      </View>
    </Page>
  );
}

// ---- Deletion -------------------------------------------------------------------------------------

const KINDS: Record<string, [(d: LedgerData, backups: number) => number, string, string]> = {
  accounts: [(d) => d.accounts.length, "{n} account", "{n} accounts"],
  categories: [(d) => d.categories.length, "{n} category", "{n} categories"],
  ops: [(d) => d.ops.length, "{n} operation", "{n} operations"],
  tags: [(d) => d.tags.length, "{n} tag", "{n} tags"],
  scheduled: [(d) => d.scheduled.length, "{n} scheduled payment", "{n} scheduled payments"],
  budgets: [(d) => d.budgets.length, "{n} budget", "{n} budgets"],
  backups: [(_d, backups) => backups, "{n} backup", "{n} backups"],
};
// "5 accounts, 14 categories and 44 operations": what of the chosen kinds exists, nothing for zero.
function countedList(t: Translator, data: LedgerData, backups: number, kinds: string[]): string {
  const parts = kinds
    .map((kind) => {
      const [count, one, other] = KINDS[kind]!;
      const n = count(data, backups);
      return n ? t.tc(one, other, n) : "";
    })
    .filter(Boolean);
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${t.t("and")} ${parts.at(-1)}`;
}

function DeleteDialog({ way, done }: { way: DeletionWay; done: () => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const data = useLedger();
  const rule = DELETIONS[way];
  const [backup, setBackup] = useState(Boolean(rule.backup));
  const [typed, setTyped] = useState("");
  const word = t.t("DELETE");
  const ready = !rule.typed || typed.trim().toLowerCase() === word.toLowerCase();
  const details = [countedList(t, data, appStore().backups().length, rule.kinds), ...rule.effects.map((line) => t.t(line))].filter(Boolean);
  const run = () => {
    if (!ready) return;
    close();
    try {
      appStore().deleteData(way, { backup });
      if (way === "everything") void removePin().catch(() => undefined);
      done();
      toast(t.t("Data deleted"));
    } catch (error) {
      showError(t, error);
    }
  };
  const button = (label: string, onPress: () => void, look: "danger" | "outline", disabled = false) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, borderRadius: 30, alignItems: "center", justifyContent: "center", marginTop: 12, opacity: disabled ? 0.4 : pressed ? 0.85 : 1, borderWidth: look === "outline" ? 1 : 0, borderColor: p.line, backgroundColor: look === "danger" ? mix(p.negative, p.dialog, 0.16) : "transparent" })}>
      <Text style={{ color: look === "danger" ? p.negativeInk : p.ink, fontSize: 15, fontWeight: "500" }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <View style={{ alignItems: "center" }}>
        <Icon name="warning" size={32} color={p.negative} />
      </View>
      <Text style={{ color: p.ink, fontSize: 22, textAlign: "center", marginVertical: 10 }}>{t.t(rule.title)}</Text>
      <Text style={{ color: p.ink, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{t.t(rule.message)}</Text>
      {rule.outside ? <Text style={{ color: p.muted, fontSize: 13, textAlign: "center", marginTop: 6 }}>{t.t("Files you saved outside the app are not touched.")}</Text> : null}
      {details.length ? (
        <Details title="Details">
          {details.map((line) => (
            <Text key={line} style={{ color: p.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: 4 }}>{line}</Text>
          ))}
        </Details>
      ) : null}
      {rule.backup ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: backup }} onPress={() => setBackup(!backup)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
          <Text style={{ color: p.ink, fontSize: 15, flex: 1 }}>{t.t("Create a backup first")}</Text>
          <Check on={backup} />
        </Pressable>
      ) : null}
      {rule.file ? button("Save a data file first", () => void saveDataFile(t, "share"), "outline") : null}
      {rule.typed ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: p.muted, fontSize: 13, marginBottom: 6 }}>{t.t("To go on, write {word}", { word })}</Text>
          <TextInput accessibilityLabel={t.t("Confirmation word")} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} style={{ borderWidth: 1, borderColor: p.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: p.ink }} />
        </View>
      ) : null}
      {button("Delete", run, "danger", !ready)}
      {button("Cancel", close, "outline")}
    </View>
  );
}

function DeletionPage() {
  const t = useT();
  const data = useLedger();
  const [backups, setBackups] = useState(() => appStore().backups().length);
  const ask = (way: DeletionWay) => {
    const rule = DELETIONS[way];
    const list = countedList(t, data, backups, rule.kinds);
    if (!list && !rule.settings) return toast(t.t("There is nothing to delete"));
    sheets.open(
      <DeleteDialog
        way={way}
        done={() => {
          setBackups(appStore().backups().length);
          if (way !== "backups") router.dismissAll();
        }}
      />,
      "dialog",
    );
  };
  return (
    <Page title="Deletion">
      <Footnote>Deleted data cannot be restored.</Footnote>
      {(Object.keys(DELETIONS) as DeletionWay[]).map((way) => {
        const rule = DELETIONS[way];
        return <SettingRow key={way} title={rule.title} icon="trash" chevron={false} caption={rule.note ?? (countedList(t, data, backups, rule.kinds) || "There is nothing to delete")} onPress={() => ask(way)} />;
      })}
    </Page>
  );
}

// ---- The route -----------------------------------------------------------------------------------

export function DataScreen() {
  const { page, source, id } = useLocalSearchParams<{ page?: string; source?: string; id?: string }>();
  if (page === "backups") return <SavedBackups />;
  if (page === "restore") return <RestorePage source={source ?? "file"} id={id} />;
  if (page === "file") return <DataFilePage />;
  if (page === "deletion") return <DeletionPage />;
  if (page === "import") return <ImportPage />;
  if (page === "export") return <ExportPage />;
  return <DataMenu />;
}

