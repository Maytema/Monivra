/* Saved backups: the list with the button that makes one, and the page of one copy or file with what
   it holds and what bringing it back would change. A data file is brought back on the same page. */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { createBackup, restoreData } from "../../domain/backups.js";
import { describeProblem } from "../../data/problems.js";
import { contentsOf, planRestore } from "../../domain/restore.js";
import { currentLocale, translate, translateCount, translateWith } from "../../i18n/index.js";
import { confirmAction, optionSheet } from "../../ui/dialogs.js";
import { goHome, openPage } from "../../ui/navigation.js";
import { buttonHtml, pageHeader, toast } from "../../ui/primitives.js";
import { postDuePayments } from "../due-payments.js";

// What the backups says, in one line: how many accounts, categories and operations it holds.
const contents = (data) =>
  translateWith("Accounts: {accounts} · Categories: {categories} · Operations: {ops}", {
    accounts: data.accounts.length,
    categories: data.categories.length,
    ops: data.ops.length,
  });
const when = (iso) =>
  new Date(iso).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
const madeAt = (backup) => when(backup.at);
// Why a backup was made, as its title.
const BACKUP_TITLES = {
  auto: "Automatic backup",
  safety: "Backup before a change",
};
const backupTitle = (backup) => translate(BACKUP_TITLES[backup.reason] || "Local backup");

// The ways to treat the scheduled payments of a backup: name and what it does.
const SCHEDULED_WAYS = [
  [
    "count",
    "Count and schedule",
    "Count all scheduled payments whose time has come since the backup was made and, if they repeat, schedule the next ones.",
  ],
  [
    "skip",
    "Skip and schedule",
    "Do not count the scheduled payments whose time has come since the backup was made and, if they repeat, schedule the next ones.",
  ],
  ["none", "Do not restore", "Do not restore the scheduled payments of the backup, if it has any."],
];

// Saved backups page: make a backup and choose one to bring back.
export function savedBackupsView() {
  return (
    pageHeader("Saved backups") +
    `<div class="backups-top"><p class="backups-note">${translate("Backups are made automatically once a day when Save locally is on, and you can make one yourself at any time.")}</p>${buttonHtml(
      "Create a backup",
      () => {
        createBackup();
        render();
        toast("Backup saved");
      },
      "primary compact",
    )}<p class="backups-hint">${translate("To see what is in a backup and restore it, select one of the previous backups")}</p></div><div class="content backups-list"><h3 class="backups-heading">${translate("Previous backups")}</h3>${appData.backups
      .map((backup) =>
        buttonHtml(
          `<strong>${escapeHtml(backupTitle(backup))}</strong><small>${escapeHtml(madeAt(backup))}</small><small>${escapeHtml(contents(backup.data))}</small>`,
          () =>
            openPage("restoreBackup", {
              source: { kind: "backup", id: backup.id },
              scheduled: "count",
            }),
          "card backup-card",
        ),
      )
      .join("")}</div>`
  );
}

// Brings a data file the person chose to the page where it is looked at and restored.
export const openFileRestore = (source) =>
  openPage("restoreBackup", { source: { kind: "file", ...source }, scheduled: "count" });

// The data of a page's source, with what to tell about where it comes from.
function sourceOf(p) {
  const { source } = p;
  if (source.kind === "backup") {
    const backup = appData.backups.find((b) => b.id === source.id);
    return {
      data: backup.data,
      title: "Restore from backup",
      rows: [
        ["Type", backupTitle(backup)],
        ["Created", madeAt(backup)],
        ["Data format version", String(backup.schema ?? backup.data.schema)],
        ["Application build", backup.build || translate("unknown")],
      ],
    };
  }
  return {
    data: source.data,
    title: "Restore from file",
    rows: [
      ["File", source.name],
      ["Created", source.meta?.exportedAt ? when(source.meta.exportedAt) : translate("unknown")],
      ["Data format version", String(source.data.schema)],
      ["Application build", source.meta?.build || translate("unknown")],
    ],
  };
}

// "3 regular · 1 credit card · 1 savings": the kinds of accounts that exist, none for zero.
const accountKinds = (c) =>
  [
    c.regular && translateCount("{n} regular", "{n} regular", c.regular),
    c.cards && translateCount("{n} credit card", "{n} credit cards", c.cards),
    c.savings && translateCount("{n} savings account", "{n} savings accounts", c.savings),
    c.debts && translateCount("{n} debt", "{n} debts", c.debts),
  ]
    .filter(Boolean)
    .join(" · ");

// The facts of a backup: what it says about itself, then what it holds.
function factsHtml(rows, data) {
  const c = contentsOf(data);
  const held = [
    ["Accounts", `${c.accounts}${c.accounts ? ` (${accountKinds(c)})` : ""}`],
    [
      "Categories",
      `${c.categories}${c.subcategories ? ` + ${translateCount("{n} subcategory", "{n} subcategories", c.subcategories)}` : ""}`,
    ],
    ["Operations", String(c.ops)],
    ["Scheduled payments", String(c.scheduled)],
    ["Budgets", String(c.budgets)],
    ["Tags", String(c.tags)],
    ["Currencies", c.currencies.join(", ") || "–"],
  ];
  const facts = (list) =>
    `<dl class="restore-facts">${list
      .map(([label, value]) => `<dt>${translate(label)}</dt><dd>${escapeHtml(value)}</dd>`)
      .join("")}</dl>`;
  // The two lines a person needs first; everything else is a tap away.
  const created = rows.find(([label]) => label === "Created");
  const headline = [
    created && `${translate("Created")}: ${created[1]}`,
    translateWith("{accounts} accounts, {categories} categories, {ops} operations", {
      accounts: c.accounts,
      categories: c.categories + c.subcategories,
      ops: c.ops,
    }),
  ]
    .filter(Boolean)
    .map((line) => `<p class="restore-headline">${escapeHtml(line)}</p>`)
    .join("");
  return `${headline}<details class="restore-conflicts"><summary>${translate("Details of this backup")}</summary>${facts([...rows, ...held])}</details>`;
}

const LIST_NAMES = {
  accounts: "Accounts",
  categories: "Categories",
  ops: "Operations",
  scheduled: "Scheduled payments",
  budgets: "Budgets",
  tags: "Tags",
};
// What a merge would do, one line per kind of record that is touched.
function mergeLines(summary) {
  const lines = Object.entries(summary.merge).flatMap(([list, r]) => {
    const parts = [
      r.added && translateWith("{n} new", { n: r.added }),
      r.changed &&
        translateWith(
          summary.conflicts === "keep"
            ? "{n} differ and stay as they are here"
            : "{n} replaced by the backup version (also where the current one is newer)",
          { n: r.changed },
        ),
      r.same && translateWith("{n} already here", { n: r.same }),
    ].filter(Boolean);
    return parts.length ? [`${translate(LIST_NAMES[list])}: ${parts.join(", ")}`] : [];
  });
  return lines.length ? lines : [translate("The backup holds no records.")];
}
// A short name of a record for the list of what a merge replaces.
function recordName(list, record) {
  if (list === "ops")
    return [record.date, (record.amount / 100).toLocaleString(), record.comment]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 70);
  return record.name || record.title || record.id;
}
// On demand: the records the backup would overwrite, by list, a few of each.
function conflictsHtml(summary) {
  const SHOWN = 15;
  const groups = Object.entries(summary.merge).filter(([, r]) => r.changed);
  if (!groups.length) return "";
  return `<details class="restore-conflicts"><summary>${translate("Show the records that differ")}</summary>${groups
    .map(
      ([list, r]) =>
        `<h4>${translate(LIST_NAMES[list])}</h4><ul class="restore-changes">${r.items
          .slice(0, SHOWN)
          .map(
            ({ now, backup }) =>
              `<li>${escapeHtml(recordName(list, now))}${recordName(list, now) === recordName(list, backup) ? "" : ` → ${escapeHtml(recordName(list, backup))}`}</li>`,
          )
          .join(
            "",
          )}${r.changed > SHOWN ? `<li>${escapeHtml(translateWith("and {n} more", { n: r.changed - SHOWN }))}</li>` : ""}</ul>`,
    )
    .join("")}</details>`;
}
// Warnings that a merge may bring in what looks like the same thing twice.
function mergeWarnings(summary) {
  return [
    summary.lookAlike &&
      translateWith(
        "{n} operations look like operations you already have (same day, amount, accounts, category and comment) but are recorded under another id. They are added too.",
        { n: summary.lookAlike },
      ),
    summary.sameAccountNames &&
      translateWith(
        "{n} accounts have the name and currency of accounts you already have. They are added as separate accounts.",
        { n: summary.sameAccountNames },
      ),
  ].filter(Boolean);
}
// What a replace would do: what the data holds now and what it will hold.
function replaceLines(summary) {
  const counts = (c) =>
    translateWith("{accounts} accounts, {categories} categories, {ops} operations", {
      accounts: c.accounts,
      categories: c.categories + c.subcategories,
      ops: c.ops,
    });
  return [
    `${translate("Now")}: ${counts(summary.current)}`,
    `${translate("After")}: ${counts(summary.incoming)}`,
    translate("Settings and exchange rates are taken from the backup."),
    summary.scheduledLetGo &&
      translateWith(
        "{n} current scheduled payments refer to accounts or categories the backup does not have and are let go.",
        { n: summary.scheduledLetGo },
      ),
  ].filter(Boolean);
}
const listHtml = (lines, cls = "") =>
  `<ul class="restore-changes ${cls}">${lines.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;

const CONFLICT_WAYS = [
  ["keep", "Keep the version on this device", "Records that are in both stay as they are here."],
  [
    "backup",
    "Use the backup's version",
    "Records that are in both are taken from the backup, also where they were changed here later.",
  ],
];
// Shown only when some record differs: which version stays. One tap opens the two choices.
function conflictChoiceHtml(p, summary) {
  if (!Object.values(summary.merge).some((r) => r.changed)) return "";
  const way = CONFLICT_WAYS.find(([id]) => id === p.conflicts);
  return `<p class="restore-note">${translate("A record that is in both the data here and the backup:")}</p>${buttonHtml(
    `<span class="grow">${translate(way[1])}</span>${iconSvg("down", 20)}`,
    () =>
      optionSheet(
        "Which version stays?",
        CONFLICT_WAYS,
        p.conflicts,
        (id) => {
          p.conflicts = id;
          render();
        },
        "dialog",
      ),
    "dropdown chosen",
  )}`;
}

// Page of one backup or data file: what is in it, what each way of restoring would change, and the
// buttons to merge or replace.
export function restoreBackupView(p) {
  const { data, title, rows } = sourceOf(p);
  // Where a record is in both the data here and the backup, the version here stays unless the person
  // asks for the backup's: a backup has no time of editing, so it cannot be told which is newer.
  p.conflicts ??= "keep";
  const options = { scheduled: p.scheduled, conflicts: p.conflicts };
  const merge = planRestore(appData, data, { mode: "merge", ...options });
  const replace = planRestore(appData, data, { mode: "replace", ...options });
  const way = SCHEDULED_WAYS.find(([id]) => id === p.scheduled);
  const restore = (mode) =>
    confirmAction(
      `${translate(
        mode === "replace"
          ? "Replace current data with this backup?"
          : "Merge this backup into the current data?",
      )} ${translate("A backup of the current data is made first.")}`,
      () => {
        restoreData(data, { mode, scheduled: p.scheduled, conflicts: p.conflicts, safety: true });
        goHome("more");
        postDuePayments();
        toast("Backup restored");
      },
      false,
      "Confirm",
    );
  const card = (heading, plan, lines, warnings = [], extra = "") =>
    `<section class="restore-way"><h3>${translate(heading)}</h3>${
      plan.problem
        ? `<p class="caution">${translate("This cannot be restored in this way:")} ${escapeHtml(describeProblem(plan.problem))}</p>`
        : listHtml(lines) +
          warnings.map((w) => `<p class="restore-warning">${escapeHtml(w)}</p>`).join("") +
          extra
    }</section>`;
  return (
    pageHeader(title) +
    `<div class="content info-text roomy">${factsHtml(rows, data)}<p class="restore-meaning">${translate("To keep the data created on this device, choose Merge data: it is added to the data of the backup.")}</p>${card("Merge data", merge, merge.problem ? [] : mergeLines(merge.summary), merge.problem ? [] : mergeWarnings(merge.summary), merge.problem ? "" : conflictChoiceHtml(p, merge.summary) + conflictsHtml(merge.summary))}<p class="restore-meaning">${translate("To delete the data created on this device, choose Replace data: it is fully replaced by the data of the backup.")}</p>${card("Replace data", replace, replace.problem ? [] : replaceLines(replace.summary))}<h3 class="backups-subject">${translate("Scheduled payments")}</h3>${buttonHtml(
      `${iconSvg("check", 22)}<span class="grow">${translate(way[1])}</span>${iconSvg("down", 20)}`,
      () =>
        optionSheet(
          "How to restore scheduled payments?",
          SCHEDULED_WAYS,
          p.scheduled,
          (id) => {
            p.scheduled = id;
            render();
          },
          "dialog",
        ),
      "dropdown chosen",
    )}<p class="restore-note">${translate(way[2])}</p></div><div class="page-footer">${buttonHtml("Merge data", () => restore("merge"), "primary", merge.problem ? "disabled" : "")}${buttonHtml("Replace data", () => restore("replace"), "outline", replace.problem ? "disabled" : "")}</div>`
  );
}
