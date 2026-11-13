// Shows where a thing is (js/ui/spotlight.js): the rows of the operations just saved or looked for sit in a
// thin accent outline with a soft tint that fades out, once. Rows wear `Spot`; whoever scrolls the list to
// them reads `useSpotlit`.
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import { usePalette } from "./app-context.tsx";
import { mix } from "./theme.ts";

// How long the highlight lasts.
const SPOT_MS = 2600;
const NONE: readonly string[] = [];
let lit: readonly string[] = NONE;
let turn = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const publish = () => listeners.forEach((l) => l());

export function spotlight(ids: readonly string[]): void {
  lit = [...ids];
  const mine = ++turn;
  publish();
  setTimeout(() => {
    if (mine !== turn) return;
    lit = NONE;
    publish();
  }, SPOT_MS);
}

// The operations that are lit now (for the one who scrolls to them).
export const useSpotlit = (): readonly string[] => useSyncExternalStore(subscribe, () => lit);

function Glow({ reach }: { reach: number }) {
  const p = usePalette();
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 0, duration: SPOT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, bottom: -reach, left: -9, right: -9, borderRadius: 16, borderWidth: 1.5, borderColor: mix(p.accent, p.bg, 0.26), backgroundColor: mix(p.accent, p.bg, 0.05), opacity: fade }}
    />
  );
}

export function Spot({ id, reach = 0, children }: { id: string; reach?: number; children: ReactNode }) {
  const on = useSyncExternalStore(subscribe, () => lit.includes(id));
  return (
    <View>
      {on ? <Glow reach={reach} /> : null}
      {children}
    </View>
  );
}
