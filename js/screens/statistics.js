/* Statistics screens and charts */
import { render } from "../app/shell.js";
import { TODAY, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  accountById,
  categoryById,
  convertCurrency,
  formatMoney,
  moneySpanHtml,
  parseDate,
  periodBounds,
  reportRows,
  totalByType,
} from "../domain/finance.js";
import { hero } from "./accounts.js";
import { sumTabs } from "./categories.js";
import { filterActive, filters } from "./operations.js";
import { closeLayers, goHome, openPage, openSheet, periodBar, swipePane } from "../ui/kit.js";
import {
  badgeHtml,
  buttonHtml,
  iconButtonHtml,
  menuRowHtml,
  registerAction,
  toggleRowHtml,
  translate,
} from "../ui/primitives.js";

// Category totals for the statistics screen.
function statsGroups(type = uiState.catType) {
  const groups = new Map(
    appData.categories
      .filter((c) => c.type === type && !c.parent && !c.archived)
      .map((c) => [c.id, { ...c, total: 0 }]),
  );
  for (const o of reportRows().filter((o) => o.reportType === type)) {
    const c = categoryById(o.category),
      id = c?.parent || o.category;
    let group = groups.get(id);
    if (!group) {
      const base = categoryById(id) || {
        id,
        name: accountById(id?.replace("debt:", ""))?.name || "Debt",
        icon: "debt",
        color: "#858595",
      };
      group = { ...base, total: 0 };
      groups.set(id, group);
    }
    group.total += o.reportAmount;
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
// Open the operations list filtered by a category.
function statsDetail(id) {
  uiState.filters.categories = [id];
  goHome("operations");
}
// Bar chart.
function chartBars() {
  const [a, b] = periodBounds();
  let start = a,
    end = b;
  if (uiState.period.mode === "all") {
    start = appData.ops.reduce((s, o) => (o.date < s ? o.date : s), TODAY);
    end = TODAY;
  }
  const days = Math.max(1, Math.round((parseDate(end) - parseDate(start)) / 86400000) + 1),
    bins = Math.min(30, days),
    inc = Array(bins).fill(0),
    exp = Array(bins).fill(0);
  for (const o of reportRows()) {
    let i = Math.min(
      bins - 1,
      Math.floor(((parseDate(o.date) - parseDate(start)) / 86400000 / days) * bins),
    );
    if (i >= 0) (o.reportType === "income" ? inc : exp)[i] += o.reportAmount;
  }
  const max = Math.max(1, ...(uiState.catType === "income" ? inc : exp)),
    w = 320 / bins;
  return `<svg class="chart" viewBox="0 0 340 144" role="img" aria-label="Income and expense chart"><path d="M10 124H334" stroke="var(--line)"/>${inc.map((n, i) => `<rect opacity="${uiState.catType === "income" ? 1 : 0}" x="${10 + i * w}" y="${124 - (n / max) * 105}" width="${Math.max(2, w * 0.36)}" height="${(n / max) * 105}" rx="1" fill="var(--positive)"/><rect opacity="${uiState.catType === "expense" ? 1 : 0}" x="${10 + i * w + w * 0.4}" y="${124 - (exp[i] / max) * 105}" width="${Math.max(2, w * 0.36)}" height="${(exp[i] / max) * 105}" rx="1" fill="var(--negative)"/>`).join("")}<text x="10" y="141" fill="var(--muted)" font-size="10">${escapeHtml(start)}</text><text x="267" y="141" fill="var(--muted)" font-size="10">${escapeHtml(end)}</text></svg>`;
}
// Donut chart.
function donut(groups) {
  const total = groups.reduce((s, x) => s + x.total, 0);
  let offset = 0;
  const circ = 2 * Math.PI * 68;
  return `<div class="donut-wrap"><svg viewBox="0 0 190 190" role="img" aria-label="Category distribution"><circle cx="95" cy="95" r="68" fill="none" stroke="var(--line)" stroke-width="28"/>${groups
    .map((g) => {
      let length = total ? (g.total / total) * circ : 0;
      const out = `<circle role="button" tabindex="0" aria-label="${escapeHtml(g.name)}" data-action="${registerAction(
        () => {
          uiState.donut = uiState.donut === g.id ? null : g.id;
          render();
        },
      )}" cx="95" cy="95" r="68" fill="none" stroke="${escapeHtml(g.color)}" stroke-width="${uiState.donut === g.id ? 35 : 28}" stroke-dasharray="${Math.max(0, length - 1)} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 95 95)"/>`;
      offset += length;
      return out;
    })
    .join(
      "",
    )}</svg><div class="donut-center"><small>${escapeHtml(groups.find((g) => g.id === uiState.donut)?.name || translate("Not selected"))}</small><strong>${uiState.donut ? (total ? Math.round(((groups.find((g) => g.id === uiState.donut)?.total || 0) / total) * 100) : 0) + "%" : "$"}</strong>${uiState.donut ? buttonHtml("Operations", () => statsDetail(uiState.donut), "text-button") : ""}</div></div>`;
}
// Statistics tab.
export function statisticsView() {
  const income = totalByType("income"),
    expense = totalByType("expense"),
    groups = statsGroups(),
    total = groups.reduce((s, g) => s + g.total, 0);
  let [a, b] = periodBounds();
  if (a.startsWith("0000")) a = appData.ops.reduce((s, o) => (o.date < s ? o.date : s), TODAY);
  if (b > TODAY) b = TODAY;
  const days = Math.max(1, Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1);
  const blocks = {
    flow: () =>
      `<section class="stats-card flow" data-stat="flow" style="border-color:${income >= expense ? "var(--positive)" : "var(--negative)"}"><h3>${translate("Cash flow")}</h3><div class="cash-total">${moneySpanHtml(income - expense)}</div></section>`,
    scheduled: () =>
      `<section class="stats-card halves" data-stat="scheduled">${[uiState.catType, "transfer"].map((type) => buttonHtml(`<h3>${translate(type === "expense" ? "Scheduled expenses" : type === "income" ? "Scheduled incomes" : "Scheduled transfers")}</h3><span class="money ${type === "expense" ? "neg" : type === "income" ? "pos" : "muted"}">${formatMoney(appData.scheduled.filter((o) => o.type === type).reduce((n, o) => n + convertCurrency(o.amount, accountById(o.from || o.to)?.currency, appData.settings.currency), 0))}</span>`, () => openPage("scheduled"))).join("")}</section>`,
    bar: () => `<section class="stats-card" data-stat="bar">${chartBars()}</section>`,
    average: () =>
      `<section class="stats-card" data-stat="average"><h3>${translate("Average values")}</h3><small>Based on ${days} days</small><div class="average-selected">${[
        ["Day", 1],
        ["Week", 7],
      ]
        .map(
          ([label, n]) =>
            `<span>${translate(label)}</span><span>${formatMoney(Math.round(((uiState.catType === "expense" ? expense : income) / days) * n))}</span>`,
        )
        .join("")}</div></section>`,
    donut: () => `<section class="stats-card" data-stat="donut">${donut(groups)}</section>`,
    categories: () =>
      `<section class="stats-card" data-stat="categories">${groups.map((g) => buttonHtml(`${badgeHtml(g, true)}<span class="grow"><span>${escapeHtml(g.name)}</span><span class="bar-track"><span style="width:${total ? (g.total / total) * 100 : 0}%;background:${g.color}"></span></span></span><span class="right"><span class="money ${uiState.catType === "expense" ? "neg" : "pos"}">${formatMoney(g.total)}</span><small>${total ? ((g.total / total) * 100).toFixed(1) : 0}%</small></span>`, () => statsDetail(g.id), "stats-category")).join("")}${!groups.length ? `<div class="empty">${translate("Empty")}</div>` : ""}</section>`,
    tags: () =>
      `<section class="stats-card" data-stat="tags"><div class="section-label">${translate("Tags")}</div>${appData.tags
        .map((tag) => {
          let n = reportRows()
            .filter((o) => o.reportType === uiState.catType && o.tags?.includes(tag))
            .reduce((s, o) => s + o.reportAmount, 0);
          return menuRowHtml(
            escapeHtml(tag),
            "tag",
            () => {
              uiState.filters.tags = [tag];
              goHome("operations");
            },
            formatMoney(n),
          );
        })
        .join("")}</section>`,
  };
  return (
    hero() +
    swipePane(
      periodBar() +
        sumTabs() +
        `${filterActive() ? buttonHtml(translate("Filtered data") + " " + iconSvg("filter", 15), filters, "filtered-banner") : ""}<div class="content">${appData.settings.stats.map((k) => blocks[k]?.() || "").join("")}${buttonHtml(iconSvg("gear", 20) + " Statistics settings", statsSettings, "text-button")}</div>`,
    )
  );
}

// Statistics settings sheet.
export function statsSettings() {
  openSheet(
    () =>
      `<h2>${translate("Statistics")}</h2>${menuRowHtml("Order of statistics blocks", "sort", statsOrder)}${[
        ["flow", "Cash flow"],
        ["scheduled", "Scheduled payments"],
        ["bar", "Charts"],
        ["average", "Average values"],
        ["donut", "Diagram"],
        ["categories", "Categories"],
        ["tags", "Tags"],
      ]
        .map(([id, label]) =>
          toggleRowHtml(label, appData.settings.stats.includes(id), () => {
            appData.settings.stats = appData.settings.stats.includes(id)
              ? appData.settings.stats.filter((x) => x !== id)
              : [...appData.settings.stats, id];
            save();
            render();
          }),
        )
        .join("")}${buttonHtml("Complete", () => closeLayers(), "primary")}`,
    "Statistics",
  );
}
// Reorder statistics blocks.
function statsOrder() {
  openSheet(
    () =>
      `<h2>Order of statistics blocks</h2>${appData.settings.stats
        .map(
          (id, i) =>
            `<div class="row"><span class="grow">${escapeHtml({ flow: "Cash flow", scheduled: "Scheduled amounts", bar: "Bar chart", average: "Average values", donut: "Donut chart", categories: "Categories", tags: "Tags" }[id] || id)}</span>${iconButtonHtml(
              "up",
              "Move up",
              () => {
                if (i > 0) {
                  [appData.settings.stats[i - 1], appData.settings.stats[i]] = [
                    appData.settings.stats[i],
                    appData.settings.stats[i - 1],
                  ];
                  save();
                  render();
                }
              },
            )}${iconButtonHtml("down", "Move down", () => {
              if (i < appData.settings.stats.length - 1) {
                [appData.settings.stats[i + 1], appData.settings.stats[i]] = [
                  appData.settings.stats[i],
                  appData.settings.stats[i + 1],
                ];
                save();
                render();
              }
            })}</div>`,
        )
        .join("")}${buttonHtml("Complete", () => closeLayers(), "primary")}`,
    "Statistics order",
  );
}
