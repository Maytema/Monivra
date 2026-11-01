/* More tab menu */
import { APP_BUILD, APP_NAME, escapeHtml, iconSvg } from "../../core/constants.js";
import { hintHtml } from "../../ui/hint.js";
import { translate } from "../../i18n/index.js";
import { openPage } from "../../ui/navigation.js";
import { buttonHtml } from "../../ui/primitives.js";

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
  return `<section class="more-menu"><header class="more-menu-brand"><span class="more-menu-logo">$</span><span>${APP_NAME}</span><span class="more-menu-pro">Pro</span></header><div class="more-menu-sync"><span class="more-menu-cloud">${iconSvg("cloud", 23)}</span><span>Local data · Closed Beta</span></div><div class="more-original-groups">${groups.map((g, i) => `<div class="more-menu-group">${g.map(([label, icon, kind]) => buttonHtml(`${iconSvg(icon, 24)}<span>${escapeHtml(label)}</span>`, () => openPage(kind), "more-menu-item")).join("")}</div>${i === 0 ? hintHtml("shared-access", "Shared access", () => openPage("shared")) : ""}`).join("")}</div><div class="more-version">${APP_NAME} · 0.1.0 (${translate("Closed Beta")}) · ${translate("build")} ${APP_BUILD}</div><div class="test-link">${buttonHtml("Test data · accounts and categories", () => openPage("sampleData"), "test-button")}</div></section>`;
}
