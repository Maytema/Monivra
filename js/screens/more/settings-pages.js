/* Settings sub-pages of the More tab */
import { render } from "../../app/shell.js";
import { appData, setLocked, setPinEntry } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { deleteAllBackups } from "../../domain/backups.js";
import { timeLabel, timePicker } from "../../ui/time-picker.js";
import { ratesBody } from "../rates.js";
import { settingOptions, switchSetting } from "../settings.js";
import { closeLayers, openPage, openSheet } from "../../ui/navigation.js";
import { reminderText } from "../../app/reminders.js";
import {
  askNotificationPermission,
  notificationStatus,
  showSystemNotification,
} from "../../platform/notify.js";
import { makePin, pinLength, pinMatches } from "../../platform/pin.js";
import { isNative } from "../../platform/native.js";
import { biometricState, verifyBiometric } from "../../platform/biometric.js";
import { translate } from "../../i18n/index.js";
import { biometricTexts } from "./lock.js";
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
      const size = remove ? pinLength(appData.settings.pin) : Math.max(...PIN_LENGTHS);
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
            if (!pinMatches(appData.settings.pin, first)) return toast("Incorrect PIN");
            appData.settings.pin = false;
            appData.settings.biometric = false;
          } else {
            if (!PIN_LENGTHS.includes(first.length)) return toast("Enter 4 or 6 digits");
            if (first !== second) return toast("PINs do not match");
            appData.settings.pin = makePin(first);
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
// What the browser says about notifications, in words for the person.
const NOTIFICATION_STATES = isNative
  ? {
      granted:
        "Allowed: reminders of scheduled payments come as notifications of the device, also when the app is closed.",
      default: "Not asked yet: allow notifications when you switch them on.",
      denied:
        "Blocked in the Android settings: reminders are shown inside the app. Allow notifications for Monivra in the Android settings to get them as notifications.",
      unsupported: "This device cannot show notifications: reminders are shown inside the app.",
    }
  : {
      granted: "Allowed: reminders come as notifications of the device while the app is open.",
      default: "Not asked yet: allow notifications when you switch them on.",
      denied:
        "Blocked in the browser settings: reminders are shown inside the app. Allow them in the browser settings for this site to get notifications.",
      unsupported: "This browser cannot show notifications: reminders are shown inside the app.",
    };
function notificationsSettings() {
  const status = notificationStatus();
  const body =
    toggleRowHtml("Notifications", appData.settings.notifications, async () => {
      const turnOn = !appData.settings.notifications;
      appData.settings.notifications = turnOn;
      save();
      render();
      if (turnOn && notificationStatus() === "default") {
        await askNotificationPermission();
        render();
      }
    }) +
    `<p class="footnote">${translate(NOTIFICATION_STATES[status])}</p>` +
    switchSetting("Periodic reminders", "periodic") +
    menuRowHtml("Time", null, () => timeDialog(), timeLabel(appData.settings.notificationTime)) +
    settingOptions("Frequency", "notificationFrequency", ["Every day", "Weekdays", "Weekends"]) +
    menuRowHtml("Test notification", "bell", async () => {
      const [title, text] = reminderText({ kind: "periodic" });
      const system = await showSystemNotification(title, text, "test");
      toast(system ? "Notification sent" : `${title}: ${text}`);
    }) +
    `<p class="footnote">${translate(
      isNative
        ? "Android may deliver a reminder a few minutes late to save battery. A payment itself is added to your operations when you open Monivra, with the date and time it was set for."
        : "Reminders appear only while the app is open or in the background of the browser. A closed app cannot remind you: that needs the mobile app.",
    )}</p>`;
  return { title: "Notifications", body };
}

// The switch for biometric unlock; there is none on a device that cannot do it. The PIN stays the
// way in whenever the fingerprint or face is not used or does not work.
function biometricRow() {
  const state = biometricState();
  if (state === "unsupported") return "";
  return toggleRowHtml(
    "Unlock with fingerprint or face",
    Boolean(appData.settings.biometric),
    async () => {
      if (appData.settings.biometric) {
        appData.settings.biometric = false;
        save();
        return render();
      }
      if (!appData.settings.pin) return toast("Set a PIN first");
      if (biometricState() !== "available")
        return toast("Set up a fingerprint or face in your phone settings first");
      // Switching it on needs one successful check, so a person who cannot use it is not left with
      // a lock screen that waits for it.
      const result = await verifyBiometric(biometricTexts());
      if (result !== "ok") return;
      appData.settings.biometric = true;
      save();
      render();
    },
    state === "available" ? "" : "Not set up on this phone",
  );
}

function securitySettings() {
  const body =
    toggleRowHtml("PIN code", Boolean(appData.settings.pin), () =>
      pinSetup(Boolean(appData.settings.pin)),
    ) +
    biometricRow() +
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
    `<p class="footnote">${translate("The PIN only hides the screen; data on the device is not encrypted.")}</p>` +
    (biometricState() === "unsupported"
      ? ""
      : `<p class="footnote">${translate("The fingerprint or face check is made by Android; Monivra never sees or keeps it. It opens the lock screen like the PIN does and does not encrypt your data.")}</p>`);
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
