// A page that is a layer over the whole screen (a step of a flow): back arrow, title, a scrolling body
// and buttons pinned under it, as the pages of the first application (pageHeader + page-footer).
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { useCloseLayer } from "./sheets.tsx";

export function FullPage({ title, children, footer, scroll = true }: { title: string; children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t("Back")} onPress={close} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={24} color={p.ink} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 22, marginRight: 44 }}>
          {t.t(title)}
        </Text>
      </View>
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 }}>{footer}</View> : null}
    </View>
  );
}

// A small table that scrolls sideways: the columns of a file and its first rows.
export function MiniTable({ head, rows, width = 120, problem }: { head: readonly string[]; rows: readonly (readonly string[])[]; width?: number; problem?: (row: number) => string | null }) {
  const p = usePalette();
  const cell = (text: string, key: number, strong = false, span = 1) => (
    <Text key={key} numberOfLines={2} style={{ width: width * span, paddingHorizontal: 8, paddingVertical: 8, color: strong ? p.ink : p.inkSoft, fontSize: 13, fontWeight: strong ? "600" : "400" }}>
      {text}
    </Text>
  );
  return (
    <ScrollView horizontal style={{ borderRadius: 12, borderWidth: 1, borderColor: p.line }}>
      <View>
        <View style={{ flexDirection: "row", backgroundColor: p.sheet }}>{head.map((c, i) => cell(c, i, true))}</View>
        {rows.map((row, r) => {
          const bad = problem?.(r);
          return (
            <View key={r} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: p.line }}>
              {bad ? (
                <>
                  {cell(row[0] ?? "", 0)}
                  <Text style={{ width: width * (head.length - 1), paddingHorizontal: 8, paddingVertical: 8, color: p.negativeInk, fontSize: 13 }}>{bad}</Text>
                </>
              ) : (
                row.map((c, i) => cell(c, i))
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
