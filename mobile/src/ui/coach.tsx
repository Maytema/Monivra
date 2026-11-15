// The introduction tour: the screen is dimmed, only the element being explained stays lit, and a short text under or
// over it says what it is for. A tap anywhere goes to the next step. Elements register themselves by name
// (`useCoachTarget`); a step may first move to another tab. Only the main things are shown, on purpose.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { Pressable } from "./pressable.tsx";
import { usePalette, useT } from "./app-context.tsx";

interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}
export interface TourStep {
  target: string;
  text: string;
  tab?: string;
}

const targets = new Map<string, Set<Measurable>>();
type Tour = { steps: readonly TourStep[]; index: number } | null;
let tour: Tour = null;
const listeners = new Set<() => void>();
const publish = (next: Tour) => {
  tour = next;
  for (const l of listeners) l();
};

// The same name may be drawn more than once (the neighbouring pages of a pager); the one on screen is lit. A ref
// callback per place that is drawn: `coachRef("name")` gives the ref for one element (called again, it gives another one
// for another element, so use `useCoachTarget` inside a component and `coachRefs` for lists).
function makeRef(name: string): (node: unknown) => void {
  let last: Measurable | null = null;
  return (node: unknown) => {
    if (last) targets.get(name)?.delete(last);
    last = (node as Measurable | null) ?? null;
    if (last) {
      const set = targets.get(name) ?? new Set<Measurable>();
      set.add(last);
      targets.set(name, set);
    }
  };
}
export function useCoachTarget(name: string): (node: unknown) => void {
  return useMemo(() => makeRef(name), [name]);
}
const shared = new Map<string, (node: unknown) => void>();
// For elements made in a loop, where a hook cannot be called: one stable ref per name (the elements are not repeated).
export const coachRef = (name: string): ((node: unknown) => void) => {
  let ref = shared.get(name);
  if (!ref) shared.set(name, (ref = makeRef(name)));
  return ref;
};

export const startTour = (steps: readonly TourStep[]) => publish({ steps, index: 0 });
const stop = () => publish(null);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(name: string, width: number): Promise<Rect | null> {
  const nodes = [...(targets.get(name) ?? [])];
  return Promise.all(
    nodes.map(
      (node) =>
        new Promise<Rect | null>((resolve) => {
          try {
            node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 && x >= -1 && x + w <= width + 1 ? { x, y, w, h } : null));
          } catch {
            resolve(null);
          }
        }),
    ),
  ).then((all) => all.find((r) => r) ?? null);
}

export function CoachHost() {
  const current = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => tour,
  );
  if (!current) return null;
  return <Step key={current.index} tour={current} />;
}

function Step({ tour: { steps, index } }: { tour: NonNullable<Tour> }) {
  const p = usePalette();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const step = steps[index]!;
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    let alive = true;
    if (step.tab) router.navigate(step.tab as "/categories");
    // The tab may still be drawing: ask a few times until the element is on screen.
    const ask = async (left: number) => {
      const found = await measure(step.target, width);
      if (!alive) return;
      if (found) setRect(found);
      else if (left > 0) setTimeout(() => ask(left - 1), 150);
      else next();
    };
    const first = setTimeout(() => ask(12), step.tab ? 350 : 0);
    return () => {
      alive = false;
      clearTimeout(first);
    };
  }, []);
  const last = index === steps.length - 1;
  function next() {
    if (last) stop();
    else publish({ steps, index: index + 1 });
  }
  if (!rect) return <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="auto" />;
  const pad = 6;
  const hole = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const dim = "rgba(0,0,0,0.62)";
  const below = hole.y + hole.h + 190 < height;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t("Next")} onPress={next} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, height: hole.y, backgroundColor: dim }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: hole.y + hole.h, right: 0, bottom: 0, backgroundColor: dim }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: dim }} />
      <View pointerEvents="none" style={{ position: "absolute", left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h, backgroundColor: dim }} />
      <View pointerEvents="none" style={{ position: "absolute", left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 14, borderWidth: 2, borderColor: p.accent }} />
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 16, right: 16, ...(below ? { top: hole.y + hole.h + 14 } : { bottom: height - hole.y + 14 }), backgroundColor: p.sheet, borderRadius: 16, padding: 16, gap: 10 }}
      >
        <Text style={{ color: p.ink, fontSize: 16, lineHeight: 22 }}>{t.t(step.text)}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: p.muted, fontSize: 13 }}>{`${index + 1} / ${steps.length}`}</Text>
          <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: "600" }}>{t.t(last ? "Done" : "Next")}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Skip")} onPress={stop} style={{ position: "absolute", right: 12, top: 40, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)" }}>
        <Text style={{ color: "#ffffff", fontSize: 14 }}>{t.t("Skip")}</Text>
      </Pressable>
    </Pressable>
  );
}
