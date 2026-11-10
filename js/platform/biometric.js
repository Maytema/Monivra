/* Biometric unlock of the screen lock. It exists only in the Android shell, which asks the system
   fingerprint or face prompt; a browser has no way to guard a local screen with a fingerprint (the
   only route, WebAuthn, proves a person to a server), and a dialog pretending to be one would be a
   lie, so there it is not offered at all.
   What it is: a quicker way to open the lock screen, next to the PIN, which always stays as the
   fallback. What it is not: the data is not encrypted with it, no fingerprint or face is ever read
   or kept by this application (the system answers yes or no), and it is not an account. */
import { native } from "./native.js";

// "available", "not_enrolled" (the device can, but no fingerprint or face is set up), or
// "unsupported" (no sensor, no system support, or a browser).
let state = "unsupported";

// Asks the system what it can do now; called at the start and whenever the application returns, as
// the person may have set up a fingerprint meanwhile.
export async function refreshBiometric() {
  if (!native) return state;
  try {
    state = (await native.biometricStatus()).status;
  } catch {
    state = "unsupported";
  }
  return state;
}
export const biometricState = () => state;
// Can the prompt be shown right now?
export const biometricAvailable = () => state === "available";

// Shows the system prompt. Resolves with
//   "ok"        the system recognised the person,
//   "cancelled" the person closed the prompt or chose the PIN,
//   "lockout"   too many failed attempts: the system refuses for a while,
//   "failed"    the prompt could not be shown (nothing enrolled, no sensor, a system error).
// The texts are given in the language of the application.
export async function verifyBiometric(texts) {
  if (!native) return "failed";
  try {
    return (await native.biometricAuthenticate(texts)).result;
  } catch {
    return "failed";
  }
}
