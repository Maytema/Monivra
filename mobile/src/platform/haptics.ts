// Touch signals (a short vibration), the one place that gives them. They are for moments that matter, not
// for every tap: something picked up or selected ("tick"), an important thing done ("success"), a dangerous
// question ("warning"), a refusal such as a wrong PIN ("error"). The phone's setting for touch vibration
// decides whether they are felt.
import { Vibration } from "react-native";
import { nativeHaptic } from "./native.ts";

export type Haptic = "tick" | "success" | "warning" | "error";

// Used when the application's own module is absent (an older build): plain vibrations of about the same length.
const PLAIN: Record<Haptic, number | number[]> = { tick: 15, success: 25, warning: 25, error: [0, 30, 70, 30] };

export function haptic(kind: Haptic): void {
  if (nativeHaptic(kind)) return;
  try {
    Vibration.vibrate(PLAIN[kind]);
  } catch {
    // A phone that cannot vibrate stays silent.
  }
}
