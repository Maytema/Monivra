/* Saved backups: the list with the button that makes one, and the page that brings one back */
import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { createBackup, restoreBackup } from "../../domain/backups.js";
import { currentLocale, translate, translateWith } from "../../i18n/index.js";
import { confirmAction, optionSheet } from "../../ui/dialogs.js";
import { goHome, openPage } from "../../ui/navigation.js";
import { buttonHtml, dropdownHtml, pageHeader, toast } from "../../ui/primitives.js";
import { postDuePayments } from "../due-payments.js";

// What the backups says, in one line: how many accounts, categories and operations it holds.
const contents = (data) =>
  translateWith("Accounts: {accounts} · Categories: {categories} · Operations: {ops}", {
    accounts: data.accounts.length,
    categories: data.categories.length,
    ops: data.ops.length,
  });
const madeAt = (backup) =>
  new Date(backup.at).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });

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
    `<div class="content"><p class="backups-note">${translate("Backups are made automatically once a day when Save locally is on, and you can make one yourself at any time.")}</p>${buttonHtml(
      "Create a backup",
      () => {
        createBackup();
        render();
        toast("Backup saved");
      },
      "primary",
    )}<p class="backups-hint">${translate("To restore, select one of the previous backups")}</p><h3 class="backups-heading">${translate("Previous backups")}</h3>${appData.backups
      .map(
        (backup) =>
          `${buttonHtml(
            `<strong>${translate("Local backup")}</strong><small>${escapeHtml(madeAt(backup))}</small><small>${escapeHtml(contents(backup.data))}</small>`,
            () => openPage("restoreBackup", { id: backup.id, scheduled: "count" }),
            "card backup-card",
          )}`,
      )
      .join("")}</div>`
  );
}

// Page of one backup: what is in it and how to bring it back.
export function restoreBackupView(p) {
  const backup = appData.backups.find((b) => b.id === p.id);
  const way = SCHEDULED_WAYS.find(([id]) => id === p.scheduled);
  const restore = (mode) =>
    confirmAction(
      mode === "replace"
        ? "Replace current data with this backup?"
        : "Merge this backup into the current data?",
      () => {
        restoreBackup(backup, { mode, scheduled: p.scheduled });
        goHome("more");
        postDuePayments();
        toast("Backup restored");
      },
      true,
      "Confirm",
    );
  return (
    pageHeader("Restore from backup") +
    `<div class="content info-text"><p>${translate("Backup made")}: <strong>${escapeHtml(madeAt(backup))}</strong><br><small>${escapeHtml(contents(backup.data))}</small></p><p>${translate("To keep the data created on this device, choose Merge data: it is added to the data of the backup.")}</p><p>${translate("To delete the data created on this device, choose Replace data: it is fully replaced by the data of the backup.")}</p><h3 class="backups-heading">${translate("Scheduled payments")}</h3>${dropdownHtml(
      way[1],
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
    )}</div><div class="page-footer">${buttonHtml("Merge data", () => restore("merge"), "primary")}${buttonHtml("Replace data", () => restore("replace"), "outline")}</div>`
  );
}
