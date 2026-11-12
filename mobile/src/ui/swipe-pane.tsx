// A horizontal swipe on a screen (js/app/swipe.js): the page follows the finger, and past a third
// of the width (or a quick flick) it slides out and the next one slides in from the other side.
// `go(direction)` moves to the next page and returns false at an edge, where the page only gives
// a little, as on a rubber band.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, View } from "react-native";
import { gestureLock } from "./gesture-lock.ts";

const OUT_MS = 140;
const IN_MS = 180;

// `page` names what is shown (the period, the tab): the next page slides in only once it is drawn, so
// the old content never comes back for a moment before it changes.
export function SwipePane({ children, go, canGo, page }: { children: ReactNode; go: (direction: 1 | -1) => void; canGo: (direction: 1 | -1) => boolean; page: string }) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(Dimensions.get("window").width);
  const busy = useRef(false);
  const coming = useRef<1 | -1 | null>(null);
  useLayoutEffect(() => {
    const direction = coming.current;
    if (direction === null) return;
    coming.current = null;
    x.setValue(direction * width.current * 0.3);
    Animated.timing(x, { toValue: 0, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      busy.current = false;
    });
  }, [page, x]);
  const latest = useRef({ go, canGo });
  latest.current = { go, canGo };
  const pan = useRef(
    PanResponder.create({
      // A clearly horizontal drag is taken; a vertical one stays with the lists.
      onMoveShouldSetPanResponderCapture: (_e, g) => !busy.current && !gestureLock.held && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_e, g) => {
        const direction = g.dx < 0 ? 1 : -1;
        const room = latest.current.canGo(direction);
        x.setValue(room ? g.dx : Math.sign(g.dx) * Math.min(28, 28 * (1 - Math.exp(-Math.abs(g.dx) / 95))));
      },
      onPanResponderRelease: (_e, g) => {
        const direction = g.dx < 0 ? 1 : -1;
        const far = Math.abs(g.dx) > Math.max(48, width.current * 0.27) || (Math.abs(g.dx) > 30 && Math.abs(g.vx) > 0.5);
        if (!far || !latest.current.canGo(direction)) {
          Animated.timing(x, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
          return;
        }
        busy.current = true;
        // Out from where the finger left it, at the speed of the flick; the new page comes in when drawn.
        const left = width.current - Math.abs(g.dx);
        const duration = Math.max(70, Math.min(OUT_MS, Math.abs(g.vx) > 0.1 ? left / Math.abs(g.vx) : OUT_MS));
        Animated.timing(x, { toValue: -direction * width.current, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          coming.current = direction;
          latest.current.go(direction);
          // Should nothing change after all, the page comes back instead of staying away.
          setTimeout(() => {
            if (coming.current === null) return;
            coming.current = null;
            Animated.timing(x, { toValue: 0, duration: IN_MS, useNativeDriver: true }).start(() => (busy.current = false));
          }, 800);
        });
      },
      onPanResponderTerminate: () => {
        Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      },
    }),
  ).current;
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e: { nativeEvent: { layout: { width: number } } }) => {
        width.current = e.nativeEvent.layout.width || width.current;
      }}
      {...pan.panHandlers}
    >
      <Animated.View style={{ flex: 1, transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}
