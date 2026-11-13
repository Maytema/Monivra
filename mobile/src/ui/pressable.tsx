// The one Pressable of the application, and the one place that decides how a touch looks. A touch on a tile,
// a row or a button shows nothing: React Native reports "pressed" at the very moment a finger lands — also
// when that touch starts a scroll or a swipe — so anything drawn from it flashed on every touch while the
// person only moved the list. Only a long press selects, and a keypad key (`feedback`) lights at once, as
// in the first application where only the keys and the small round buttons had a touched state.
// Every screen imports Pressable from this file (scripts/check-boundaries.mjs refuses react-native's own).
import { Pressable as NativePressable, type PressableProps, type PressableStateCallbackType } from "react-native";

export function Pressable({ feedback = false, style, ...props }: PressableProps & { feedback?: boolean }) {
  const quiet = typeof style === "function" && !feedback ? (state: PressableStateCallbackType) => style({ ...state, pressed: false }) : style;
  return <NativePressable style={quiet} {...props} />;
}
