// The one Pressable of the application. React Native shows the pressed state at the very moment a finger
// touches down — also when that touch is the start of a scroll or a swipe, so tiles, rows and buttons
// flashed on every touch while the person only moved the list. Here the pressed state starts after a short
// delay: a scroll or swipe takes the touch before it, a tap or a hold still shows its feedback. Every
// screen imports Pressable from this file (scripts/check-boundaries.mjs refuses react-native's own).
import { Pressable as NativePressable, type PressableProps, type View } from "react-native";
import type { Ref } from "react";

export const PRESS_FEEDBACK_DELAY_MS = 110;

export function Pressable({ ref, ...props }: PressableProps & { ref?: Ref<View> }) {
  return <NativePressable ref={ref} unstable_pressDelay={PRESS_FEEDBACK_DELAY_MS} {...props} />;
}
