/* Settings sub-pages of the More tab */
import { render } from "../../app/shell.js";
import { appData, setLocked, setPinEntry } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { deleteAllBackups } from "../../domain/backups.js";
import { timeLabel, timePicker } from "../../ui/time-picker.js";
import { ratesBody } from "../rates.js";
import { settingOptions, switchSetting } from "../settings.js";
import { closeLayers, openPage, openSheet } from "../../ui/navigation.js";
import { confirmAction } from "../../ui/dialogs.js";
import { numberFieldHtml } from "../../ui/number-picker.js";
import { buttonHtml, menuRowHtml, pageHeader, toast, toggleRowHtml } from "../../ui/primitives.js";

// Time of the periodic reminder.
const timeDialog = () =>
  timePicker(appData.settings.notificationTime, (time) => {
    appData.settings.notificationTime = time;
    save();
  });
// PIN lengths that are accepted.
const PIN_LENGTHS = [4, 6];
// Set or remove the PIN: the digits are typed on the digit keypad.
function pinSetup(remove) {
  let first = "",
    second = "";
  openSheet(
    () => {
      const size = remove ? appData.settings.pin.length : Math.max(...PIN_LENGTHS);
      const hint = "Enter 4 or 6 digits";
      return `<h2>${remove ? "Turn off PIN" : "Set PIN"}</h2>${numberFieldHtml(
        remove ? "Current PIN" : "New PIN",
        first,
        (v) => (first = v),
        { mask: true, maxLength: size, hint: remove ? "" : hint },
      )}${
        remove
          ? ""
          : numberFieldHtml("Confirm PIN", second, (v) => (second = v), {
              mask: true,
              maxLength: size,
              hint,
            })
      }<p class="footnote">The PIN only hides the screen; data on the device is not encrypted.</p><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
        "Save",
        () => {
          if (remove) {
            if (first !== appData.settings.pin) return toast("Incorrect PIN");
            appData.settings.pin = false;
          } else {
            if (!PIN_LENGTHS.includes(first.length)) return toast("Enter 4 or 6 digits");
            if (first !== second) return toast("PINs do not match");
            appData.settings.pin = first;
          }
          save();
          closeLayers();
        },
        "primary",
      )}</div>`;
    },
    "PIN",
    "dialog",
  );
}
function notificationsSettings() {
  const body =
    switchSetting("Notifications", "notifications") +
    switchSetting("Periodic reminders", "periodic") +
    menuRowHtml("Time", null, () => timeDialog(), timeLabel(appData.settings.notificationTime)) +
    settingOptions("Frequency", "notificationFrequency", ["Every day", "Weekdays", "Weekends"]) +
    menuRowHtml("Test notification", "bell", () => toast("Enter today’s operations")) +
    '<p class="footnote">Reminders are shown only while the app is open.</p>';
  return { title: "Notifications", body };
}

function securitySettings() {
  const body =
    toggleRowHtml("PIN code", Boolean(appData.settings.pin), () =>
      pinSetup(Boolean(appData.settings.pin)),
    ) +
    switchSetting("Lock after leaving", "relock") +
    settingOptions("Lock delay", "lockDelay", [
      [0, "Immediately"],
      [30, "30 seconds"],
      [60, "1 minute"],
      [300, "5 minutes"],
    ]) +
    menuRowHtml("Lock now", "lock", () => {
      if (!appData.settings.pin) return toast("Set a PIN first");
      setLocked(true);
      setPinEntry("");
      render();
    }) +
    '<p class="footnote">The PIN only hides the screen; data on the device is not encrypted.</p>';
  return { title: "Security", body };
}

function privacySettings() {
  const body =
    switchSetting(
      "Hide preview",
      "hidePreview",
      "Cover the screen while the app is in the background",
    ) +
    settingOptions("Hidden values", "hiddenValues", ["Hide all", "Balances only"]) +
    switchSetting("Hide balances", "hidden");
  return { title: "Privacy", body };
}

function backupsSettings() {
  const body =
    menuRowHtml(
      "Saved backups",
      null,
      () => openPage("savedBackups"),
      "Create and restore data from automatic local copies",
    ) +
    switchSetting(
      "Save locally",
      "autoBackup",
      "Copy the data locally once a day. This increases the size of the data on the device. Only the latest copies are stored.",
    ) +
    menuRowHtml(
      "Delete all local data copies",
      null,
      () =>
        confirmAction(
          "Delete all saved backups? They cannot be restored.",
          () => {
            deleteAllBackups();
            render();
            toast("Backups deleted");
          },
          false,
          "Delete",
        ),
      "Delete all local backups from storage. Deleted data cannot be restored.",
      "",
    );
  return { title: "Backups", body };
}

function ratesSettings() {
  return { title: "Exchange rates", body: ratesBody() };
}

const SETTINGS_PAGES = {
  notifications: notificationsSettings,
  security: securitySettings,
  privacy: privacySettings,
  backups: backupsSettings,
  rates: ratesSettings,
};

// Settings sub-pages: notifications, security, privacy, backups, rates.
export function settingsPage(kind) {
  const { title, body } = SETTINGS_PAGES[kind]();
  return pageHeader(title) + `<div class="content flush">${body}</div>`;
}
