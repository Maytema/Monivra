// The sheet that starts an operation (js/screens/operations/add-menu.js): three tabs — Incomes,
// Expenses, Accounts (a transfer) — each a grid of what to start from. Choosing is the only way into
// the editor; switching tabs or closing never creates an operation. The tabs also swipe.
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { accountBalance, categoryById, defaultAccountId } from "../domain/ledger.ts";
import type { LedgerData } from "../domain/types.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";
import type { EditorDraft } from "./editor/session.ts";

const DIRECTIONS = ["income", "expense", "accounts"] as const;
type Direction = (typeof DIRECTIONS)[number];
const LABELS: Record<Direction, string> = { income: "Incomes", expense: "Expenses", accounts: "Accounts" };

// `scheduled` starts a scheduled payment with the date, time, repeat and reminder already chosen.
export type SchedulePreset = Pick<EditorDraft, "date" | "time" | "recur" | "reminder">;
export const openAddMenu = (scheduled?: SchedulePreset): number => sheets.open(<AddMenu scheduled={scheduled} />, "sheet", { bare: true });

// What an item of a tab shows under its name: the balance of an account, the sum of a category.
function figure(data: LedgerData, direction: Direction, id: string): number {
  if (direction === "accounts") return accountBalance(data, id);
  return data.ops.filter((o) => o.category === id || categoryById(data, o.category)?.parent === id).reduce((n, o) => n + o.amount, 0);
}

function AddMenu({ scheduled }: { scheduled: SchedulePreset | undefined }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const close = useCloseLayer();
  const scroller = useRef<{ scrollTo: (to: { x: number; animated: boolean }) => void } | null>(null);
  const [width, setWidth] = useState(0);
  const [direction, setDirection] = useState<Direction>("expense");
  const choose = (dir: Direction, id: string) => {
    close();
    const account = defaultAccountId(data, dir === "accounts" ? id : null) ?? undefined;
    const extra = scheduled ? { scheduled: true, preset: scheduled } : {};
    if (dir === "expense") openEditor({ type: "expense", category: id, from: account ?? null, ...extra });
    else if (dir === "income") openEditor({ type: "income", category: id, to: account ?? null, ...extra });
    else openEditor({ type: "transfer", from: id, to: account ?? null, ...extra });
  };
  const go = (dir: Direction) => {
    setDirection(dir);
    scroller.current?.scrollTo({ x: DIRECTIONS.indexOf(dir) * width, animated: true });
  };
  const items = (dir: Direction) => (dir === "accounts" ? data.accounts.filter((a) => !a.archived) : data.categories.filter((c) => !c.archived && !c.parent && c.type === dir));
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={{ color: p.ink, fontSize: 23, textAlign: "center", marginTop: 14, marginBottom: 16 }}>{t.t("Add an operation")}</Text>
      <View style={{ flexDirection: "row", minHeight: 58, borderBottomWidth: 1, borderBottomColor: p.line }}>
        {DIRECTIONS.map((id) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: direction === id }} onPress={() => go(id)} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 5, borderBottomWidth: 3, borderBottomColor: direction === id ? p.accent : "transparent", marginBottom: -1 }}>
            <Text style={{ color: p.ink, fontSize: 15, fontWeight: direction === id ? "600" : "500" }}>{t.t(LABELS[id])}</Text>
          </Pressable>
        ))}
      </View>
      {width ? (
        <ScrollView
          ref={(node) => {
            scroller.current = node;
          }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: DIRECTIONS.indexOf(direction) * width, y: 0 }}
          onMomentumScrollEnd={(e) => setDirection(DIRECTIONS[Math.round(e.nativeEvent.contentOffset.x / width)] ?? "expense")}
        >
          {DIRECTIONS.map((dir) => (
            <View key={dir} style={{ width, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 38 }}>
              {items(dir).map((item) => {
                const currency = "currency" in item ? item.currency : data.settings.currency;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => choose(dir, item.id)}
                    style={({ pressed }) => ({ width: (width - 32 - 12) / 2, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 6, borderWidth: 1, borderColor: p.line, borderRadius: 17, backgroundColor: pressed ? p.soft : p.key })}
                  >
                    <ToneBadge icon={item.icon} color={item.color} size={45} iconSize={24} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15 }}>
                        {item.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: p.ink, opacity: 0.6, fontSize: 17, marginTop: 2 }}>
                        {money(figure(data, dir, item.id), currency)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
