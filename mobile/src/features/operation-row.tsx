// One operation in a list and the heading of a day (js/screens/operations/list.js `opRow`, `dayGroup`):
// a badge, the name, the account, the schedule note, comment and tags on the left; the amount (and the
// other amounts of a cross-currency operation) on the right.
import { memo, useRef, type ComponentRef } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { accountById, amountPair, categoryById, offRate, transferRoles } from "../domain/ledger.ts";
import { convert } from "../domain/money.ts";
import type { LedgerData, Operation } from "../domain/types.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { MoneyText, ToneBadge } from "../ui/parts.tsx";
import { alpha } from "../ui/theme.ts";

type Translate = ReturnType<typeof useT>;

// Name of a category as an operation shows it: a subcategory follows its category.
function categoryTitle(data: LedgerData, id: string | undefined, t: Translate): string {
  const category = categoryById(data, id);
  if (!category) return t.t("Category");
  return category.parent ? `${categoryById(data, category.parent)?.name} (${category.name})` : category.name;
}

export function operationTitle(data: LedgerData, o: Operation, t: Translate): string {
  if (o.type === "adjustment") return t.t("Adjustment");
  if (o.type === "transfer") return t.t("Transfer");
  return categoryTitle(data, o.category, t);
}

// Red for money spent, green for money earned, also for a transfer that counts as an expense or an
// income because of a debt account.
function tone(data: LedgerData, o: Operation): -1 | 0 | 1 {
  const roles = transferRoles(data, o);
  if (o.type === "expense" || (o.type === "adjustment" && o.from) || roles.expense) return -1;
  if (o.type === "income" || (o.type === "adjustment" && o.to) || roles.income) return 1;
  return 0;
}

// A rate quoted with the larger currency first: "1 USD = 87.5 KGS".
function rateText(t: Translate, from: string, to: string, ratio: number): string {
  const [base, quote, rate] = ratio >= 1 ? [from, to, ratio] : [to, from, 1 / ratio];
  return t.t("1 {from} = {rate} {to}", { from: base, rate: Number(rate.toPrecision(6)), to: quote });
}

// Memoised: the list passes stable handlers (they receive the id), so a row is drawn again only when
// its own operation or its selection changes, not on every scroll or selection of another row.
export const OperationRow = memo(function OperationRow({ op, selecting = false, selected = false, onPress, onLongPress }: { op: Operation; selecting?: boolean; selected?: boolean; onPress: (id: string) => void; onLongPress?: (id: string) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const box = useRef<ComponentRef<typeof View>>(null);
  const compact = useWindowDimensions().width <= 360;
  const account = accountById(data, op.from || op.to);
  const category = categoryById(data, op.category);
  const sign = tone(data, op);
  const color = sign < 0 ? p.negativeInk : sign > 0 ? p.positiveInk : p.ink;
  // The two amounts of a balance correction between the account and "Adjustment" in different currencies.
  const raise = !!op.to;
  const adjustment = op.type === "adjustment" && op.receive !== undefined && account ? { account: raise ? op.receive : op.amount, pseudo: raise ? op.amount : op.receive } : null;
  // The amount in the category's currency, shown while the category and account differ.
  const inCategory = op.categoryAmount?.currency === category?.currency && category?.currency !== account?.currency ? op.categoryAmount : null;
  const pair = amountPair(data, op);
  const off = pair && offRate(pair, data.rates) ? pair : null;
  const small = { fontSize: 13, textAlign: "right" as const };
  const nameSize = compact ? 15 : 17;
  const lineSize = compact ? 14 : 15;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(op.id)}
      onLongPress={onLongPress ? () => (console.log("[gesture] row long press"), onLongPress(op.id)) : undefined}
      ref={box}
      onPressIn={(e: { nativeEvent: { pageX: number; pageY: number } }) => {
        const { pageX, pageY } = e.nativeEvent;
        box.current?.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) => console.log(`[gesture] row press in at ${Math.round(pageX)},${Math.round(pageY)}; row ${Math.round(px)},${Math.round(py)} ${Math.round(w)}x${Math.round(h)}`));
      }}
      onPressOut={() => console.log("[gesture] row press out")}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 70, paddingVertical: 13, borderRadius: 12, backgroundColor: selected || pressed ? p.soft : "transparent" })}
    >
      {selecting && selected ? (
        <View style={{ width: 48, height: 48, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}>
          <Icon name="check" size={25} color={p.onAccent} />
        </View>
      ) : (
        <ToneBadge icon={category?.icon ?? "transfer"} color={category?.color ?? "#8694bb"} size={48} iconSize={25} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: p.ink, fontSize: nameSize }}>
            {operationTitle(data, op, t)}
          </Text>
          {op.photos?.length ? <Icon name="clip" size={15} color={p.muted} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
          <Icon name={account?.icon ?? "wallet"} size={18} color={p.ink} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: p.ink, fontSize: lineSize }}>
            {(account?.name ?? "") + (op.type === "transfer" ? " → " + (accountById(data, op.to)?.name ?? "") : "")}
          </Text>
        </View>
        {op.fromSchedule ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="calendar" size={15} color={p.muted} />
            <Text style={{ color: p.muted, fontSize: 13 }}>
              {op.fromSchedule.byHand ? t.t("By schedule, by hand (planned {date})", { date: t.day(op.fromSchedule.date) }) : t.t("By schedule")}
            </Text>
          </View>
        ) : null}
        {op.comment ? <Text style={{ color: p.muted, fontSize: 12, marginTop: 8 }}>{op.comment}</Text> : null}
        {op.tags.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {op.tags.map((tag) => (
              <View key={tag} style={{ paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: p.line, borderRadius: 9 }}>
                <Text style={{ color: p.ink, fontSize: 12, fontWeight: "500" }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0, maxWidth: "45%" }}>
        {op.recalculated ? <Text style={[small, { color: p.muted }]}>{t.t("was {amount}", { amount: money(op.recalculated.amount, op.recalculated.currency) })}</Text> : null}
        {adjustment && adjustment.pseudo !== undefined ? <Text style={[small, { color }]}>{money(adjustment.pseudo, data.settings.currency)}</Text> : null}
        {inCategory ? <Text style={[small, { color }]}>{money(inCategory.amount, inCategory.currency)}</Text> : null}
        <Text style={{ color, fontSize: compact ? 14 : 17, fontVariant: ["tabular-nums"] }}>
          {(op.type === "adjustment" ? (op.to ? "+" : "−") : "") + money(adjustment ? adjustment.account : op.amount, account?.currency)}
        </Text>
        {off ? <Text style={[small, { color: p.muted }]}>{rateText(t, off[0][1], off[1][1], off[1][0] / off[0][0])}</Text> : null}
      </View>
    </Pressable>
  );
});

// Net result of one day (income minus expenses) in the main currency.
function dayTotal(data: LedgerData, ops: Operation[]): number {
  return ops.reduce((sum, o) => {
    const sign = o.type === "income" ? 1 : o.type === "expense" ? -1 : 0;
    const currency = accountById(data, o.from || o.to)?.currency;
    const inMain = convert(o.amount, currency, data.settings.currency, data.rates);
    return sum + sign * inMain;
  }, 0);
}

// The date of a group with its day total, and a line under it.
export function DayHead({ date, ops }: { date: string; ops: Operation[] }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const weekday = t.weekday(date, "long");
  const monthYear = t.monthYear(date);
  const total = dayTotal(data, ops);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 23, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: p.line, backgroundColor: p.bg }}>
      <Text style={{ color: p.ink, fontSize: 28 }}>{Number(date.slice(-2))}</Text>
      <Text style={{ flexShrink: 1, color: p.ink, fontSize: 15, lineHeight: 21 }}>{`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}\n${monthYear}`}</Text>
      <View style={{ marginLeft: "auto" }}>
        <MoneyText text={money(total)} value={total} size={17} />
      </View>
    </View>
  );
}

// The strip under the period bar while filters are on.
export function FilteredBanner({ onChange, onClear }: { onChange: () => void; onClear: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", marginTop: 4, marginHorizontal: 16, marginBottom: 10, minHeight: 40, borderWidth: 1, borderColor: p.accent, borderRadius: 12, overflow: "hidden" }}>
      <View style={{ justifyContent: "center", marginLeft: 12, marginRight: 8 }}>
        <Icon name="info" size={20} color={p.accentInk} />
      </View>
      <Pressable accessibilityRole="button" onPress={onChange} style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ color: p.ink, fontSize: 13 }}>{t.t("Filtered data")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Clear filters")} onPress={onClear} style={{ width: 56, alignItems: "center", justifyContent: "center", backgroundColor: alpha(p.negative, 0.14) }}>
        <Icon name="filterOff" size={22} color={p.negative} />
      </Pressable>
    </View>
  );
}
