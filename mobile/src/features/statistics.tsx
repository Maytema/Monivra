// The Statistics tab (js/screens/statistics.js): the blocks the person switched on, in their order —
// cash flow, scheduled payments, a bar chart by day, average values, a donut, categories, tags — all
// from the same report rows as the reports and budgets.
import { Fragment, memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { router } from "expo-router";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { chartBins, donutArcs, donutSlices, OTHER_SLICE, sliceAt, type Group } from "../domain/chart.ts";
import { parseDate, systemClock } from "../domain/dates.ts";
import { accountById, categoryById, categoryFamily, reportRows, totalByType } from "../domain/ledger.ts";
import { convert, shownPercent } from "../domain/money.ts";
import { operationsIn, periodBounds, type Period } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { mix } from "../ui/theme.ts";
import { SumTabs, ToneBadge } from "../ui/parts.tsx";
import { numberText } from "../ui/number-text.ts";
import { EmptyState } from "../ui/empty-state.tsx";
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
  const [ringSize, setRingSize] = useState(0);
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
      // A round upper bound split in four steps, labelled on the left (the original's axis). The amounts are
      // minor units (cents); the labels are in whole units, as every amount is shown.
      const raw = top / 100 / 4;
      const unit = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * unit).find((v) => v >= raw) ?? unit * 10;
      const max = step * 4 * 100;
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
      // A thin ring with a small gap between the slices (ST 003). One touch layer over the ring finds the slice by
      // the angle of the touch (domain/chart.ts sliceAt), so a finger near a slice picks that slice; the same
      // slice again, or a touch off the ring, clears the choice. With nothing chosen the middle shows the total
      // of the period (expenses or income, as chosen above); with a slice chosen, its name, sum and share.
      const radius = 80;
      const ring = 15;
      const circ = 2 * Math.PI * radius;
      const arcs = donutArcs(slices);
      const label = (g: Group) => (g.id === OTHER_SLICE ? t.t(g.name) : g.name);
      const touch = (x: number, y: number) => {
        if (!ringSize) return;
        const scale = 190 / ringSize; // the drawing is 190 units wide
        const id = sliceAt(arcs, x * scale - 95, y * scale - 95, radius - ring * 2, radius + ring * 1.6);
        setSelected(id === null || id === selected ? null : id);
      };
      return (
        <Card key="donut">
          <View style={{ aspectRatio: 1 }} onLayout={(e) => setRingSize(e.nativeEvent.layout.width)}>
            <Svg accessibilityLabel="Category distribution" viewBox="0 0 190 190" style={{ width: "100%", height: "100%" }}>
              <Circle cx={95} cy={95} r={radius} fill="none" stroke={p.line} strokeWidth={ring} />
              {arcs.map((a, i) => {
                const g = slices[i] as Group;
                const length = (a.end - a.start) * circ;
                const on = selected === g.id;
                return (
                  <Circle
                    key={g.id}
                    cx={95}
                    cy={95}
                    r={radius}
                    fill="none"
                    stroke={g.color}
                    opacity={selected && !on ? 0.35 : 1}
                    strokeWidth={on ? ring + 6 : ring}
                    strokeDasharray={`${slices.length > 1 ? Math.max(0, length - 3) : length} ${circ}`}
                    strokeDashoffset={-a.start * circ}
                    transform="rotate(-90 95 95)"
                  />
                );
              })}
            </Svg>
            {/* For screen readers the ring is one adjustable element: swipe up and down to go through the slices. */}
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel={t.t("Category distribution")}
              accessibilityValue={{ text: chosen ? `${label(chosen)}, ${money(chosen.total, main)}` : `${t.t(catType === "expense" ? "Expenses" : "Income")}, ${money(total, main)}` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(e) => {
                const at = slices.findIndex((g) => g.id === selected);
                const next = e.nativeEvent.actionName === "increment" ? at + 1 : at - 1;
                setSelected(next >= 0 && next < slices.length ? (slices[next] as Group).id : null);
              }}
              onPress={(e) => touch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View pointerEvents="box-none" style={{ position: "absolute", top: "24%", bottom: "24%", left: "24%", right: "24%", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {chosen ? (
                <>
                  <View pointerEvents="none" style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: mix(chosen.color, p.bg, 0.16) }}>
                    <Icon name={chosen.icon ?? "dollar"} size={22} color={chosen.color} />
                  </View>
                  <Text pointerEvents="none" numberOfLines={1} style={{ color: p.muted, fontSize: 15, textAlign: "center" }}>{label(chosen)}</Text>
                  <Text pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit style={{ color: tone, fontSize: 18, fontWeight: "600", textAlign: "center" }}>{money(chosen.total, main)}</Text>
                  <Text pointerEvents="none" style={{ color: p.ink, fontSize: 14 }}>{percentText(sliceTotal ? (chosen.total / sliceTotal) * 100 : 0, t.locale)}</Text>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => openOperations(chosen.id, chosen.members)}>
                    <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: "500" }}>{t.t("Operations")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text pointerEvents="none" style={{ color: p.muted, fontSize: 15, textAlign: "center" }}>{t.t(catType === "expense" ? "Expenses" : "Income")}</Text>
                  <Text pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit style={{ color: tone, fontSize: 21, fontWeight: "600", textAlign: "center" }}>{money(total, main)}</Text>
                  {slices.length ? <Text pointerEvents="none" style={{ color: p.muted, fontSize: 12, textAlign: "center", marginTop: 2 }}>{t.t("Tap a part of the ring")}</Text> : null}
                </>
              )}
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
                <View style={{ width: `${total ? (g.total / total) * 100 : 0}%`, height: 14, borderRadius: 7, backgroundColor: g.color }} />
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
          <EmptyState kind="statistics" title="Statistics would be here" hint="Start adding expenses or income and the data will appear" />
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
