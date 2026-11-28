// The one Pressable of the application, and the one place that decides how a touch looks. A touch on a tile,
// a row or a button shows nothing: React Native reports "pressed" at the very moment a finger lands — also
// when that touch starts a scroll or a swipe — so anything drawn from it flashed on every touch while the
// person only moved the list. Only a long press selects, and a keypad key (`feedback`) lights at once, as
// in the first application where only the keys and the small round buttons had a touched state.
// `squish`: a small round button (the eye of the balance) shrinks to that scale while held and springs back,
// as `:active` does in the first application; it moves with the native driver, no redraw.
// Every screen imports Pressable from this file (scripts/check-boundaries.mjs refuses react-native's own).
import { useRef } from "react";
import { usePalette } from "./app-context.tsx";
import { pagerBusy } from "./swipe-busy.ts";
import { Animated, Easing, Pressable as NativePressable, type GestureResponderEvent, type PressableProps, type PressableStateCallbackType } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

function Squishy({ squish, style, onPressIn, onPressOut, children, ...props }: PressableProps & { squish: number }) {
  const p = usePalette();
  const scale = useRef(new Animated.Value(1)).current;
  // A thin ring shows while the button is held, like a key that is pressed.
  const ring = useRef(new Animated.Value(0)).current;
  return (
    <AnimatedPressable
      {...props}
      style={[typeof style === "function" ? style({ pressed: false }) : style, { transform: [{ scale }] }]}
      onPressIn={(e: GestureResponderEvent) => {
        Animated.timing(scale, { toValue: squish, duration: 90, useNativeDriver: true }).start();
        Animated.timing(ring, { toValue: 1, duration: 90, useNativeDriver: true }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        Animated.timing(ring, { toValue: 0, duration: 180, useNativeDriver: true }).start();
        onPressOut?.(e);
      }}
    >
      {typeof children === "function" ? children({ pressed: false }) : children}
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 10, borderWidth: 1, borderColor: p.accent, opacity: ring }} />
    </AnimatedPressable>
  );
}

// A touch held longer than a long press (a person who pressed, thought better of it and waited) is not a tap: letting
// go does nothing. A press with its own long-press action never taps after it either (React Native's rule).
const HELD_MS = 450;
// A touch that ended far from where it began is a swipe, not a tap, whatever React Native reports: the emulator's `input swipe`
// (and a flick while the JavaScript thread is stalled) can reach a tile as a touch down and a touch up with no move between,
// and the tile then opened its page (a tile of Statistics pushed its screen during a swipe).
const TRAVEL = 16;
function Held({ feedback, onPressIn, onPress, ...props }: PressableProps & { feedback: boolean }) {
  const since = useRef(0);
  const from = useRef({ x: 0, y: 0 });
  return (
    <NativePressable
      {...props}
      onPressIn={(e: GestureResponderEvent) => {
        since.current = Date.now();
        from.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        onPressIn?.(e);
      }}
      onPress={onPress && !feedback ? (e: GestureResponderEvent) => {
        const moved = Math.hypot(e.nativeEvent.pageX - from.current.x, e.nativeEvent.pageY - from.current.y) > TRAVEL;
        return Date.now() - since.current > HELD_MS || pagerBusy() || moved ? undefined : onPress(e);
      } : onPress}
    />
  );
}

// No press blocks the platform's own gestures (blockNativeResponder off): a row of a list held by a finger had told
// its parents not to take the touch, so the period deck could not start a sideways swipe that began on a row, and
// the finger lifted far away was then taken for a tap on the row. Now the deck or the list takes the touch as soon
// as it moves, and the press is cancelled.
export function Pressable({ feedback = false, squish, style, ...props }: PressableProps & { feedback?: boolean; squish?: number }) {
  const free = { blockNativeResponder: false, ...props } as PressableProps;
  if (squish) return <Squishy squish={squish} style={style} {...free} />;
  const quiet = typeof style === "function" && !feedback ? (state: PressableStateCallbackType) => style({ ...state, pressed: false }) : style;
  return <Held feedback={feedback} style={quiet} {...free} />;
}
