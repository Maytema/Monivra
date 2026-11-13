// The Statistics tab (js/screens/statistics.js): the blocks the person switched on, in their order —
// cash flow, scheduled payments, a bar chart by day, average values, a donut, categories, tags — all
// from the same report rows as the reports and budgets.
import { Fragment, memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { chartBins, donutSlices, OTHER_SLICE, type Group } from "../domain/chart.ts";
import { parseDate, systemClock } from "../domain/dates.ts";
import { accountById, categoryById, categoryFamily, reportRows, totalByType } from "../domain/ledger.ts";
import { convert, shownPercent } from "../domain/money.ts";
import { operationsIn, periodBounds, type Period } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { mix } from "../ui/theme.ts";
import { SumTabs, ToneBadge } from "../ui/parts.tsx";
import { numberText } from "../ui/number-text.ts";
import { openCategorySheet } from "./category-sheet.tsx";
import { filtersActive, openFilters as openFiltersSheet } from "./filters-panel.tsx";
import { FilteredBanner } from "./operation-row.tsx";
import { PeriodBar, PeriodPager } from "./period-bar.tsx";
import { RootHero } from "./root-hero.tsx";
import { getView, setView, useView } from "./ui-state.ts";

const percentText = (percent: number, locale: string): string => numberText(shownPercent(percent), locale, 2) + "%";
const DAY = 86400000;

function Card({ children, padded = true, borderColor }: { children: ReactNode; padded?: boolean; borderColor?: string }) {
  const p = usePalette();
  return <View style={{ alignItems: "stretch", borderWidth: 1, borderColor: borderColor ?? p.line, borderRadius: 13, marginBottom: 14, paddingVertical: padded ? 12 : 0, paddingHorizontal: padded ? 14 : 0 }}>{children}</View>;
}

function Heading({ children }: { children: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.ink, fontSize: 16, textAlign: "center", marginBottom: 9 }}>{t.t(children)}</Text>;
}

export function StatisticsScreen() {
  const p = usePalette();
  const openFilters = useCallback(() => openFiltersSheet(getView().filters, (f) => setView({ filters: f })), []);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <RootHero icon="filter" label="Filters" onAction={openFilters} />
      <PeriodPager header={<PeriodBar />} render={(period) => <StatisticsPage period={period} openFilters={openFilters} />} />
    </View>
  );
}

// The blocks of one period (drawn beforehand for the neighbouring periods too).
const StatisticsPage = memo(function StatisticsPage({ period, openFilters }: { period: Period; openFilters: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const { catType, filters } = useView();
  const [selected, setSelected] = useState<string | null>(null);
  const today = systemClock.today();
  const rows = useMemo(() => reportRows(data, operationsIn(data, period, filters)), [data, period, filters]);
  const income = totalByType(rows, "income");
  const expense = totalByType(rows, "expense");
  const main = data.settings.currency;
  const firstOperation = useMemo(() => data.ops.reduce((s, o) => (o.date < s ? o.date : s), today), [data.ops, today]);

  const [from, to] = periodBounds(period, data.settings);
  const start = from.startsWith("0000") ? firstOperation : from;
  const end = to > today ? today : to;
  const days = Math.max(1, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY) + 1);

  // Category totals; only what happened in the period is listed.
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>(data.categories.filter((c) => c.type === catType && !c.parent && !c.archived).map((c) => [c.id, { id: c.id, name: c.name, icon: c.icon, color: c.color, total: 0 }]));
    for (const o of rows.filter((r) => r.reportType === catType)) {
      const c = categoryById(data, o.category);
      const id = c?.parent || (o.category as string);
      let group = map.get(id);
      if (!group) {
        const base = categoryById(data, id);
        group = base ? { id, name: base.name, icon: base.icon, color: base.color, total: 0 } : { id, name: accountById(data, id?.replace("debt:", ""))?.name ?? "Debt", icon: "debt", color: "#858595", total: 0 };
        map.set(id, group);
      }
      group.total += o.reportAmount;
    }
    return [...map.values()].filter((g) => g.total !== 0).sort((a, b) => b.total - a.total);
  }, [data, rows, catType]);
  const total = groups.reduce((s, g) => s + g.total, 0);
  const slices = donutSlices(groups);
  const sliceTotal = slices.reduce((s, x) => s + x.total, 0);
  const chosen = slices.find((g) => g.id === selected);

  const openOperations = (id: string, members: Group[] = []) => {
    if (id === OTHER_SLICE) return router.push({ pathname: "/filtered", params: { categories: members.flatMap((g) => (categoryById(data, g.id) ? categoryFamily(data, g.id) : [g.id])).join(",") } });
    if (categoryById(data, id)) return openCategorySheet(id);
    router.push({ pathname: "/filtered", params: { categories: id } });
  };

  const tone = catType === "expense" ? p.negativeInk : p.positiveInk;
  const scheduledSum = (type: string) => data.scheduled.filter((o) => o.type === type).reduce((n, o) => n + convert(o.amount, accountById(data, o.from || o.to)?.currency, main, data.rates), 0);
  const axis = (date: string) => t.dayMonth(date);

  const blocks: Record<string, () => ReactNode> = {
    flow: () => (
      <Card key="flow" borderColor={income >= expense ? p.positive : p.negative}>
        <Heading>Cash flow</Heading>
        <Text style={{ color: income - expense >= 0 ? p.positiveInk : p.negativeInk, fontSize: 23, textAlign: "center" }}>{money(income - expense, main)}</Text>
      </Card>
    ),
    scheduled: () => (
      <Card key="scheduled" padded={false}>
        {([catType, "transfer"] as const).map((type, i) => {
          const sum = scheduledSum(type);
          return (
            <Pressable key={type} accessibilityRole="button" onPress={() => router.push("/scheduled")} style={{ paddingVertical: 24, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: p.line }}>
              <Text style={{ color: p.ink, fontSize: 16, textAlign: "center", marginBottom: 12 }}>{t.t(type === "expense" ? "Scheduled expenses" : type === "income" ? "Scheduled incomes" : "Scheduled transfers")}</Text>
              <Text style={{ color: type === "expense" ? p.negativeInk : type === "income" ? p.positiveInk : p.muted, fontSize: 22, textAlign: "center" }}>{money(sum, main)}</Text>
            </Pressable>
          );
        })}
      </Card>
    ),
    bar: () => {
      const { income: inc, expense: exp } = chartBins(rows, start, end);
      const series = catType === "income" ? inc : exp;
      const top = Math.max(1, ...series);
      // A round upper bound split in four steps, labelled on the left (the original's axis).
      const raw = top / 4;
      const unit = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * unit).find((v) => v >= raw) ?? unit * 10;
      const max = step * 4;
      const bins = series.length;
      const left = 46;
      const right = 332;
      const base = 190;
      const height = 170;
      const w = (right - left) / bins;
      return (
        <Card key="bar">
          <Svg accessibilityLabel="Income and expense chart" viewBox="0 0 340 214" style={{ width: "100%", aspectRatio: 340 / 214 }}>
            {[0, 1, 2, 3, 4].map((k) => {
              const y = base - (k * height) / 4;
              return (
                <Fragment key={k}>
                  <Path d={`M${left} ${y}H${right}`} stroke={p.line} strokeWidth={1} strokeDasharray={k ? "4 4" : undefined} />
                  <SvgText x={left - 6} y={y + 3.5} fill={p.ink} fontSize={10} textAnchor="end">
                    {numberText(step * k, t.locale, 2)}
                  </SvgText>
                </Fragment>
              );
            })}
            {[1, 2, 3].map((k) => (
              <Path key={k} d={`M${left + ((right - left) * k) / 4} ${base - height}V${base}`} stroke={p.line} strokeWidth={1} strokeDasharray="4 4" />
            ))}
            {series.map((n, i) => {
              const h = (n / max) * height;
              const bar = Math.min(6, Math.max(2, w * 0.5));
              return <Rect key={i} x={left + i * w + (w - bar) / 2} y={base - h} width={bar} height={h} rx={1} fill={catType === "income" ? p.positive : p.negative} />;
            })}
            <SvgText x={left} y={207} fill={p.muted} fontSize={10}>
              {axis(start)}
            </SvgText>
            <SvgText x={right} y={207} fill={p.muted} fontSize={10} textAnchor="end">
              {axis(end)}
            </SvgText>
          </Svg>
        </Card>
      );
    },
    average: () => (
      <Card key="average">
        <Heading>Average values</Heading>
        <Text style={{ color: p.muted, fontSize: 12, textAlign: "center", marginTop: -6 }}>{t.t("Based on {n} days", { n: days })}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 15, marginTop: 16 }}>
          {([["Day", 1], ["Week", 7]] as const).map(([label, n]) => (
            <View key={label} style={{ flexDirection: "row", width: "100%" }}>
              <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>{t.t(label)}</Text>
              <Text style={{ flex: 2, color: p.ink, fontSize: 14, textAlign: "right" }}>{money(Math.round(((catType === "expense" ? expense : income) / days) * n), main)}</Text>
            </View>
          ))}
        </View>
      </Card>
    ),
    donut: () => {
      // A thin ring with a small gap between the slices, an icon tile in the middle (ST 003).
      const radius = 80;
      const ring = 15;
      const circ = 2 * Math.PI * radius;
      let offset = 0;
      const label = (g: Group) => (g.id === OTHER_SLICE ? t.t(g.name) : g.name);
      return (
        <Card key="donut">
          <View style={{ aspectRatio: 1 }}>
            <Svg accessibilityLabel="Category distribution" viewBox="0 0 190 190" style={{ width: "100%", height: "100%" }}>
              <Circle cx={95} cy={95} r={radius} fill="none" stroke={p.line} strokeWidth={ring} />
              {slices.map((g) => {
                const length = sliceTotal ? (g.total / sliceTotal) * circ : 0;
                const node = (
                  <Circle
                    key={g.id}
                    accessibilityLabel={label(g)}
                    onPress={() => setSelected(selected === g.id ? null : g.id)}
                    cx={95}
                    cy={95}
                    r={radius}
                    fill="none"
                    stroke={g.color}
                    strokeWidth={selected === g.id ? ring + 6 : ring}
                    strokeDasharray={`${slices.length > 1 ? Math.max(0, length - 3) : length} ${circ}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 95 95)"
                  />
                );
                offset += length;
                return node;
              })}
            </Svg>
            <View pointerEvents="box-none" style={{ position: "absolute", top: "28%", bottom: "28%", left: "28%", right: "28%", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <View style={{ width: 56, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: chosen ? mix(chosen.color, p.bg, 0.16) : p.key }}>
                <Icon name={chosen?.icon ?? "dollar"} size={28} color={chosen ? chosen.color : p.inkSoft} />
              </View>
              <Text numberOfLines={2} style={{ color: p.muted, fontSize: 17, textAlign: "center" }}>{chosen ? label(chosen) : t.t("Not selected")}</Text>
              {chosen ? <Text style={{ color: p.ink, fontSize: 18, fontWeight: "600" }}>{percentText(sliceTotal ? (chosen.total / sliceTotal) * 100 : 0, t.locale)}</Text> : null}
              {chosen ? (
                <Pressable accessibilityRole="button" onPress={() => openOperations(chosen.id, chosen.members)}>
                  <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: "500" }}>{t.t("Operations")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Card>
      );
    },
    categories: () => (
      <Card key="categories">
        {groups.map((g) => (
          <Pressable key={g.id} accessibilityRole="button" onPress={() => openOperations(g.id)} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 }}>
            <ToneBadge icon={g.icon ?? "tag"} color={g.color} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.ink, fontSize: 16 }}>{g.name}</Text>
              <View style={{ height: 14, borderRadius: 7, backgroundColor: p.tint, overflow: "hidden", marginTop: 6 }}>
                <View style={{ width: `${total ? (g.total / total) * 100 : 0}%`, height: 14, borderRadius: 7, backgroundColor: p.accent }} />
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: tone, fontSize: 15 }}>{money(g.total, main)}</Text>
              <Text style={{ color: p.muted, fontSize: 12 }}>{percentText(total ? (g.total / total) * 100 : 0, t.locale)}</Text>
            </View>
          </Pressable>
        ))}
        {!groups.length ? <Text style={{ color: p.muted, textAlign: "center", paddingVertical: 12 }}>{t.t("Empty")}</Text> : null}
      </Card>
    ),
    tags: () => {
      const own = rows.filter((o) => o.reportType === catType);
      const used = data.tags
        .map((tag) => ({ tag, total: own.filter((o) => o.tags?.includes(tag)).reduce((s, o) => s + o.reportAmount, 0), used: own.some((o) => o.tags?.includes(tag)) }))
        .filter((x) => x.used)
        .sort((x, y) => y.total - x.total);
      if (!used.length) return null;
      return (
        <Card key="tags">
          <Text style={{ color: p.ink, fontSize: 17, fontWeight: "500", textAlign: "center", marginBottom: 6 }}>{t.t("Tags")}</Text>
          {used.map(({ tag, total: sum }, i) => (
            <Pressable key={tag} accessibilityRole="button" onPress={() => (setView({ filters: { ...filters, tags: [tag] } }), router.navigate("/operations"))} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: i ? 1 : 0, borderTopColor: p.line }}>
              <Icon name="tag" size={20} color={p.muted} />
              <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 16 }}>
                {tag}
              </Text>
              <Text style={{ color: tone, fontSize: 16 }}>{money(sum, main)}</Text>
            </Pressable>
          ))}
        </Card>
      );
    },
  };

  const hasOperations = data.ops.length > 0 || filtersActive(filters);
  return (
      <View style={{ flex: 1 }}>
        {hasOperations ? (
          <>
            <SumTabs tinted active={catType} expense={money(expense, main)} income={money(income, main)} onChange={(v) => (setView({ catType: v }), setSelected(null))} />
            {filtersActive(filters) ? <FilteredBanner onChange={() => openFilters()} onClear={() => setView({ filters: { ...filters, accounts: null, categories: null, types: null, tags: null, origin: null } })} /> : null}
            <ScrollBlocks>{data.settings.stats.map((k) => blocks[k]?.() ?? null)}</ScrollBlocks>
          </>
        ) : (
          <View style={{ padding: 32, alignItems: "center", gap: 10 }}>
            <Icon name="stats" size={80} color={p.accentInk} />
            <Text style={{ color: p.ink, fontSize: 18 }}>{t.t("Statistics would be here")}</Text>
            <Text style={{ color: p.muted, textAlign: "center" }}>{t.t("Start adding expenses or income and the data will appear")}</Text>
          </View>
        )}
      </View>
  );
});

function ScrollBlocks({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}
