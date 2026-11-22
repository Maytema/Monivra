// Choosing several items of a list to act on them together (scheduled payments, budgets): a long press starts the
// choice with that item, a tap then adds or takes away an item, the header shows how many are chosen with "select
// all" and "delete", and the cross or the system Back leaves the choice. The operations keep their own (with the
// period and the bulk changes).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, Text, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import { haptic } from "../platform/haptics.ts";
import { Icon } from "./kit.tsx";
import { Pressable } from "./pressable.tsx";

export interface Selection {
  on: boolean;
  chosen: ReadonlySet<string>;
  // A long press on an item: starts the choice with it (or adds it).
  hold(id: string): void;
  // A tap on an item while choosing: adds it or takes it away.
  toggle(id: string): void;
  clear(): void;
}

export function useSelection(): Selection {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [on, setOn] = useState(false);
  const clear = () => (setOn(false), setChosen(new Set()));
  const live = useRef({ on, clear });
  live.current = { on, clear };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (live.current.on ? (live.current.clear(), true) : false));
    return () => sub.remove();
  }, []);
  const toggle = (id: string) =>
    setChosen((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      if (!next.size) setOn(false);
      return next;
    });
  const hold = (id: string) => {
    if (!on) haptic("tick");
    setOn(true);
    setChosen((was) => new Set([...was, id]));
  };
  return { on, chosen, hold, toggle, clear };
}

// The header of the page: while choosing, how many are chosen, "select all" and "delete" (and a cross to leave);
// otherwise the page's own title and buttons (`normal`), the cross taken away again.
export function useSelectionHeader(selection: Selection, all: readonly string[], onDelete: (ids: string[]) => void, normal: { title: string; headerRight?: () => ReactNode }): object {
  const p = usePalette();
  const t = useT();
  if (!selection.on) return { ...normal, headerLeft: undefined };
  const everything = all.length > 0 && all.every((id) => selection.chosen.has(id));
  const button = (icon: string, label: string, onPress: () => void, color = p.ink) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={24} color={color} />
    </Pressable>
  );
  return {
    title: t.t("Selected: {n}", { n: selection.chosen.size }),
    headerLeft: () => button("close", "Exit selection", selection.clear),
    headerRight: () => (
      <View style={{ flexDirection: "row" }}>
        {button("clipboardList", everything ? "Deselect all" : "Select all", () => (everything ? selection.clear() : all.forEach((id) => !selection.chosen.has(id) && selection.toggle(id))))}
        {button("trash", "Delete", () => onDelete([...selection.chosen]), p.negativeInk)}
      </View>
    ),
  };
}

// The mark of a chosen item, over its card's corner.
export function ChosenMark({ chosen }: { chosen: boolean }): ReactNode {
  const p = usePalette();
  return (
    <View style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: chosen ? p.accent : p.muted, backgroundColor: chosen ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
      {chosen ? <Text style={{ color: p.bg, fontSize: 14, fontWeight: "700", lineHeight: 16 }}>✓</Text> : null}
    </View>
  );
}
