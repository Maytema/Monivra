/* Info pages of the More tab */
import { render } from "../../app/shell.js";
import { APP_NAME, iconSvg } from "../../core/constants.js";
import { uiState } from "../../core/state.js";
import { aboutArt } from "../about-art.js";
import { translate, translateWith } from "../../i18n/index.js";
import { goBack } from "../../ui/navigation.js";
import { showInfo } from "../../ui/dialogs.js";
import { buttonHtml, iconButtonHtml, pageHeader } from "../../ui/primitives.js";
import {
  guidePage,
  instructionsPage,
  SUPPORT_TOPICS,
  supportPage,
  supportTopicPage,
} from "./support.js";

// A label for pages of features that do not exist yet; none of them claims an account, a purchase or sync.
const soon = () => `<span class="info-pill">${translate("Coming soon")}</span>`;

function profilePage() {
  const body = `<div class="profile">${soon()}<div class="profile-orbit" aria-label="Profile avatar"><svg viewBox="0 0 200 200" width="200" height="200" role="img"><circle cx="100" cy="100" r="80" fill="none" stroke="#72a6aa" stroke-width="1.4"/><circle cx="100" cy="100" r="71" fill="none" stroke="#72a6aa" stroke-width="1"/><circle class="orbit-ring" cx="100" cy="100" r="87" fill="none" stroke="#72a6aa" stroke-width="1" stroke-dasharray="75 18 40 22 14 30"/><g fill="none" stroke="#488c94" stroke-width="2.5" stroke-linecap="round"><circle cx="100" cy="92" r="10"/><path d="M86 118v-8c0-11 28-11 28 0v8"/></g><g class="orbit-particles" fill="#5c989f"><circle cx="23" cy="101" r="3"/><circle cx="176" cy="93" r="3"/><circle cx="100" cy="12" r="3"/><circle cx="150" cy="30" r="1.8"/><circle cx="44" cy="164" r="2"/></g><g class="orbit-particles slow" fill="#8bbcc1"><circle cx="100" cy="188" r="2.2"/><circle cx="31" cy="52" r="1.6"/><circle cx="182" cy="140" r="1.8"/></g></svg></div><div class="profile-details"><div class="profile-label">Sync status</div><div class="profile-value"><span class="profile-cloud">${iconSvg("cloud", 17)}</span><span>Local data · not synced</span></div><div class="profile-label">User ID</div><div class="profile-value">Not connected</div><div class="profile-label">Signed in via</div><div class="profile-value">Not signed in</div><div class="profile-label">Subscription status</div><div class="profile-value">Closed beta</div></div><div class="profile-actions">${buttonHtml("Sign out", () => showInfo("This offline beta is not connected to an account."), "profile-action")}${buttonHtml("Delete account", () => showInfo("No remote account exists. You can manage local data under More → Data."), "profile-action profile-danger")}</div></div>`;
  return { title: "Profile", body };
}

function subscriptionPage() {
  const footer = `<div class="sub-bottom">${buttonHtml("Continue", () => showInfo("Subscriptions are not available yet.", "Subscription"), "continue")}</div>`;
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
  const body = `<div class="subscription">${soon()}<div class="sub-head">${iconButtonHtml("back", "Back", goBack)}<h2 class="sub-title">${translate("Use the full potential of the application!")}</h2></div><div class="sub-plans">${plans
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
    )}</div><div class="sub-features">${features.map((x) => `<div class="feature">${iconSvg("check", 17)}<span>${x}</span></div>`).join("")}</div><div class="sub-actions">${["Solving the payment problem", "Check purchase status", "Restore purchases", "Subscription management"].map((x) => buttonHtml(x, () => showInfo("Store billing is not connected yet.", "Subscription"), "button-outline")).join("")}</div><p class="sub-disclosure">Prices are indicative and payments are not available yet. Plans and prices may change before launch.</p></div>`;
  return { title: "Subscription", body, footer };
}

function sharedAccessPage() {
  const body = `<div class="empty">${soon()}${iconSvg("user", 52)}<p>Shared access will be available after sign-in is added.</p></div>`;
  return { title: "Shared access", body };
}

function aboutPage() {
  const body = `<div class="about">${aboutArt}<div class="about-place">${iconSvg("pin", 22)}<span>${translate("Bishkek, Kyrgyzstan")}</span></div><p>${translateWith("The {app} team works every day to build a convenient and useful application for managing your finances.", { app: APP_NAME })}</p><p>${translate("We hope our work will help you manage your money better and reach your goals!")}</p></div>`;
  return { title: "About our team", body };
}

function privacyPolicyPage() {
  const body = `<div class="info-card"><span class="info-pill">Draft · Not for publication</span><h2>Privacy in the current offline preview</h2><h3>Financial records</h3><p>The offline preview stores accounts, categories and transactions in browser storage when it is available. These records are visible to anyone with access to the same browser profile and device.</p><h3>Export and deletion</h3><p>You can export a data file from More → Data and delete the current local records there. Files you have already exported must be deleted separately.</p><h3>Connected services</h3><p>Cloud sync, payments and account sign-in are not connected in this HTML preview. A future online version may process data differently.</p><p class="caution">This is a technical summary of the beta, not a finalized privacy policy. A public policy must be written and reviewed after the actual hosting, analytics, account and support systems are decided.</p></div>`;
  return { title: "Privacy policy", body };
}

function termsPage() {
  const body = `<div class="info-card"><span class="info-pill">Draft · Not for publication</span><h2>Closed beta information</h2><h3>Purpose</h3><p>${translateWith("{app} is currently an unfinished testing build. Features, appearance and stored-data formats may change during development.", { app: APP_NAME })}</p><h3>Financial information</h3><p>This tool is intended for personal expense tracking. It is not a banking service and does not execute real transfers.</p><h3>Data safety</h3><p>Keep your own backup before clearing browser data or moving to another device. Local storage may be unavailable in some file viewers.</p><h3>Purchases</h3><p>Subscription prices in the preview are visual examples. The Continue button does not make a purchase.</p><p class="caution">These notes are not a binding user agreement. Final terms require the actual operator identity, service model, jurisdiction and review before public launch.</p></div>`;
  return { title: "Terms of use", body };
}

function unavailablePage() {
  const body = "<p>Information is not available in this preview.</p>";
  return { title: "Information", body };
}

const PAGES = {
  profile: profilePage,
  subscription: subscriptionPage,
  shared: sharedAccessPage,
  instructions: instructionsPage,
  support: supportPage,
  about: aboutPage,
  privacyPolicy: privacyPolicyPage,
  terms: termsPage,
};

// The page of a kind; guides and support topics carry their id in the kind.
function buildPage(kind) {
  if (kind.startsWith("guide:")) return guidePage(kind.slice("guide:".length));
  if (kind in SUPPORT_TOPICS) return supportTopicPage(kind);
  return (PAGES[kind] ?? unavailablePage)();
}

// Info pages: profile, subscription, support, instructions, about, terms and similar.
export function infoPage(kind) {
  const { title, body, footer, pinned } = buildPage(kind);
  // A page with a pinned footer has no top bar: the back arrow and heading scroll with the content.
  return footer
    ? `<div class="sub-screen"><div class="sub-scroll">${body}</div>${footer}</div>`
    : pageHeader(title) +
        `<div class="content">${body}</div>${pinned ? `<div class="page-footer">${pinned}</div>` : ""}`;
}
