/* Statistics screens and charts */
import { render } from "../app/shell.js";
import { I, TODAY, esc } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { save } from "../data/storage.js";
import {
  acc,
  bounds,
  cat,
  convert,
  dateObj,
  money,
  moneySpan,
  reportRows,
  totalType,
} from "../domain/finance.js";
import { hero } from "./accounts.js";
import { sumTabs } from "./categories.js";
import { filterActive, filters } from "./operations.js";
import { close, home, page, periodBar, sheet } from "../ui/kit.js";
import { B, IB, act, badge, row, t, toggle } from "../ui/primitives.js";

function statsGroups(type = U.catType) {
  const groups = new Map(
    D.categories
      .filter((c) => c.type === type && !c.parent && !c.archived)
      .map((c) => [c.id, { ...c, total: 0 }]),
  );
  for (const o of reportRows().filter((o) => o.reportType === type)) {
    const c = cat(o.category),
      id = c?.parent || o.category;
    let group = groups.get(id);
    if (!group) {
      const base = cat(id) || {
        id,
        name: acc(id?.replace("debt:", ""))?.name || "Debt",
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
function statsDetail(id) {
  U.filters.categories = [id];
  home("operations");
}
function chartBars() {
  const [a, b] = bounds();
  let start = a,
    end = b;
  if (U.period.mode === "all") {
    start = D.ops.reduce((s, o) => (o.date < s ? o.date : s), TODAY);
    end = TODAY;
  }
  const days = Math.max(1, Math.round((dateObj(end) - dateObj(start)) / 86400000) + 1),
    bins = Math.min(30, days),
    inc = Array(bins).fill(0),
    exp = Array(bins).fill(0);
  for (const o of reportRows()) {
    let i = Math.min(
      bins - 1,
      Math.floor(((dateObj(o.date) - dateObj(start)) / 86400000 / days) * bins),
    );
    if (i >= 0) (o.reportType === "income" ? inc : exp)[i] += o.reportAmount;
  }
  const max = Math.max(1, ...(U.catType === "income" ? inc : exp)),
    w = 320 / bins;
  return `<svg class="chart" viewBox="0 0 340 144" role="img" aria-label="Income and expense chart"><path d="M10 124H334" stroke="var(--line)"/>${inc.map((n, i) => `<rect opacity="${U.catType === "income" ? 1 : 0}" x="${10 + i * w}" y="${124 - (n / max) * 105}" width="${Math.max(2, w * 0.36)}" height="${(n / max) * 105}" rx="1" fill="var(--positive)"/><rect opacity="${U.catType === "expense" ? 1 : 0}" x="${10 + i * w + w * 0.4}" y="${124 - (exp[i] / max) * 105}" width="${Math.max(2, w * 0.36)}" height="${(exp[i] / max) * 105}" rx="1" fill="var(--negative)"/>`).join("")}<text x="10" y="141" fill="var(--muted)" font-size="10">${esc(start)}</text><text x="267" y="141" fill="var(--muted)" font-size="10">${esc(end)}</text></svg>`;
}
function donut(groups) {
  const total = groups.reduce((s, x) => s + x.total, 0);
  let offset = 0;
  const circ = 2 * Math.PI * 68;
  return `<div class="donut-wrap"><svg viewBox="0 0 190 190" role="img" aria-label="Category distribution"><circle cx="95" cy="95" r="68" fill="none" stroke="var(--line)" stroke-width="28"/>${groups
    .map((g) => {
      let length = total ? (g.total / total) * circ : 0;
      const out = `<circle role="button" tabindex="0" aria-label="${esc(g.name)}" data-action="${act(
        () => {
          U.donut = U.donut === g.id ? null : g.id;
          render();
        },
      )}" cx="95" cy="95" r="68" fill="none" stroke="${esc(g.color)}" stroke-width="${U.donut === g.id ? 35 : 28}" stroke-dasharray="${Math.max(0, length - 1)} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 95 95)"/>`;
      offset += length;
      return out;
    })
    .join(
      "",
    )}</svg><div class="donut-center"><small>${esc(groups.find((g) => g.id === U.donut)?.name || t("Not selected"))}</small><strong>${U.donut ? (total ? Math.round(((groups.find((g) => g.id === U.donut)?.total || 0) / total) * 100) : 0) + "%" : "$"}</strong>${U.donut ? B("Operations", () => statsDetail(U.donut), "text-button") : ""}</div></div>`;
}
export function statisticsView() {
  const income = totalType("income"),
    expense = totalType("expense"),
    groups = statsGroups(),
    total = groups.reduce((s, g) => s + g.total, 0);
  let [a, b] = bounds();
  if (a.startsWith("0000")) a = D.ops.reduce((s, o) => (o.date < s ? o.date : s), TODAY);
  if (b > TODAY) b = TODAY;
  const days = Math.max(1, Math.round((dateObj(b) - dateObj(a)) / 86400000) + 1);
  const blocks = {
    flow: () =>
      `<section class="stats-card flow" data-stat="flow" style="border-color:${income >= expense ? "var(--positive)" : "var(--negative)"}"><h3>${t("Cash flow")}</h3><div class="cash-total">${moneySpan(income - expense)}</div></section>`,
    scheduled: () =>
      `<section class="stats-card halves" data-stat="scheduled">${[U.catType, "transfer"].map((type) => B(`<h3>${t(type === "expense" ? "Scheduled expenses" : type === "income" ? "Scheduled incomes" : "Scheduled transfers")}</h3><span class="money ${type === "expense" ? "neg" : type === "income" ? "pos" : "muted"}">${money(D.scheduled.filter((o) => o.type === type).reduce((n, o) => n + convert(o.amount, acc(o.from || o.to)?.currency, D.settings.currency), 0))}</span>`, () => page("scheduled"))).join("")}</section>`,
    bar: () => `<section class="stats-card" data-stat="bar">${chartBars()}</section>`,
    average: () =>
      `<section class="stats-card" data-stat="average"><h3>${t("Average values")}</h3><small>Based on ${days} days</small><div class="average-selected">${[
        ["Day", 1],
        ["Week", 7],
      ]
        .map(
          ([label, n]) =>
            `<span>${t(label)}</span><span>${money(Math.round(((U.catType === "expense" ? expense : income) / days) * n))}</span>`,
        )
        .join("")}</div></section>`,
    donut: () => `<section class="stats-card" data-stat="donut">${donut(groups)}</section>`,
    categories: () =>
      `<section class="stats-card" data-stat="categories">${groups.map((g) => B(`${badge(g, true)}<span class="grow"><span>${esc(g.name)}</span><span class="bar-track"><span style="width:${total ? (g.total / total) * 100 : 0}%;background:${g.color}"></span></span></span><span class="right"><span class="money ${U.catType === "expense" ? "neg" : "pos"}">${money(g.total)}</span><small>${total ? ((g.total / total) * 100).toFixed(1) : 0}%</small></span>`, () => statsDetail(g.id), "stats-category")).join("")}${!groups.length ? `<div class="empty">${t("Empty")}</div>` : ""}</section>`,
    tags: () =>
      `<section class="stats-card" data-stat="tags"><div class="section-label">${t("Tags")}</div>${D.tags
        .map((tag) => {
          let n = reportRows()
            .filter((o) => o.reportType === U.catType && o.tags?.includes(tag))
            .reduce((s, o) => s + o.reportAmount, 0);
          return row(
            esc(tag),
            "tag",
            () => {
              U.filters.tags = [tag];
              home("operations");
            },
            money(n),
          );
        })
        .join("")}</section>`,
  };
  return (
    hero() +
    periodBar() +
    sumTabs() +
    `${filterActive() ? B(t("Filtered data") + " " + I("filter", 15), filters, "filtered-banner") : ""}<div class="content">${D.settings.stats.map((k) => blocks[k]?.() || "").join("")}${B(I("gear", 20) + " Statistics settings", statsSettings, "text-button")}</div>`
  );
}

export function statsSettings() {
  sheet(
    () =>
      `<h2>${t("Statistics")}</h2>${row("Order of statistics blocks", "sort", statsOrder)}${[
        ["flow", "Cash flow"],
        ["scheduled", "Scheduled payments"],
        ["bar", "Charts"],
        ["average", "Average values"],
        ["donut", "Diagram"],
        ["categories", "Categories"],
        ["tags", "Tags"],
      ]
        .map(([id, label]) =>
          toggle(label, D.settings.stats.includes(id), () => {
            D.settings.stats = D.settings.stats.includes(id)
              ? D.settings.stats.filter((x) => x !== id)
              : [...D.settings.stats, id];
            save();
            render();
          }),
        )
        .join("")}${B("Complete", () => close(), "primary")}`,
    "Statistics",
  );
}
function statsOrder() {
  sheet(
    () =>
      `<h2>Order of statistics blocks</h2>${D.settings.stats
        .map(
          (id, i) =>
            `<div class="row"><span class="grow">${esc({ flow: "Cash flow", scheduled: "Scheduled amounts", bar: "Bar chart", average: "Average values", donut: "Donut chart", categories: "Categories", tags: "Tags" }[id] || id)}</span>${IB(
              "up",
              "Move up",
              () => {
                if (i > 0) {
                  [D.settings.stats[i - 1], D.settings.stats[i]] = [
                    D.settings.stats[i],
                    D.settings.stats[i - 1],
                  ];
                  save();
                  render();
                }
              },
            )}${IB("down", "Move down", () => {
              if (i < D.settings.stats.length - 1) {
                [D.settings.stats[i + 1], D.settings.stats[i]] = [
                  D.settings.stats[i],
                  D.settings.stats[i + 1],
                ];
                save();
                render();
              }
            })}</div>`,
        )
        .join("")}${B("Complete", () => close(), "primary")}`,
    "Statistics order",
  );
}
