// The one Pressable of the application, and the one place that decides how a touch looks. A touch on a tile,
// a row or a button shows nothing: React Native reports "pressed" at the very moment a finger lands — also
// when that touch starts a scroll or a swipe — so anything drawn from it flashed on every touch while the
// person only moved the list. Only a long press selects, and a keypad key (`feedback`) lights at once, as
// in the first application where only the keys and the small round buttons had a touched state.
// `squish`: a small round button (the eye of the balance) shrinks to that scale while held and springs back,
// as `:active` does in the first application; it moves with the native driver, no redraw.
// Every screen imports Pressable from this file (scripts/check-boundaries.mjs refuses react-native's own).
import { useRef } from "react";
import { Animated, Pressable as NativePressable, type GestureResponderEvent, type PressableProps, type PressableStateCallbackType } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

function Squishy({ squish, style, onPressIn, onPressOut, ...props }: PressableProps & { squish: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <AnimatedPressable
      {...props}
      style={[typeof style === "function" ? style({ pressed: false }) : style, { transform: [{ scale }] }]}
      onPressIn={(e: GestureResponderEvent) => {
        Animated.timing(scale, { toValue: squish, duration: 90, useNativeDriver: true }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        Animated.spring(scale, { toValue: 1, friction: 3.5, tension: 220, useNativeDriver: true }).start();
        onPressOut?.(e);
      }}
    />
  );
}

export function Pressable({ feedback = false, squish, style, ...props }: PressableProps & { feedback?: boolean; squish?: number }) {
  if (squish) return <Squishy squish={squish} style={style} {...props} />;
  const quiet = typeof style === "function" && !feedback ? (state: PressableStateCallbackType) => style({ ...state, pressed: false }) : style;
  return <NativePressable style={quiet} {...props} />;
}
