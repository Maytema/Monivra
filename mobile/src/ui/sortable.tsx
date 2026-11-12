// Reordering by hand (js/app/drag-reorder.js): a long press (380 ms) lifts an item, tilted a little;
// moving the finger carries it, the others slide out of its way, and letting go keeps the new order.
// Lists and grids both work: the slot is the one whose centre is nearest to the lifted item.
import { useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Vibration, View, type StyleProp, type ViewStyle } from "react-native";
import { gestureLock } from "./gesture-lock.ts";

const HOLD_MS = 380;
const MOVE_TOLERANCE = 10;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Touch {
  nativeEvent: { pageX: number; pageY: number };
}

export interface SortableProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  // `ignoreTap()` is true for a moment after a drag: the press that ends it must not open anything.
  render: (item: T, ignoreTap: () => boolean) => ReactNode;
  onReorder: (keys: string[]) => void;
  // Called with true while an item is lifted, so the scroll view around can stand still.
  onHold?: (held: boolean) => void;
  style?: StyleProp<ViewStyle>;
  // Wrapper style of every item (for a grid: the width of a cell).
  itemStyle?: StyleProp<ViewStyle>;
  // Items that stay where they are (for example archived ones).
  fixed?: (item: T) => boolean;
}

export function Sortable<T>({ items, keyOf, render, onReorder, onHold, style, itemStyle, fixed }: SortableProps<T>) {
  const rects = useRef(new Map<string, Rect>());
  const shifts = useRef(new Map<string, Animated.ValueXY>());
  const press = useRef<{ key: string; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const drag = useRef<{ key: string; keys: string[]; home: number; slot: number; x: number; y: number } | null>(null);
  const recent = useRef(false);
  const [lifted, setLifted] = useState<string | null>(null);
  const shiftOf = (key: string): Animated.ValueXY => {
    let value = shifts.current.get(key);
    if (!value) {
      value = new Animated.ValueXY({ x: 0, y: 0 });
      shifts.current.set(key, value);
    }
    return value;
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const start = (key: string) => {
    const keys = items.map(keyOf);
    const found = press.current;
    press.current = null;
    if (!found) return;
    Vibration.vibrate(18);
    drag.current = { key, keys, home: keys.indexOf(key), slot: keys.indexOf(key), x: found.x, y: found.y };
    gestureLock.set(true);
    onHold?.(true);
    setLifted(key);
  };
  const move = (px: number, py: number) => {
    const d = drag.current;
    if (!d) return;
    const dx = px - d.x;
    const dy = py - d.y;
    shiftOf(d.key).setValue({ x: dx, y: dy });
    const rs = d.keys.map((k) => rects.current.get(k));
    const home = rs[d.home];
    if (!home || rs.some((r) => !r)) return;
    const cx = home.x + home.width / 2 + dx;
    const cy = home.y + home.height / 2 + dy;
    let slot = d.home;
    let best = Infinity;
    rs.forEach((r, i) => {
      if (!r) return;
      const distance = Math.hypot(cx - (r.x + r.width / 2), cy - (r.y + r.height / 2));
      if (distance < best) [slot, best] = [i, distance];
    });
    if (slot === d.slot) return;
    d.slot = slot;
    const order = d.keys.map((_, i) => i);
    order.splice(slot, 0, ...order.splice(d.home, 1));
    d.keys.forEach((k, i) => {
      if (k === d.key) return;
      const from = rs[i];
      const to = rs[order.indexOf(i)];
      if (!from || !to) return;
      Animated.timing(shiftOf(k), { toValue: { x: to.x - from.x, y: to.y - from.y }, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };
  const finish = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const next = [...d.keys];
    next.splice(d.slot, 0, ...next.splice(d.home, 1));
    for (const value of shifts.current.values()) {
      value.stopAnimation();
      value.setValue({ x: 0, y: 0 });
    }
    gestureLock.set(false);
    onHold?.(false);
    setLifted(null);
    recent.current = true;
    setTimeout(() => (recent.current = false), 600);
    if (commit && d.slot !== d.home) onReorder(next);
  };
  const ignoreTap = () => recent.current;
  return (
    <View style={style}>
      {items.map((item) => {
        const key = keyOf(item);
        const on = lifted === key;
        const still = fixed?.(item) ?? false;
        return (
          <Animated.View
            key={key}
            onLayout={(e: { nativeEvent: { layout: Rect } }) => rects.current.set(key, e.nativeEvent.layout)}
            onTouchStart={
              still
                ? undefined
                : (e: Touch) => {
                    cancelPress();
                    press.current = { key, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, timer: setTimeout(() => start(key), HOLD_MS) };
                  }
            }
            onTouchMove={(e: Touch) => {
              if (drag.current) move(e.nativeEvent.pageX, e.nativeEvent.pageY);
              else if (press.current && Math.hypot(e.nativeEvent.pageX - press.current.x, e.nativeEvent.pageY - press.current.y) > MOVE_TOLERANCE) cancelPress();
            }}
            onTouchEnd={() => {
              cancelPress();
              finish(true);
            }}
            onTouchCancel={() => {
              cancelPress();
              finish(false);
            }}
            style={[itemStyle, { zIndex: on ? 10 : 0, elevation: on ? 8 : 0, transform: [{ translateX: shiftOf(key).x }, { translateY: shiftOf(key).y }, { rotate: on ? "-3deg" : "0deg" }, { scale: on ? 1.03 : 1 }] }]}
          >
            {render(item, ignoreTap)}
          </Animated.View>
        );
      })}
    </View>
  );
}
