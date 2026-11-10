/* What the Android shell needs before the application reads its data: the internal copy of the data
   (when the stored data is gone), the PIN verifier from the system storage, and what the system
   says about biometrics and notifications. Everything here fails soft: if the shell cannot answer,
   the application starts with what it has. */
import { native } from "./native.js";
import { restoreFromMirror } from "./native-sync.js";
import { loadSealedPin } from "./secure-pin.js";
import { refreshBiometric } from "./biometric.js";
import { refreshNotificationPermission } from "./notify.js";

// What happened to the data at the start, for the person to be told once ("restored", "unreadable").
export const boot = { data: "none" };

export async function prepareNative() {
  if (!native) return;
  try {
    boot.data = await restoreFromMirror();
  } catch {
    boot.data = "none";
  }
  await Promise.allSettled([loadSealedPin(), refreshBiometric(), refreshNotificationPermission()]);
}
