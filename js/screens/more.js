/* More tab, settings and info pages */
import { runSelfChecks } from "../app/self-checks.js";
import { render } from "../app/shell.js";
import { APP_BUILD, TODAY, deepClone, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, pinEntry, setAppData, setLocked, setPinEntry, uiState } from "../core/state.js";
import { download, exportJSON } from "../data/import-export.js";
import { createSampleData } from "../data/sample.js";
import { save } from "../data/storage.js";
import { createBackup } from "../domain/finance.js";
import { translate, translateWith } from "../i18n/index.js";
import { GUIDES } from "./guides.js";
import { ratesBody } from "./rates.js";
import { settingOptions, switchSetting } from "./settings.js";
import {
  closeLayers,
  confirmAction,
  goBack,
  goHome,
  numberFieldHtml,
  openPage,
  openSheet,
  pageHeader,
  showInfo,
  timePicker,
} from "../ui/kit.js";
import {
  buttonHtml,
  iconButtonHtml,
  menuRowHtml,
  textFieldHtml,
  toast,
  toggleRowHtml,
} from "../ui/primitives.js";

// More tab: menu with settings, data and info pages.
export function moreView() {
  const groups = [
    [
      ["Subscription", "star", "subscription"],
      ["Profile", "user", "profile"],
    ],
    [
      ["Scheduled payments", "calendar", "scheduled"],
      ["Budgets", "budget", "budgets"],
    ],
    [
      ["Settings", "gear", "settings"],
      ["Data", "receipt", "data"],
    ],
    [
      ["Instructions", "play", "instructions"],
      ["Support", "help", "support"],
      ["About our team", "info", "about"],
      ["Privacy policy", "shield", "privacyPolicy"],
      ["Terms of use", "receipt", "terms"],
    ],
  ];
  return `<section class="more-menu"><header class="more-menu-brand"><span class="more-menu-logo">$</span><span>Monivra</span><span class="more-menu-pro">Pro</span></header><div class="more-menu-sync"><span class="more-menu-cloud">${iconSvg("cloud", 23)}</span><span>Local data · Closed Beta</span></div><div class="more-original-groups">${groups.map((g) => `<div class="more-menu-group">${g.map(([label, icon, kind]) => buttonHtml(`${iconSvg(icon, 24)}<span>${escapeHtml(label)}</span>`, () => openPage(kind), "more-menu-item")).join("")}</div>`).join("")}</div><div class="more-version">Monivra · 0.1.0 (${translate("Closed Beta")}) · ${translate("build")} ${APP_BUILD}</div><div class="test-link">${buttonHtml("Test data · accounts and categories", () => openPage("sampleData"), "test-button")}</div></section>`;
}

// Settings sub-pages: notifications, security, privacy, backups, rates.
export function settingsPage(kind) {
  let title = "",
    body = "";
  switch (kind) {
    case "notifications":
      title = "Notifications";
      body =
        switchSetting("Notifications", "notifications") +
        switchSetting("Periodic reminders", "periodic") +
        menuRowHtml("Time", null, () => timeDialog(), appData.settings.notificationTime) +
        settingOptions("Frequency", "notificationFrequency", [
          "Every day",
          "Weekdays",
          "Weekends",
        ]) +
        menuRowHtml("Test notification", "bell", () =>
          toast("DEMO reminder: enter today’s operations"),
        ) +
        '<p class="footnote">DEMO: no notifications run after this page is closed.</p>';
      break;
    case "security":
      title = "Security";
      body =
        toggleRowHtml("PIN code", !!appData.settings.pin, () => {
          if (appData.settings.pin) pinSetup(true);
          else pinSetup(false);
        }) +
        toggleRowHtml("Biometrics", appData.settings.biometrics, () => {
          appData.settings.biometrics = !appData.settings.biometrics;
          save();
          render();
          showInfo(
            "DEMO: this switch stores a preference. Browser biometrics are not connected. PIN remains available.",
          );
        }) +
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
        '<p class="footnote">DEMO PIN only hides the interface. Local data is not encrypted. PIN recovery: More → Demo and reset after exporting data, or clear this page’s browser storage.</p>';
      break;
    case "privacy":
      title = "Privacy";
      body =
        switchSetting(
          "Hide preview",
          "hidePreview",
          "Demonstrates a privacy cover while the page is hidden",
        ) +
        settingOptions("Hidden values", "hiddenValues", ["Hide all", "Balances only"]) +
        switchSetting("Hide balances", "hidden") +
        '<p class="footnote">DEMO: local files and backups remain readable. This is not a security boundary.</p>';
      break;
    case "backups":
      title = "Backups";
      body =
        switchSetting(
          "Automatic backups",
          "autoBackup",
          "One backup per day when this demo opens",
        ) +
        menuRowHtml("Create backup", "save", () => {
          createBackup();
          render();
          toast("Backup saved");
        }) +
        `<div class="section-label">${translate("Saved backups")}</div>` +
        appData.backups
          .map((b) =>
            menuRowHtml(escapeHtml(new Date(b.at).toLocaleString()), "archive", () =>
              openSheet(
                () =>
                  `<h2>${escapeHtml(new Date(b.at).toLocaleString())}</h2>${menuRowHtml(
                    "Restore",
                    "repeat",
                    () =>
                      confirmAction(
                        "Replace current demo data with this backup?",
                        () => {
                          const saved = deepClone(appData.backups);
                          setAppData(deepClone(b.data));
                          appData.backups = saved;
                          save();
                          goHome("more");
                        },
                        true,
                        "Confirm",
                      ),
                  )}${menuRowHtml("Export data", "download", () => download("monivra-backup.json", JSON.stringify(b.data, null, 2), "application/json"))}${menuRowHtml(
                    "Delete",
                    "trash",
                    () =>
                      confirmAction(
                        "Delete this saved backup?",
                        () => {
                          appData.backups = appData.backups.filter((x) => x.id !== b.id);
                          save();
                          closeLayers();
                          render();
                        },
                        false,
                        "Delete",
                      ),
                  )}`,
                "Backup",
              ),
            ),
          )
          .join("");
      break;
    case "rates":
      title = "Exchange rates";
      body = ratesBody();
      break;
  }
  return pageHeader(title) + `<div class="content flush">${body}</div>`;
}
// Time of the periodic reminder.
const timeDialog = () =>
  timePicker(appData.settings.notificationTime, (time) => {
    appData.settings.notificationTime = time;
    save();
  });
// PIN lengths that are accepted.
const PIN_LENGTHS = [4, 6];
// Set or remove the PIN: the digits are typed on the digit keypad.
export function pinSetup(remove) {
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
      }<p class="footnote">DEMO interface lock. This does not encrypt data.</p><div class="dialog-actions">${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml(
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
// True right after a wrong PIN, until the next key: the dots shake.
let pinFailed = false;
// The row of dots on the lock screen: empty rings that fill up as digits are typed.
const pinDotsHtml = (size, typed, failed) =>
  `<div class="pin-dots ${failed ? "failed" : ""}" role="img" aria-label="${translateWith("{typed} of {size} digits", { typed, size })}">${Array.from(
    { length: size },
    (_, i) => `<span class="${i < typed ? "filled" : ""}"></span>`,
  ).join("")}</div>`;
// True while the last dot is still filling in; keys are ignored until the PIN is checked.
let pinBusy = false;
// Runs `fn` once the animations of the last dot are over, at once when there are none.
const afterLastDot = (fn) => {
  const running = document.querySelector(".pin-dots span:last-child")?.getAnimations?.() ?? [];
  if (!running.length) return fn();
  Promise.allSettled(running.map((a) => a.finished)).then(fn);
};
// PIN lock screen: the last dot fills in first, then the PIN is checked and the app opens.
export function lockView() {
  const size = appData.settings.pin.length;
  const check = () => {
    pinBusy = false;
    if (pinEntry === appData.settings.pin) setLocked(false);
    else {
      pinFailed = true;
      toast("Incorrect PIN");
    }
    setPinEntry("");
    render();
  };
  const press = (k) => {
    if (pinBusy) return;
    pinFailed = false;
    if (k === "⌫") setPinEntry(pinEntry.slice(0, -1));
    else if (pinEntry.length < size) setPinEntry(pinEntry + k);
    render();
    if (pinEntry.length === size) {
      pinBusy = true;
      afterLastDot(check);
    }
  };
  const digit = (k) => buttonHtml(k, () => press(k), "key");
  // The fingerprint key stands left of the zero only while biometrics are switched on.
  const biometrics = appData.settings.biometrics
    ? buttonHtml(
        iconSvg("fingerprint", 34),
        () => toast("Browser biometrics are not connected in this preview"),
        "key plain",
        `aria-label="${translate("Biometrics")}"`,
      )
    : "<span></span>";
  const backspace = buttonHtml(
    iconSvg("backspace", 30),
    () => press("⌫"),
    "key plain",
    `aria-label="${translate("Backspace")}"`,
  );
  const keys = [..."123456789"].map(digit).join("") + biometrics + digit("0") + backspace;
  return `<div class="pin"><div>${iconSvg("lock", 42)}<h2>${translate("Enter your PIN")}</h2>${pinDotsHtml(size, pinEntry.length, pinFailed)}<div class="keypad">${keys}</div><p class="footnote">DEMO interface lock</p></div></div>`;
}
// Info pages: profile, subscription, support, instructions, about, terms and similar.
export function simplePage(kind) {
  let title = "",
    body = "",
    footer = "";
  if (kind === "profile") {
    title = "Profile";
    body = `<div class="profile"><div class="profile-orbit" aria-label="Profile avatar"><svg viewBox="0 0 200 200" width="200" height="200" role="img"><circle cx="100" cy="100" r="80" fill="none" stroke="#72a6aa" stroke-width="1.4"/><circle cx="100" cy="100" r="71" fill="none" stroke="#72a6aa" stroke-width="1"/><circle class="orbit-ring" cx="100" cy="100" r="87" fill="none" stroke="#72a6aa" stroke-width="1" stroke-dasharray="75 18 40 22 14 30"/><g fill="none" stroke="#488c94" stroke-width="2.5" stroke-linecap="round"><circle cx="100" cy="92" r="10"/><path d="M86 118v-8c0-11 28-11 28 0v8"/></g><g class="orbit-particles" fill="#5c989f"><circle cx="23" cy="101" r="3"/><circle cx="176" cy="93" r="3"/><circle cx="100" cy="12" r="3"/><circle cx="150" cy="30" r="1.8"/><circle cx="44" cy="164" r="2"/></g><g class="orbit-particles slow" fill="#8bbcc1"><circle cx="100" cy="188" r="2.2"/><circle cx="31" cy="52" r="1.6"/><circle cx="182" cy="140" r="1.8"/></g></svg></div><div class="profile-details"><div class="profile-label">Sync status</div><div class="profile-value"><span class="profile-cloud">${iconSvg("cloud", 17)}</span><span>Local data · not synced</span></div><div class="profile-label">User ID</div><div class="profile-value">Not connected</div><div class="profile-label">Signed in via</div><div class="profile-value">Not signed in</div><div class="profile-label">Subscription status</div><div class="profile-value">Closed beta</div></div><div class="profile-actions">${buttonHtml("Sign out", () => showInfo("This offline beta is not connected to an account."), "profile-action")}${buttonHtml("Delete account", () => showInfo("No remote account exists. You can manage local data under More → Data."), "profile-action profile-danger")}</div></div>`;
  } else if (kind === "subscription") {
    title = "Subscription";
    footer = `<div class="sub-bottom">${buttonHtml("Continue", () => showInfo("Closed beta preview: no purchase will be made."), "continue")}</div>`;
    const plan = uiState.morePlan || "Lifetime";
    const plans = [
      [
        "Lifetime",
        "Lifetime access",
        "$19.00",
        "One time payment",
        "All future features are included at no additional cost",
      ],
      ["Annually", "Annually", "$12.00", "(Approx. $0.23 per week)", "Beta offer"],
      ["Monthly", "Monthly", "$1.50", "(Approx. $0.35 per week)", ""],
    ];
    const features = [
      "Synchronization of devices in real time via a shared account",
      "Any number of accounts, debts and goals",
      "Any number of expense and income categories",
      "Any number of budgets",
      "Any number of scheduled and recurring payments",
      "Export and import of data",
      "Backup and restore data",
      "No ads",
    ];
    body = `<div class="subscription"><div class="sub-head">${iconButtonHtml("back", "Back", goBack)}<h2 class="sub-title">${translate("Use the full potential of the application!")}</h2></div><div class="sub-plans">${plans
      .map(([key, name, price, detail, tag]) =>
        buttonHtml(
          `<span class="plan-left"><strong>${key === "Lifetime" ? "Lifetime access" : name}</strong>${tag && key === "Annually" ? `<em>${tag}</em>` : ""}<small>${detail}</small>${key === "Lifetime" ? `<small>All future features are included at no additional cost</small>` : ""}</span><span class="plan-price">${price}</span>${plan === key ? `<span class="plan-check">${iconSvg("check", 13)}</span>` : ""}`,
          () => {
            uiState.morePlan = key;
            render();
          },
          "plan " + (plan === key ? "is-selected" : ""),
          `aria-pressed="${plan === key}"`,
        ),
      )
      .join(
        "",
      )}</div><div class="sub-features">${features.map((x) => `<div class="feature">${iconSvg("check", 17)}<span>${x}</span></div>`).join("")}</div><div class="review" aria-label="Review"><div class="stars">★★★★★</div><p>Your feedback will help shape Monivra before its public release.</p><small>— Closed Beta feedback</small></div><div class="review-dots" aria-label="Review 1 of 8">● ○ ○ ○ ○ ○ ○ ○</div><div class="sub-actions">${["Solving the payment problem", "Check purchase status", "Restore purchases", "Subscription management"].map((x) => buttonHtml(x, () => showInfo("Offline preview: store billing is not connected."), "button-outline")).join("")}</div><p class="sub-disclosure">Closed Beta preview: indicative pricing only. Payments are disabled. Plans and prices may change before launch.</p></div>`;
  } else if (kind === "refund") {
    title = "Request a refund";
    body = `<div class="support-form"><h2>Refund requests</h2><p>Purchases are disabled during the closed beta, so there are no Monivra payments to refund.</p><p>If payments are introduced in a future release, refund instructions will be shown here.</p>${buttonHtml("Back to Support", () => goBack(), "outline")}</div>`;
  } else if (kind === "shared") {
    title = "Shared access";
    body = `<div class="empty">${iconSvg("user", 52)}<p>Shared access</p></div>${buttonHtml("Invite", () => showInfo("DEMO: sharing requires a Monivra account and network service. No invitation is sent."), "primary")}`;
  } else if (kind === "instructions") {
    title = "Instructions";
    body = `<div class="help-intro">Learn the basics of Monivra</div>${menuRowHtml(
      "Repeat hints",
      "repeat",
      () => {
        appData.settings.dismissedHints = [];
        save();
        toast("Hints will be shown again");
      },
      "Restart tooltips throughout the application",
    )}${GUIDES.map((g) => menuRowHtml(g.title, g.icon, () => openPage("guide:" + g.id), g.about)).join("")}`;
  } else if (kind.startsWith("guide:")) {
    const guide = GUIDES.find((g) => g.id === kind.slice(6));
    title = guide.title;
    body = `<div class="guide">${guide.sections.map(([heading, text]) => `<h3>${translate(heading)}</h3><p>${translate(text)}</p>`).join("")}</div>`;
  } else if (kind === "support") {
    title = "Support";
    body = `${[
      ["Request a refund", "refund"],
      ["Report a bug", "bugReport"],
      ["Request a feature", "featureRequest"],
      ["Question on how to use", "usageQuestion"],
      ["Other", "otherSupport"],
    ]
      .map(([label, key]) => menuRowHtml(label, "help", () => openPage(key)))
      .join("")}`;
  } else if (["bugReport", "featureRequest", "usageQuestion", "otherSupport"].includes(kind)) {
    title = {
      bugReport: "Report a bug",
      featureRequest: "Request a feature",
      usageQuestion: "Question on how to use",
      otherSupport: "Other",
    }[kind];
    let message = "";
    body = `<div class="support-form"><p class="muted-text">${kind === "bugReport" ? "Describe what happened and how to reproduce it." : kind === "featureRequest" ? "Tell us what you would like to see in Monivra." : kind === "usageQuestion" ? "Describe the feature you need help with." : "Write your message or feedback."}</p>${textFieldHtml("Message", "", (v) => (message = v), "Describe your message")}${buttonHtml(
      "Continue",
      () => {
        if (!message.trim()) return toast("Enter a message first");
        showInfo(
          "Your draft is saved only on this screen. Sending messages is not available in this offline beta.",
          "Message preview",
        );
      },
      "primary",
    )}${kind === "usageQuestion" ? buttonHtml("View instructions", () => openPage("instructions"), "outline") : ""}<p class="muted-text">Closed beta · No message is sent to a server.</p></div>`;
  } else if (kind === "sampleData") {
    title = "Test data";
    const hasData = !!(appData.accounts.length || appData.categories.length || appData.ops.length);
    body = `<div class="info-card"><h2>Sample accounts and categories</h2><p>Install 5 example accounts, 14 categories and sample transactions for testing. All items will behave like ordinary records: you can edit or delete them.</p><p><strong>Current database:</strong> ${appData.accounts.length} accounts · ${appData.categories.length} categories · ${appData.ops.length} operations.</p>${
      hasData
        ? `<p class="caution">Your database already contains records. To protect them, sample data cannot be installed over existing data.</p>${buttonHtml(
            "Replace with sample data",
            () =>
              confirmAction(
                "Replace current local records with editable sample data? You can cancel without downloading anything.",
                () => {
                  setAppData(createSampleData());
                  save();
                  goHome("accounts");
                  toast("Sample data installed");
                },
                false,
                "Replace data",
              ),
            "danger-outline",
          )}`
        : `<p>This action runs once on an empty database. Deleted sample records will not reappear.</p>${buttonHtml(
            "Install sample data",
            () =>
              confirmAction(
                "Create sample accounts, categories and operations?",
                () => {
                  if (appData.accounts.length || appData.categories.length || appData.ops.length)
                    return toast("Database is not empty");
                  const initial = createSampleData();
                  appData.accounts = initial.accounts;
                  appData.categories = initial.categories;
                  appData.ops = initial.ops;
                  appData.tags = initial.tags;
                  save();
                  goHome("accounts");
                  toast("Sample data installed");
                },
                false,
                "Install",
              ),
            "primary",
          )}`
    }</div>`;
  } else if (kind === "demo") {
    title = "Demo and reset";
    body = `<div class="demo-note"><strong>Monivra · Offline reconstruction</strong><p>Reference date: 12 October 2026. The five main sections were rebuilt from sampled source frames. Exact fonts, animations and several external flows remain UNKNOWN.</p><p>Open this HTML in a browser. Changes are stored on this device when browser storage is available. Export a Data file before moving or replacing it.</p></div>${menuRowHtml("Export data file", "download", exportJSON)}${menuRowHtml(
      "Reset demo data",
      "repeat",
      () =>
        confirmAction(
          "Replace all current local data with the initial demo?",
          () => {
            setAppData({ ...createSampleData(), backups: appData.backups });
            uiState.filters = {
              accounts: null,
              categories: null,
              types: null,
              tags: null,
              comment: "",
            };
            uiState.period = { mode: "month", anchor: TODAY };
            save();
            goHome("accounts");
          },
          true,
          "Confirm",
        ),
    )}${menuRowHtml("Run self-checks", "check", () => {
      const out = runSelfChecks();
      showInfo(
        out.map((x) => (x.pass ? "PASS" : "FAIL") + " · " + x.name).join("\n"),
        "Self-checks",
      );
    })}<p class="footnote">Android file handling, camera, downloads and localStorage depend on the browser. PIN is not encryption. This is not financial advice or a connection to your actual accounts.</p>`;
  } else if (kind === "about") {
    title = "About our team";
    body = `<div class="info-card"><h2>Monivra</h2><span class="info-pill">Closed Beta · 0.1.0</span><p>Monivra is an independent personal-finance application in development. This preview is shared to gather feedback before release.</p><h3>Project status</h3><p>Accounts, categories, operations, statistics and settings are being tested. Some features are demonstrations and may change before launch.</p><h3>People behind the project</h3><p>Team member names, contact addresses and company details have not yet been supplied for public release.</p><p class="caution">This is a draft project information page, not a claim of affiliation with another application.</p></div>`;
  } else if (kind === "privacyPolicy") {
    title = "Privacy policy";
    body = `<div class="info-card"><span class="info-pill">Draft · Not for publication</span><h2>Privacy in the current offline preview</h2><h3>Financial records</h3><p>The offline preview stores accounts, categories and transactions in browser storage when it is available. These records are visible to anyone with access to the same browser profile and device.</p><h3>Export and deletion</h3><p>You can export a data file from More → Data and delete the current local records there. Files you have already exported must be deleted separately.</p><h3>Connected services</h3><p>Cloud sync, payments and account sign-in are not connected in this HTML preview. A future online version may process data differently.</p><p class="caution">This is a technical summary of the beta, not a finalized privacy policy. A public policy must be written and reviewed after the actual hosting, analytics, account and support systems are decided.</p></div>`;
  } else if (kind === "terms") {
    title = "Terms of use";
    body = `<div class="info-card"><span class="info-pill">Draft · Not for publication</span><h2>Closed beta information</h2><h3>Purpose</h3><p>Monivra is currently an unfinished testing build. Features, appearance and stored-data formats may change during development.</p><h3>Financial information</h3><p>This tool is intended for personal expense tracking. It is not a banking service and does not execute real transfers.</p><h3>Data safety</h3><p>Keep your own backup before clearing browser data or moving to another device. Local storage may be unavailable in some file viewers.</p><h3>Purchases</h3><p>Subscription prices in the preview are visual examples. The Continue button does not make a purchase.</p><p class="caution">These notes are not a binding user agreement. Final terms require the actual operator identity, service model, jurisdiction and review before public launch.</p></div>`;
  } else {
    title = "Information";
    body = "<p>Information is not available in this preview.</p>";
  }
  // A page with a pinned footer has no top bar: the back arrow and heading scroll with the content.
  return footer
    ? `<div class="sub-screen"><div class="sub-scroll">${body}</div>${footer}</div>`
    : pageHeader(title) + `<div class="content">${body}</div>`;
}
