/* More tab, settings and info pages */
import { runSelfChecks } from "../app/self-checks.js";
import { render } from "../app/shell.js";
import { APP_BUILD, CURRENCIES, TODAY, deepClone, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, pinEntry, setAppData, setLocked, setPinEntry, uiState } from "../core/state.js";
import { download, exportJSON } from "../data/import-export.js";
import { createSampleData } from "../data/sample.js";
import { save } from "../data/storage.js";
import { createBackup } from "../domain/finance.js";
import { translate } from "../i18n/index.js";
import { setting, settingOptions, switchSetting } from "./settings.js";
import {
  closeLayers,
  confirmAction,
  goBack,
  goHome,
  openPage,
  openSheet,
  pageHeader,
  promptText,
  showInfo,
} from "../ui/kit.js";
import { buttonHtml, menuRowHtml, textFieldHtml, toast, toggleRowHtml } from "../ui/primitives.js";

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
      ["Video instructions", "play", "videos"],
      ["Support", "help", "support"],
      ["About our team", "info", "about"],
      ["Privacy policy", "shield", "privacyPolicy"],
      ["Terms of use", "receipt", "terms"],
    ],
  ];
  return `<section class="more-menu"><header class="more-menu-brand"><span class="more-menu-logo">$</span><span>Monivra</span><span class="more-menu-pro">Pro</span></header><div class="more-menu-sync"><span class="more-menu-cloud">${iconSvg("cloud", 23)}</span><span>Local data · Closed Beta</span></div><div class="more-original-groups">${groups.map((g) => `<div class="more-menu-group">${g.map(([label, icon, kind]) => buttonHtml(`${iconSvg(icon, 24)}<span>${escapeHtml(label)}</span>`, () => openPage(kind), "more-menu-item")).join("")}</div>`).join("")}</div><div class="more-version">Monivra · 0.1.0 (Closed Beta) · build ${APP_BUILD}</div><div class="test-link">${buttonHtml("Test data · accounts and categories", () => openPage("sampleData"), "test-button")}</div></section>`;
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
        textFieldHtml(
          "Time",
          appData.settings.notificationTime,
          (v) => {
            appData.settings.notificationTime = v;
            save();
          },
          "",
          "time",
        ) +
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
      body =
        `<p class="demo-note">DEMO · Fixed example rates, editable locally. No market data.</p>` +
        toggleRowHtml("Automatic rates", appData.settings.autoRates, () => {
          setting("autoRates", !appData.settings.autoRates);
          showInfo(
            "DEMO: automatic exchange-rate updates need a network service. Values below stay unchanged.",
          );
        }) +
        CURRENCIES.map(([id, name]) =>
          menuRowHtml(
            `${id} → KGS`,
            "globe",
            () =>
              promptText(
                "Exchange rate",
                String(appData.rates[id]),
                (v) => {
                  let n = Number(v);
                  if (!Number.isFinite(n) || n <= 0) return toast("Use a positive number");
                  if (id === "KGS" && n !== 1) return toast("KGS is the base currency (1)");
                  appData.rates[id] = n;
                  save();
                  render();
                },
                "1 " + id + " in KGS",
              ),
            name,
            String(appData.rates[id]),
          ),
        ).join("");
      break;
  }
  return kind === "subscription"
    ? `<div class="sub-screen">${pageHeader(title)}<div class="sub-scroll">${body}</div></div>`
    : pageHeader(title) + `<div class="content"><div class="fields">${body}</div></div>`;
}
// Set or remove the PIN.
export function pinSetup(remove) {
  let first = "",
    second = "";
  openSheet(
    () =>
      `<h2>${remove ? "Turn off PIN" : "Set PIN"}</h2>${textFieldHtml(remove ? "Current PIN" : "New PIN", first, (v) => (first = v), "4–8 digits", "password")}${!remove ? textFieldHtml("Confirm PIN", second, (v) => (second = v), "", "password") : ""}<p class="footnote">DEMO interface lock. This does not encrypt data.</p>${buttonHtml(
        "Save",
        () => {
          if (remove) {
            if (first !== appData.settings.pin) return toast("Incorrect PIN");
            appData.settings.pin = false;
          } else {
            if (!/^\d{4,8}$/.test(first)) return toast("Use 4–8 digits");
            if (first !== second) return toast("PINs do not match");
            appData.settings.pin = first;
          }
          save();
          closeLayers();
        },
        "primary",
      )}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    "PIN",
    "dialog",
  );
}
// PIN lock screen.
export function lockView() {
  return `<div class="pin"><div>${iconSvg("lock", 42)}<h2>${translate("Enter your PIN")}</h2><div class="pin-dots">${"●".repeat(pinEntry.length) || "○ ○ ○ ○"}</div><div class="keypad">${[
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "⌫",
    "0",
    "✓",
  ]
    .map((k) =>
      buttonHtml(
        k,
        () => {
          if (k === "⌫") setPinEntry(pinEntry.slice(0, -1));
          else if (k === "✓") {
            if (pinEntry === appData.settings.pin) {
              setLocked(false);
              setPinEntry("");
            } else {
              setPinEntry("");
              toast("Incorrect PIN");
            }
          } else if (pinEntry.length < 8) setPinEntry(pinEntry + k);
          render();
        },
        "key",
      ),
    )
    .join("")}</div><p class="footnote">DEMO interface lock</p></div></div>`;
}
// Info pages: profile, subscription, support, videos, about, terms and similar.
export function simplePage(kind) {
  let title = "",
    body = "";
  if (kind === "profile") {
    title = "Profile";
    body = `<div class="profile"><div class="profile-orbit" aria-label="Profile avatar"><svg viewBox="0 0 200 200" width="200" height="200" role="img"><circle cx="100" cy="100" r="80" fill="none" stroke="#72a6aa" stroke-width="1.4"/><circle cx="100" cy="100" r="71" fill="none" stroke="#72a6aa" stroke-width="1"/><circle cx="100" cy="100" r="87" fill="none" stroke="#72a6aa" stroke-width="1" stroke-dasharray="75 18 40 22 14 30"/><g fill="none" stroke="#488c94" stroke-width="2.5" stroke-linecap="round"><circle cx="100" cy="92" r="10"/><path d="M86 118v-8c0-11 28-11 28 0v8"/></g><g fill="#5c989f"><circle cx="23" cy="101" r="3"/><circle cx="176" cy="93" r="3"/><circle cx="100" cy="12" r="3"/></g></svg></div><div class="profile-details"><div class="profile-label">Sync status</div><div class="profile-value"><span class="profile-cloud">${iconSvg("cloud", 17)}</span><span>Local data · not synced</span></div><div class="profile-label">User ID</div><div class="profile-value">Not connected</div><div class="profile-label">Signed in via</div><div class="profile-value">Not signed in</div><div class="profile-label">Subscription status</div><div class="profile-value">Closed beta</div></div><div class="profile-actions">${buttonHtml("Sign out", () => showInfo("This offline beta is not connected to an account."), "profile-action")}${buttonHtml("Delete account", () => showInfo("No remote account exists. You can manage local data under More → Data."), "profile-action profile-danger")}</div></div>`;
  } else if (kind === "subscription") {
    title = "Use the full potential of the application!";
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
    body = `<div class="subscription"><div class="sub-plans">${plans
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
      )}</div><div class="sub-features">${features.map((x) => `<div class="feature">${iconSvg("check", 17)}<span>${x}</span></div>`).join("")}</div><div class="review" aria-label="Review"><div class="stars">★★★★★</div><p>Your feedback will help shape Monivra before its public release.</p><small>— Closed Beta feedback</small></div><div class="review-dots" aria-label="Review 1 of 8">● ○ ○ ○ ○ ○ ○ ○</div><div class="sub-actions">${["Solving the payment problem", "Check purchase status", "Restore purchases", "Subscription management"].map((x) => buttonHtml(x, () => showInfo("Offline preview: store billing is not connected."), "button-outline")).join("")}</div><p class="sub-disclosure">Closed Beta preview: indicative pricing only. Payments are disabled. Plans and prices may change before launch.</p></div><div class="sub-bottom">${buttonHtml("Continue", () => showInfo("Closed beta preview: no purchase will be made."), "continue")}</div>`;
  } else if (kind === "refund") {
    title = "Request a refund";
    body = `<div class="support-form"><h2>Refund requests</h2><p>Purchases are disabled during the closed beta, so there are no Monivra payments to refund.</p><p>If payments are introduced in a future release, refund instructions will be shown here.</p>${buttonHtml("Back to Support", () => goBack(), "outline")}</div>`;
  } else if (kind === "shared") {
    title = "Shared access";
    body = `<div class="empty">${iconSvg("user", 52)}<p>Shared access</p></div>${buttonHtml("Invite", () => showInfo("DEMO: sharing requires a Monivra account and network service. No invitation is sent."), "primary")}`;
  } else if (kind === "videos") {
    title = "Video instructions";
    body = `<div class="help-intro">Learn the basics of Monivra</div>${[
      ["Repeat hints", "repeat", "Guided explanations of controls"],
      ["Operations", "receipt", "Income, expenses and transfers"],
      ["Accounts and categories", "wallet", "Organize money and spending"],
      ["Statistics", "stats", "Understand charts and filters"],
      ["Additional questions", "help", "Frequently asked questions"],
    ]
      .map(([name, icon, subtitle]) =>
        menuRowHtml(name, icon, () => openPage("guide_" + name), subtitle),
      )
      .join("")}`;
  } else if (kind.startsWith("guide_")) {
    title = kind.slice(6);
    const steps =
      {
        "Repeat hints": [
          "Hints highlight interface controls one by one.",
          "Open a section to explore its controls.",
          "This beta does not include the original guided overlay animations.",
        ],
        Operations: [
          "Open Operations from the bottom navigation.",
          "Tap Add and choose income, expense or transfer.",
          "Choose an account, amount, category and date, then save.",
        ],
        "Accounts and categories": [
          "Open Accounts to add or edit a wallet or savings account.",
          "Open Categories to create income and expense categories.",
          "Choose a category when adding an operation.",
        ],
        Statistics: [
          "Open Statistics and select a period.",
          "Switch between charts and category breakdowns.",
          "Use filters to compare accounts and categories.",
        ],
        "Additional questions": [
          "Your data is stored in this browser unless you export it.",
          "Back up your data using More → Data.",
          "Payments, cloud sync and support messaging are not active in this beta.",
        ],
      }[title] || [];
    body = `<div class="guide"><div class="guide-icon">${iconSvg("play", 38)}</div><h2>${escapeHtml(title)}</h2>${steps.map((v, i) => `<div class="guide-step"><span>${i + 1}</span><p>${escapeHtml(v)}</p></div>`).join("")}<p class="guide-note">Interactive beta guide · No external video required</p></div>`;
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
    )}${kind === "usageQuestion" ? buttonHtml("View instructions", () => openPage("videos"), "outline") : ""}<p class="muted-text">Closed beta · No message is sent to a server.</p></div>`;
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
  return pageHeader(title) + `<div class="content">${body}</div>`;
}
