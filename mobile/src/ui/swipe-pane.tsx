// A horizontal swipe on a screen (js/app/swipe.js): the page follows the finger, and past a third
// of the width (or a quick flick) it slides out and the next one slides in from the other side.
// `go(direction)` moves to the next page and returns false at an edge, where the page only gives
// a little, as on a rubber band.
import { useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, View } from "react-native";
import { gestureLock } from "./gesture-lock.ts";

const SLIDE_MS = 200;

export function SwipePane({ children, go, canGo }: { children: ReactNode; go: (direction: 1 | -1) => void; canGo: (direction: 1 | -1) => boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(Dimensions.get("window").width);
  const busy = useRef(false);
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
        Animated.timing(x, { toValue: -direction * width.current, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          latest.current.go(direction);
          x.setValue(direction * width.current * 0.35);
          Animated.timing(x, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            busy.current = false;
          });
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
